/**
 * A small, explicitly-sourced lookup for the ATT `MAP.*` identifiers this
 * importer actually needs to resolve, per docs/ENTITY_MATCHING.md's rule:
 * "a table being the 'obvious' name for a relationship does not make it
 * reliable — validate against a second, independent signal before trusting
 * a join key." Every entry here is cross-validated against a second source
 * (wago.tools DB2 and/or QuestieDB), not guessed from the identifier name
 * alone (ATT's own `MAP.KALIMDOR = 1414`-style constants are UiMapIDs, per
 * docs/SOURCE_ATT.md — not AreaIDs, which is a real, confirmed distinction).
 *
 * This is deliberately NOT a general MAP.* resolver — ATT's full constants
 * file (`.contrib/Parser/lib/Constants/Maps.lua`) was not imported into
 * this project (it's part of ATT's Parser tooling, not needed for a data
 * importer), so any identifier not listed here is left unresolved rather
 * than guessed. Extend this table only with cross-validated entries.
 */
export interface KnownMap {
  uiMapId: number;
  areaId: number;
  name: string;
}

export const KNOWN_ATT_MAP_CONSTANTS: Record<string, KnownMap> = {
  "MAP.BURNING_STEPPES": {
    uiMapId: 1428,
    areaId: 46,
    name: "Burning Steppes",
    // Cross-validated: wago.tools DB2 (UiMapAssignment AreaID=46 -> UiMapID=1428)
    // AND QuestieDB's zoneIds.lua/areaIdToUiMapId.lua independently agree.
  },
  "MAP.SEARING_GORGE": {
    uiMapId: 1427,
    areaId: 51,
    name: "Searing Gorge",
    // Cross-validated the same way (QuestieDB's zoneIds.lua + conversion.json).
  },
};

export function resolveKnownMap(identifierName: string | undefined): KnownMap | undefined {
  if (!identifierName) return undefined;
  return KNOWN_ATT_MAP_CONSTANTS[identifierName];
}
