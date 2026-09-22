-- WoW Forever Atlas — canonical schema, per docs/DATA_MODEL.md.
-- Requires PostgreSQL 14+ and PostGIS 3+.
--
-- Design notes:
--  * atlas_id is a formatted text primary key ("atlas_<type>_<6-digit seq>"),
--    generated from a per-type sequence via a trigger — never a Blizzard/
--    ATT/QuestieDB ID (see docs/DATA_MODEL.md's founding rule).
--  * External IDs live only in external_reference, never as a table's PK.
--  * Location.geom uses SRID 0 (an undefined/local Cartesian plane) — WoW
--    world coordinates are not real-world geodetic coordinates, so the
--    PostGIS `geography` type (which requires a real geodetic SRID) is the
--    wrong tool here; plain `geometry` with a flat, local coordinate space
--    is correct and still gets full GiST spatial-index support.
--  * Provenance is append-only (provenance_record), never overwritten in
--    place — see docs/DATA_PROVENANCE.md.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Atlas ID generation
-- ---------------------------------------------------------------------------

CREATE TABLE atlas_id_sequence (
  entity_type text PRIMARY KEY,
  next_value bigint NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION next_atlas_id(p_entity_type text) RETURNS text AS $$
DECLARE
  v_seq bigint;
BEGIN
  INSERT INTO atlas_id_sequence (entity_type, next_value)
  VALUES (p_entity_type, 2)
  ON CONFLICT (entity_type) DO UPDATE SET next_value = atlas_id_sequence.next_value + 1
  RETURNING next_value - 1 INTO v_seq;
  RETURN 'atlas_' || p_entity_type || '_' || lpad(v_seq::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Provenance (docs/DATA_PROVENANCE.md) — one row per (entity, source, field-set)
-- observation. Append-only: a re-import inserts a new row, never updates one.
-- ---------------------------------------------------------------------------

CREATE TYPE provenance_source AS ENUM (
  'wago_db2', 'att', 'questiedb', 'forever_quest_pins', 'atlas_telemetry', 'manual_curation'
);
CREATE TYPE provenance_confidence AS ENUM ('verified', 'inferred', 'unverified');

CREATE TABLE provenance_record (
  id bigserial PRIMARY KEY,
  atlas_entity_type text NOT NULL,
  atlas_id text NOT NULL,
  source provenance_source NOT NULL,
  source_url text,
  source_id_type text NOT NULL,
  source_id text NOT NULL,
  source_version text,
  build_number text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  confidence provenance_confidence NOT NULL,
  transformation text,
  attribution_required boolean NOT NULL DEFAULT false,
  attribution_text text
);
CREATE INDEX provenance_record_entity_idx ON provenance_record (atlas_entity_type, atlas_id);

-- Cross-reference table (docs/ENTITY_MATCHING.md) — the *matching* layer,
-- distinct from provenance (a fact's origin) even though the fields overlap;
-- kept separate because a reference can exist (and be reviewed) before any
-- field data has actually been merged from that source.
CREATE TYPE match_confidence AS ENUM ('verified', 'inferred', 'unverified');
CREATE TABLE external_reference (
  id bigserial PRIMARY KEY,
  atlas_entity_type text NOT NULL,
  atlas_id text NOT NULL,
  source provenance_source NOT NULL,
  source_id_type text NOT NULL,
  source_id text NOT NULL,
  source_build text,
  confidence match_confidence NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id_type, source_id, atlas_entity_type)
);

CREATE TABLE entity_review_queue (
  id bigserial PRIMARY KEY,
  candidate_a_ref bigint REFERENCES external_reference (id),
  candidate_b_ref bigint REFERENCES external_reference (id),
  ambiguity_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed_same', 'confirmed_different')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Geography
-- ---------------------------------------------------------------------------

CREATE TABLE continent (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('continent'),
  name text NOT NULL,
  directory text,
  is_custom_forever_content boolean NOT NULL DEFAULT false
);

CREATE TABLE zone (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('zone'),
  continent_id text NOT NULL REFERENCES continent (atlas_id),
  name text NOT NULL,
  level_range_min smallint,
  level_range_max smallint,
  faction_hostility text,
  world_bounds geometry(Polygon, 0)
);

CREATE TABLE subzone (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('subzone'),
  zone_id text NOT NULL REFERENCES zone (atlas_id),
  name text NOT NULL,
  is_landmark boolean NOT NULL DEFAULT false,
  shared_with_zone_id text REFERENCES zone (atlas_id)
);

CREATE TYPE coordinate_space AS ENUM ('WORLD_SPACE', 'UI_MAP_TRANSFORM', 'ADT_TILE');

CREATE TABLE location (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('location'),
  coordinate_space coordinate_space NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  z double precision,
  zone_id text REFERENCES zone (atlas_id),
  subzone_id text REFERENCES subzone (atlas_id),
  geom geometry(PointZ, 0) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(x, y, COALESCE(z, 0)), 0)
  ) STORED
);
CREATE INDEX location_geom_idx ON location USING GIST (geom);
CREATE INDEX location_zone_idx ON location (zone_id);
CREATE INDEX location_subzone_idx ON location (subzone_id);

-- ---------------------------------------------------------------------------
-- NPCs / objects
-- ---------------------------------------------------------------------------

CREATE TABLE npc (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('npc'),
  name text NOT NULL,
  npc_types text[] NOT NULL DEFAULT '{}',
  is_boss boolean NOT NULL DEFAULT false
);

CREATE TABLE npc_spawn (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('npc_spawn'),
  npc_id text NOT NULL REFERENCES npc (atlas_id),
  location_id text NOT NULL REFERENCES location (atlas_id),
  is_patrol boolean NOT NULL DEFAULT false
);
CREATE INDEX npc_spawn_npc_idx ON npc_spawn (npc_id);
CREATE INDEX npc_spawn_location_idx ON npc_spawn (location_id);

CREATE TABLE game_object (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('game_object'),
  name text NOT NULL,
  object_type text NOT NULL DEFAULT 'other'
);

CREATE TABLE game_object_spawn (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('game_object_spawn'),
  game_object_id text NOT NULL REFERENCES game_object (atlas_id),
  location_id text NOT NULL REFERENCES location (atlas_id)
);

-- ---------------------------------------------------------------------------
-- Quests
-- ---------------------------------------------------------------------------

CREATE TABLE quest (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('quest'),
  name text NOT NULL,
  level_requirement_min smallint,
  level_requirement_max smallint,
  faction text NOT NULL DEFAULT 'both' CHECK (faction IN ('alliance', 'horde', 'both')),
  is_repeatable boolean NOT NULL DEFAULT false,
  is_daily boolean NOT NULL DEFAULT false,
  is_weekly boolean NOT NULL DEFAULT false,
  is_monthly boolean NOT NULL DEFAULT false,
  is_yearly boolean NOT NULL DEFAULT false,
  is_war_effort boolean NOT NULL DEFAULT false,
  is_attunement boolean NOT NULL DEFAULT false,
  is_instance_quest boolean NOT NULL DEFAULT false,
  is_breadcrumb boolean NOT NULL DEFAULT false,
  given_by_npc_id text REFERENCES npc (atlas_id),
  turned_in_at_npc_id text REFERENCES npc (atlas_id),
  source_quest_num_required smallint
);

CREATE TABLE quest_prerequisite (
  quest_id text NOT NULL REFERENCES quest (atlas_id),
  prerequisite_quest_id text NOT NULL REFERENCES quest (atlas_id),
  PRIMARY KEY (quest_id, prerequisite_quest_id)
);

CREATE TABLE quest_alt (
  quest_id text NOT NULL REFERENCES quest (atlas_id),
  alt_quest_id text NOT NULL REFERENCES quest (atlas_id),
  PRIMARY KEY (quest_id, alt_quest_id)
);

CREATE TABLE quest_objective (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('quest_objective'),
  quest_id text NOT NULL REFERENCES quest (atlas_id),
  order_index smallint NOT NULL,
  objective_type text NOT NULL,
  target_npc_id text REFERENCES npc (atlas_id),
  target_game_object_id text REFERENCES game_object (atlas_id),
  target_item_id text,
  location_id text REFERENCES location (atlas_id),
  description text
);

CREATE TABLE quest_chain (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('quest_chain'),
  name text NOT NULL
);

CREATE TABLE quest_chain_member (
  quest_chain_id text NOT NULL REFERENCES quest_chain (atlas_id),
  quest_id text NOT NULL REFERENCES quest (atlas_id),
  order_index smallint NOT NULL,
  PRIMARY KEY (quest_chain_id, quest_id)
);

-- ---------------------------------------------------------------------------
-- Items, instances, bosses, travel
-- ---------------------------------------------------------------------------

CREATE TABLE item (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('item'),
  name text NOT NULL,
  item_class smallint,
  item_subclass smallint,
  icon text
);

CREATE TABLE instance (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('instance'),
  name text NOT NULL,
  instance_type text NOT NULL CHECK (instance_type IN ('dungeon', 'raid')),
  map_id integer NOT NULL, -- Blizzard Map.ID, confirmed real/distinct per instance
  is_forever_original boolean NOT NULL DEFAULT false
);

CREATE TABLE instance_entrance (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('instance_entrance'),
  instance_id text NOT NULL REFERENCES instance (atlas_id),
  location_id text REFERENCES location (atlas_id) -- nullable: "Location unavailable" is a real, allowed state
);

CREATE TABLE boss (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('boss'),
  instance_id text NOT NULL REFERENCES instance (atlas_id),
  name text NOT NULL,
  order_index smallint NOT NULL
);

CREATE TABLE flight_path (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('flight_path'),
  name text NOT NULL,
  location_id text NOT NULL REFERENCES location (atlas_id),
  faction text NOT NULL DEFAULT 'both' CHECK (faction IN ('alliance', 'horde', 'both'))
);

CREATE TABLE resource_node (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('resource_node'),
  resource_type text NOT NULL CHECK (resource_type IN ('herb', 'ore', 'fishing_pool')),
  name text NOT NULL
);

CREATE TABLE resource_node_spawn (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('resource_node_spawn'),
  resource_node_id text NOT NULL REFERENCES resource_node (atlas_id),
  location_id text NOT NULL REFERENCES location (atlas_id)
);

CREATE TABLE poi (
  atlas_id text PRIMARY KEY DEFAULT next_atlas_id('poi'),
  name text NOT NULL,
  poi_type text NOT NULL,
  location_id text NOT NULL REFERENCES location (atlas_id)
);
