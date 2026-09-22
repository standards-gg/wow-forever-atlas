import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-ember-400">WoW Forever Atlas</h1>
      <p className="text-balance text-sm leading-relaxed text-[#c9b8ae]">
        A geographic/entity graph of Azeroth for World of Warcraft: Forever &mdash; the map is one
        view of it, not the whole product. This is an early vertical slice built directly from live
        AllTheThings data, not placeholder content.
      </p>
      <Link
        href="/zones/burning-steppes"
        className="rounded-md bg-ember-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ember-400"
      >
        Explore Burning Steppes &rarr;
      </Link>
    </main>
  );
}
