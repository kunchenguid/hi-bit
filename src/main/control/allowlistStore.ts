import { readJsonFile, writeJsonFile } from "../storage/json";
import { type AllowedDomain, DEFAULT_ALLOWLIST, normalizeDomain } from "./allowlist";

type AllowlistFile = { schemaVersion: 1; domains: string[] };

/**
 * Persists the parent-managed browser allowlist to `browser-allowlist.json`.
 * First read seeds the kid-safe defaults so a fresh install still works; later
 * reads return exactly what the parent has curated (including an empty list).
 */
export class AllowlistStore {
  constructor(private readonly path: string) {}

  async load(): Promise<AllowedDomain[]> {
    const record = await readJsonFile<AllowlistFile>(this.path);
    if (!record) {
      const seeded = normalizeList([...DEFAULT_ALLOWLIST]);
      await this.save(seeded);
      return seeded;
    }
    return normalizeList(record.domains ?? []);
  }

  async save(domains: AllowedDomain[]): Promise<void> {
    await writeJsonFile(this.path, {
      schemaVersion: 1,
      domains: normalizeList(domains),
    } satisfies AllowlistFile);
  }
}

function normalizeList(domains: string[]): AllowedDomain[] {
  const cleaned = domains.map((d) => normalizeDomain(d)).filter((d): d is string => Boolean(d));
  return [...new Set(cleaned)].sort();
}
