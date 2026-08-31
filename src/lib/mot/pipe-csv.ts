import { parse } from "csv-parse/sync";

// The ministry's CSV dialect: pipe-delimited, every value wrapped in quotes,
// but inner quotes are NOT doubled (e.g. ארה"ב), which breaks standard CSV quoting.
// So we parse with quoting disabled and strip the wrapping quotes ourselves.
export function parsePipeCsv<T>(text: string): T[] {
  return parse(text, {
    delimiter: "|",
    quote: false,
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    cast: (value: string) => {
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
      }
      return value;
    },
  }) as T[];
}