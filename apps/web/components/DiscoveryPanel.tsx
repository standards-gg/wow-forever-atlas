import type { FlightPath, Npc, Quest } from "@atlas/shared";

/**
 * The direct product implementation of Freier Bund's confirmed "Umgebung"
 * (surroundings) tab — a categorized, counted, cross-linked roster of every
 * entity type in a zone. Per docs/GEOGRAPHIC_GRAPH.md: "the single most
 * valuable page pattern for this project's 'what is around me' goal."
 *
 * Unlike Freier Bund's own confirmed data model (docs/SOURCE_FREIERBUND.md),
 * this counts *canonical entities*, not raw map pins — a quest giver who
 * starts three quests is one row, not three, matching this project's own
 * entity/placement split (docs/DATA_MODEL.md).
 */
export function DiscoveryPanel({
  quests,
  flightPaths,
  npcs,
}: {
  quests: Quest[];
  flightPaths: FlightPath[];
  npcs: Npc[];
}) {
  const categories: { label: string; count: number; items: { key: string; label: string; sub?: string }[] }[] = [
    {
      label: "Quests",
      count: quests.length,
      items: quests.map((q) => ({
        key: q.atlasId,
        label: q.name,
        sub: q.levelRequirementMin ? `Level ${q.levelRequirementMin}` : undefined,
      })),
    },
    {
      label: "Quest NPCs",
      count: npcs.length,
      items: npcs.map((n) => ({ key: n.atlasId, label: n.name })),
    },
    {
      label: "Flight Paths",
      count: flightPaths.length,
      items: flightPaths.map((f) => ({ key: f.atlasId, label: f.name, sub: f.faction })),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs uppercase tracking-wide text-[#8a7267]">What is around me?</p>
      {categories.map((cat) => (
        <section key={cat.label}>
          <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ember-400">
            {cat.label}
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-normal text-[#c9b8ae]">
              {cat.count}
            </span>
          </h3>
          {cat.items.length === 0 ? (
            <p className="text-xs text-[#6b584e]">None found yet &mdash; see docs/OPEN_QUESTIONS.md.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-[#e6dcd4]">
              {cat.items.slice(0, 25).map((item) => (
                <li key={item.key} className="flex items-baseline justify-between gap-2">
                  <span>{item.label}</span>
                  {item.sub && <span className="text-xs text-[#8a7267]">{item.sub}</span>}
                </li>
              ))}
              {cat.items.length > 25 && (
                <li className="text-xs text-[#6b584e]">&hellip; and {cat.items.length - 25} more</li>
              )}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
