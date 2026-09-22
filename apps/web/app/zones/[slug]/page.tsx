import { redirect } from "next/navigation";

/**
 * Old per-zone static page, kept as a deep-link redirect into the single
 * continuous map (app/page.tsx) — per the shift away from separate static
 * pages per zoom level, matching Hyjal's one-map UX.
 */
export default function ZoneRedirectPage({ params }: { params: { slug: string } }) {
  redirect(`/?zone=${params.slug}`);
}
