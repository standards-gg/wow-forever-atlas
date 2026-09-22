# Importer: ForeverAtlas

**Status: intentionally not implemented — this is not a real data source.**

Phase 0 research (`docs/SOURCE_FOREVERATLAS.md`) found that "ForeverAtlas"
is two low-provenance fan/SEO websites (`foreveratlas.com`,
`wowforeveratlas.com`), not an addon, not a data repository, and not backed
by any published schema, export, or API. The one site that states its own
sourcing says its content is compiled secondhand from Blizzard panel
recaps and other fansites' datamining. Neither site has a license or a
named maintainer.

This directory exists to satisfy the requested `importers/{source}/`
structure, not because there's an importer to write. If a real,
structured ForeverAtlas data source ever surfaces (contrary to this
research), re-evaluate — see `docs/DATA_SOURCE_MATRIX.md` and
`docs/OPEN_QUESTIONS.md` #5 (Phase 0's open item asking whether ForeverAtlas
has any actual item/quest/loot/vendor data at all, which was never fully
verified).
