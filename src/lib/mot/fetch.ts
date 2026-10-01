import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MOT_API, RESOURCES, RAW_DIR } from "./resources";
import { MOT_RETRY_PAUSE_MS, MOT_TIMEOUT_MS } from "./constants";

// The resources we query by plate ("dealers" is a file, not an API resource).
export type ApiResource = Exclude<keyof typeof RESOURCES, "dealers">;

type ApiBody<T> = { success?: boolean; result?: { records?: T[] } };

// Day 19ב §3.2 — the ministry answered neither time. Every caller gets this one error, never a
// half-answer: nothing is written, nothing is cached, the run stops where it stands (AGENTS.md).
export class MotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MotUnavailableError";
  }
}

// What tests inject in place of the network and the clock; production passes none of it.
export type MotDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retryPauseMs?: number;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Day 19ב §3.2 — the one door to data.gov.il: every ministry request in the project goes through
 * here. One GET with our User-Agent, abandoned after MOT_TIMEOUT_MS; a network error, the abort, a
 * status outside 2xx, a body that is not JSON and a body whose success is not true are all one thing
 * — a failed attempt. After a failed attempt it waits MOT_RETRY_PAUSE_MS and tries exactly once
 * more; a second failure throws MotUnavailableError naming what failed both times.
 *
 * The raw text comes back beside the parsed body: Day 14 run C (§0.11) archives an answer exactly
 * as it arrived, so the bytes must survive the parse.
 */
export async function motGet<T>(
  url: string,
  deps: MotDeps = {},
): Promise<{ body: ApiBody<T>; text: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? wait;
  const timeoutMs = deps.timeoutMs ?? MOT_TIMEOUT_MS;
  const retryPauseMs = deps.retryPauseMs ?? MOT_RETRY_PAUSE_MS;

  async function attempt(): Promise<{ body: ApiBody<T>; text: string }> {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "vehicle-research-script/0.1" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();

    let body: ApiBody<T>;
    try {
      body = JSON.parse(text) as ApiBody<T>;
    } catch {
      throw new Error(`non-JSON body (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (body.success !== true) throw new Error(`success=${String(body.success)} (HTTP ${res.status})`);
    return { body, text };
  }

  const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  let first: string;
  try {
    return await attempt();
  } catch (e) {
    first = reason(e);
  }
  await sleep(retryPauseMs);
  try {
    return await attempt();
  } catch (e) {
    throw new MotUnavailableError(
      `MoT unavailable: ${url} — first attempt: ${first}; retry after ${retryPauseMs} ms: ${reason(e)}`,
    );
  }
}

// Where the raw cache keeps one plate's answers: data/raw/mot/<plate>/<resource>.json, top level.
// The only reader of that layout is this file; the refresh's archive (Day 14 run C, §0.11) puts
// older snapshots in subfolders of plateDir, which nothing here looks at.
export function plateDir(plate: string): string {
  return path.join(process.cwd(), RAW_DIR, "mot", plate);
}

export function resourceFile(plate: string, key: ApiResource): string {
  return path.join(plateDir(plate), `${key}.json`);
}

// Rows for one plate from one resource. The raw JSON is cached under data/raw/mot/<plate>/,
// so a re-run never touches the network, and a schema change is re-mapped from disk.
export async function fetchRows<T>(key: ApiResource, plate: string, refresh = false): Promise<T[]> {
  const file = resourceFile(plate, key);

  if (!refresh && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as ApiBody<T>;
    return cached.result?.records ?? [];
  }

  const { records, text } = await fetchRowsFresh<T>(key, plate);
  mkdirSync(plateDir(plate), { recursive: true });
  writeFileSync(file, text, "utf8");
  return records;
}

// Day 14 run C (§1.1): the refresh's own path — always the network, never the cache, and it writes
// nothing. The response TEXT comes back beside the records because §0.11 archives the answer exactly
// as it arrived; the caller decides whether it is ever written (§0.2: only an accepted answer is).
// Day 19ב §3.3: the request itself is motGet's, so a failure here is a MotUnavailableError after
// one retry — the records check below stays this function's own.
export async function fetchRowsFresh<T>(
  key: ApiResource,
  plate: string,
  deps?: MotDeps,
): Promise<{ records: T[]; text: string }> {
  const filters = encodeURIComponent(JSON.stringify({ mispar_rechev: Number(plate) }));
  const url = `${MOT_API}?resource_id=${RESOURCES[key]}&filters=${filters}`;
  const { body, text } = await motGet<T>(url, deps);
  if (!body.result?.records) {
    throw new Error(`MoT ${key}: a success body with no records array`);
  }
  return { records: body.result.records, text };
}


// A one-off sample of plates from the registry, for coverage probes. Not cached.
export async function samplePlates(
  filters: Record<string, unknown>,
  limit: number,
  deps?: MotDeps,
): Promise<string[]> {
  const q = encodeURIComponent(JSON.stringify(filters));
  const url = `${MOT_API}?resource_id=${RESOURCES.registry}&filters=${q}&limit=${limit}&fields=mispar_rechev`;
  const { body } = await motGet<{ mispar_rechev: number }>(url, deps);
  if (!body.result?.records) {
    throw new Error("MoT sample: a success body with no records array");
  }
  return body.result.records.map((r) => String(r.mispar_rechev));
}
