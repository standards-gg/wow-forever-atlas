import { redirect } from "next/navigation";

/**
 * Old per-continent static page, kept as a redirect into the single
 * continuous map (app/page.tsx), which shows the whole world by default.
 */
export default function ContinentRedirectPage() {
  redirect("/");
}
