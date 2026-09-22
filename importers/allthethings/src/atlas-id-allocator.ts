import { formatAtlasId, type AtlasEntityType, type AtlasId } from "@atlas/shared";

/**
 * In-memory atlas_id allocator for a single importer run. This is a
 * placeholder for what a real deployment does with a per-type Postgres
 * sequence (see db/migrations) — it exists so importer logic is fully
 * testable without a live database (none is available in this dev
 * environment; see docs/INGESTION_ARCHITECTURE.md).
 */
export class AtlasIdAllocator {
  private counters = new Map<AtlasEntityType, number>();

  next<T extends AtlasEntityType>(entityType: T): AtlasId<T> {
    const current = this.counters.get(entityType) ?? 0;
    const seq = current + 1;
    this.counters.set(entityType, seq);
    return formatAtlasId(entityType, seq);
  }
}
