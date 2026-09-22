const WAGO_BASE = "https://wago.tools";

export async function fetchLatestBuild(product = "wow_classic_beta"): Promise<string> {
  const res = await fetch(`${WAGO_BASE}/api/builds/${product}/latest`);
  if (!res.ok) throw new Error(`wago.tools build lookup failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { version: string };
  return data.version;
}

export async function fetchDb2Csv(table: string, build: string): Promise<string> {
  const res = await fetch(`${WAGO_BASE}/db2/${table}/csv?build=${encodeURIComponent(build)}`);
  if (!res.ok) throw new Error(`wago.tools DB2 export failed for ${table}@${build}: ${res.status} ${res.statusText}`);
  return res.text();
}
