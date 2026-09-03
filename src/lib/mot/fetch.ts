import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MOT_API, RESOURCES, RAW_DIR } from "./resources";

// The resources we query by plate ("dealers" is a file, not an API resource).
export type ApiResource = Exclude<keyof typeof RESOURCES, "dealers">;

type ApiBody<T> = { success?: boolean; result?: { records?: T[] } };

// Rows for one plate from one resource. The raw JSON is cached under data/raw/mot/<plate>/,
// so a re-run never touches the network, and a schema change is re-mapped from disk.
export async function fetchRows<T>(key: ApiResource, plate: string, refresh = false): Promise<T[]> {
  const dir = path.join(process.cwd(), RAW_DIR, "mot", plate);
  const file = path.join(dir, `${key}.json`);

  if (!refresh && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as ApiBody<T>;
    return cached.result?.records ?? [];
  }

  const filters = encodeURIComponent(JSON.stringify({ mispar_rechev: Number(plate) }));
  const url = `${MOT_API}?resource_id=${RESOURCES[key]}&filters=${filters}`;
  const res = await fetch(url, { headers: { "User-Agent": "vehicle-research-script/0.1" } });
  const text = await res.text();

  let body: ApiBody<T>;
  try {
    body = JSON.parse(text) as ApiBody<T>;
  } catch {
    throw new Error(`MoT ${key}: non-JSON response (HTTP ${res.status}) — is the API down?`);
  }
  if (!res.ok || body.success !== true || !body.result?.records) {
    throw new Error(`MoT ${key}: HTTP ${res.status}, success=${String(body.success)}`);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, text, "utf8");
  return body.result.records;
}


// A one-off sample of plates from the registry, for coverage probes. Not cached.
export async function samplePlates(
  filters: Record<string, unknown>,
  limit: number,
): Promise<string[]> {
  const q = encodeURIComponent(JSON.stringify(filters));
  const url = `${MOT_API}?resource_id=${RESOURCES.registry}&filters=${q}&limit=${limit}&fields=mispar_rechev`;
  const res = await fetch(url, { headers: { "User-Agent": "vehicle-research-script/0.1" } });
  const body = (await res.json()) as ApiBody<{ mispar_rechev: number }>;
  if (!res.ok || body.success !== true || !body.result?.records) {
    throw new Error(`MoT sample: HTTP ${res.status}`);
  }
  return body.result.records.map((r) => String(r.mispar_rechev));
}