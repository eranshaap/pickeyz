// degem_code is the pair tozeret_cd-degem_cd, e.g. "588-182".
// The two source fields are never stored on their own; this is the only place that joins them.

export function makeDegemCode(
  tozeret_cd: number | string | null | undefined,
  degem_cd: number | string | null | undefined,
): string | null {
  const t = toPositiveInt(tozeret_cd);
  const d = toPositiveInt(degem_cd);
  if (t === null && d === null) return null; // a vehicle without a model code — allowed
  if (t === null || d === null) {
    throw new Error(`degem_code: half a pair — tozeret_cd=${tozeret_cd}, degem_cd=${degem_cd}`);
  }
  return `${t}-${d}`;
}

function toPositiveInt(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`degem_code: not a positive integer: ${JSON.stringify(v)}`);
  }
  return n;
}