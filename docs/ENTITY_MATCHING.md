# Entity Matching

Deterministic rules for reconciling records about the same real-world thing
across Wago (DB2), AllTheThings, QuestieDB, and (eventually) our own
telemetry, into one canonical `DATA_MODEL.md` entity. **Ambiguous records
are never silently merged** — this doc defines what "ambiguous" means
per entity type and what happens to a record that can't be resolved
automatically.

## Priority order (as specified in the Phase 1 brief, made concrete)

1. **Verified canonical mapping** — a cross-reference that a human (or a
   prior, already-reviewed automated pass) has explicitly confirmed correct.
   Once set, this is authoritative and skips all lower tiers.
2. **Authoritative external ID mapping** — a Blizzard-issued ID
   (`AreaTable.ID`, `UiMapID`, `Map.ID`, `QuestID`, `NpcID`, `ItemID`) that
   **two or more independent sources agree on**. This is the strongest
   *automatic* tier, and Phase 1 produced a real, confirmed example of it:
   Burning Steppes' `AreaTable.ID = 46` is independently confirmed by both
   Wago's live DB2 export and QuestieDB's own `zoneIds.lua`; its
   `UiMapID = 1428` is likewise independently confirmed by both DB2's
   `UiMapAssignment` and QuestieDB's `areaIdToUiMapId.lua`. Two unrelated
   codebases agreeing on the same Blizzard-issued number, observed
   independently, is exactly what this tier means in practice.
3. **Exact ID + type, single source** — a Blizzard ID confirmed present in
   only one source so far, not yet cross-corroborated. Treated as
   provisional-authoritative (used, but flagged lower-confidence than tier
   2 until corroborated).
4. **Normalized name + type + context** — e.g. an NPC name string
   (case/whitespace-normalized) matching within the same zone/quest
   context. Confirmed necessary because NPC *identity* itself is largely
   absent from client DB2 this build (only 178 vanity-pet rows in
   `Creature`) — names have to come from ATT's inline comments
   (`qg = 14437, -- Gorzeeki Wildeyes`, confirmed real syntax) or
   QuestieDB's Npc table, which means name-based matching is not a
   fallback here, it's load-bearing for the NPC entity type specifically.
5. **Geographic relationship** — two records with no shared ID and no name
   match, but placed at (near-)identical `WORLD_SPACE` coordinates within
   the same zone. Lowest-confidence automatic tier; used mainly to *flag* a
   likely match for manual review, not to auto-merge.
6. **Manual mapping** — a human resolves it. Every record that reaches this
   tier without resolution goes into a review queue (see below), not into
   the canonical database unresolved.

## Per-entity-type matching keys

| Entity | Primary automatic key | Corroborating signal | Notes |
|---|---|---|---|
| `Continent` | `Map.ID` | name | Small, stable set (75 confirmed rows total this build) |
| `Zone` | `AreaTable.ID` **and** `UiMapID` (both tracked, neither preferred — see `DATA_MODEL.md`'s worked example) | name, world bounding box overlap | Confirmed two independent Blizzard ID namespaces exist for the same zone; store both |
| `Subzone` | `AreaTable.ID` (`ParentAreaID` gives containing zone) | name | Confirmed real cross-zone case: Blackrock Mountain = two distinct `AreaTable` rows (254, 1445), matched by shared *name*, not a shared ID — see `GEOGRAPHIC_GRAPH.md` |
| `NPC` | Blizzard `NpcID` (from ATT's `qg`/`qi` fields or QuestieDB's Npc table) | normalized name | **No DB2 source for this ID at all this phase** (confirmed: `Creature` table doesn't hold real NPCs) — external-source agreement (ATT vs. QuestieDB both referencing the same NpcID) is the best available corroboration until a client-authoritative source exists |
| `Quest` | Blizzard `QuestID` | name, `given_by` NPC match | High confidence — QuestID is stable and used identically (no remapping, confirmed) by both ATT and Forever Quest Pins |
| `Item` | Blizzard `ItemID` | name | DB2 `Item`/`ItemSparse` confirmed present and authoritative |
| `Instance` | Blizzard `Map.ID` | name | Confirmed reliable **only when read from `DungeonEncounter.MapID`, not `LFGDungeons.MapID`** — see the conflict rule below, this is a real confirmed discrepancy, not a hypothetical |
| `Boss` | (`Map.ID`, `DungeonEncounter.ID`) composite | name | Confirmed accurate against known Classic content for Blackrock Spire/Depths |
| `FlightPath` | `TaxiNodes.ID` | name | Single confirmed-authoritative source (DB2) so far — no cross-source conflict possible yet |

## Handling ambiguity — explicit, per the brief's requirement

**Never silently merge.** A record enters the **review queue**
(`entity_review_queue` table: `candidate_a_ref`, `candidate_b_ref`,
`ambiguity_reason`, `status: pending|confirmed_same|confirmed_different`)
whenever:

- Two records match on tier 4/5 (name/geography) but disagree on any tier
  1-3 field that *is* present for at least one of them (e.g. same NPC name,
  different `NpcID` — a real, expected scenario given Classic-era name
  reuse across zones, e.g. generic mob names like "Timber Wolf" appearing
  with different IDs in different zones).
- A tier-2 (cross-source-agreed) external ID conflicts with a
  previously-recorded tier-1 (human-verified) mapping — this always wins
  toward tier 1, but the conflict itself is logged for audit, never
  silently overwritten.
- A record's only available signal is tier 5 (geographic proximity) and
  more than one existing canonical entity sits within the match radius.

## A confirmed real case worth designing around now: the "Camelot" ambiguity

Both ATT (`db/Camelot/`, `CAMELOT` preprocessor tag) and QuestieDB
(`AllowLoadGameType camelot, forever`) independently use "Camelot" as an
internal identifier for the same content publicly called "Forever" — and
QuestieDB's own tracking issue (#23, confirmed still open this phase)
states outright that client-build/native-selection acceptance for the
`forever` token is unproven. **This is exactly the kind of ambiguity this
doc's tier system exists for**: "Camelot" and "Forever" should be modeled
as two known aliases of the same `source_build`/`data_phase` concept in our
provenance layer (see `DATA_PROVENANCE.md`), not silently unified nor
treated as a matching failure — record both, flag the equivalence as
`confidence: inferred` (tier 4-equivalent, name/context-based, not a
Blizzard-issued ID) rather than `verified`, and revisit once QuestieDB's
own issue #23 resolves it upstream.

## A confirmed real conflict this phase actually found (see `SOURCE_CONFLICTS.md`... — folded into `DATA_PROVENANCE.md` per the brief's instruction not to create unnecessary duplicate docs)

`LFGDungeons.MapID` is confirmed **unreliable** — all three Blackrock
dungeon entries in that table report `MapID = 0` (Eastern Kingdoms, the
outdoor continent) instead of their real instance `Map.ID`s (229/230).
`DungeonEncounter.MapID`, queried directly against the *real* `Map.ID`
values, gave confirmed-accurate boss lists. **Rule for this specific,
confirmed case**: when `Instance`-to-`Map.ID` linkage is needed, prefer
`DungeonEncounter`'s implicit linkage (validate a candidate `Map.ID` by
checking it returns a plausible, lore-matching boss list) over
`LFGDungeons.MapID` directly. This is documented here as a concrete
instance of a broader rule: **a table being the "obvious" name for a
relationship (`LFGDungeons` sounds authoritative for dungeon↔map linkage)
does not make it reliable — validate against a second, independent
signal before trusting a join key**, exactly as the Phase 1 brief warned
against assuming a table is useful merely because its name sounds
relevant.
