import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePipeCsv } from "./pipe-csv";
import { RAW_DIR } from "./resources";

// One catalog row, ministry field names, only what we currently read.
export type CatalogRow = {
  tozeret_cd: string;
  degem_cd: string;
  shnat_yitzur: string;
  degem_nm: string;
  tozar: string;
  tozeret_nm: string;
  ramat_gimur: string;
  merkav: string;
  nefah_manoa: string;
  koah_sus: string;
  mispar_moshavim: string;
  delek_nm: string;
  automatic_ind: string;
  hanaa_nm: string;
  gova: string;
  ramat_eivzur_betihuty: string;
  horaat_rishum?: string;
  kinuy_mishari: string;
};

let rows: CatalogRow[] | null = null;

export function loadCatalog(): CatalogRow[] {
  if (rows) return rows;
  const file = path.join(process.cwd(), RAW_DIR, "catalog.csv");
  rows = parsePipeCsv<CatalogRow>(readFileSync(file, "utf8"));
  return rows;
}