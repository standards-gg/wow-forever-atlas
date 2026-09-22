# Database

PostgreSQL 14+ with PostGIS 3+, per `docs/DATA_MODEL.md`.

No Postgres/Docker was available in the Phase 2 development sandbox this
schema was written in — `migrations/0001_init.sql` has been reviewed
carefully against `docs/DATA_MODEL.md` but **has not been run against a
live database**. Run it yourself before trusting it in anger:

```bash
docker compose -f db/docker-compose.yml up -d
# migrations/*.sql auto-run on first container start via docker-entrypoint-initdb.d
```

To re-run migrations against an already-initialized volume:

```bash
docker exec -i $(docker compose -f db/docker-compose.yml ps -q postgres) \
  psql -U atlas -d wow_forever_atlas < db/migrations/0001_init.sql
```

Until this is verified against a real instance, treat the schema as
**reviewed, not yet integration-tested** — see `docs/OPEN_QUESTIONS.md`.
