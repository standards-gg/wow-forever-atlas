/** Live fetch helpers for AllTheThings' GitHub repo. Node 20+ has a native fetch. */

const REPO = "ATTWoWAddon/AllTheThings";

export async function fetchLatestCommitSha(branch = "master"): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${branch}`, {
    headers: { Accept: "application/vnd.github.sha" },
  });
  if (!res.ok) throw new Error(`GitHub API error fetching latest commit: ${res.status} ${res.statusText}`);
  return (await res.text()).trim();
}

export async function fetchRawFile(pathInRepo: string, ref = "master"): Promise<string> {
  const encodedPath = pathInRepo.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${REPO}/${ref}/${encodedPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

export const ZONE_FILE_PATHS = {
  burningSteppes:
    ".contrib/.db/forever/zzOLD/02 - Outdoor Zones/02 Eastern Kingdoms/Burning Steppes.lua",
  searingGorge:
    ".contrib/.db/forever/zzOLD/02 - Outdoor Zones/02 Eastern Kingdoms/Searing Gorge.lua",
} as const;
