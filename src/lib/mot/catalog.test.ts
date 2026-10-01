// Day 19ב §2.7 — one translation for one catalog row: the four drive-technology words, the 15 flags,
// the three numbers, the trimming, and the point of the whole section — a version read from the file
// and the same version read from the ministry's online catalog come out as the same models row.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalModelNames,
  catalogRowFromApi,
  nameKey,
  translateCatalogRow,
  type CatalogRow,
} from "./catalog";

// MAZDA 3 2021 (P, 00588, 00237) — the first of the three versions of the code facts.
const MAZDA: CatalogRow = {
  sug_degem: "P",
  tozeret_cd: "00588",
  degem_cd: "00237",
  shnat_yitzur: "2021",
  degem_nm: "BPFKP5",
  tozar: "מאזדה",
  tozeret_nm: "מאזדה יפן",
  kinuy_mishari: "MAZDA 3",
  ramat_gimur: "PREMIUM",
  merkav: "סדאן",
  nefah_manoa: "1998",
  koah_sus: "122",
  mispar_moshavim: "5",
  delek_nm: "בנזין",
  automatic_ind: "1",
  hanaa_nm: "קדמי",
  gova: "1435",
  ramat_eivzur_betihuty: "7",
  mispar_dlatot: "4",
  mispar_kariot_avir: "7",
  technologiat_hanaa_nm: "הנעה רגילה",
  CO2_WLTP: "160.",
  blimat_hirum_lifnei_holhei_regel_ofanaim: "1",
  zihuy_holchey_regel_ind: "1",
  zihuy_rechev_do_galgali: "0",
  zihuy_matzav_hitkarvut_mesukenet_ind: "1",
  nitur_merhak_milfanim_ind: "1",
  bakarat_stiya_menativ_ind: "1",
  bakarat_stiya_activ_s: "0",
  zihuy_beshetah_nistar_ind: "1",
  bakarat_shyut_adaptivit_ind: "1",
  zihuy_tamrurey_tnua_ind: "1",
  shlita_automatit_beorot_gvohim_ind: "1",
  blima_otomatit_nesia_leahor: "0",
  halon_bagg_ind: "0",
  galgaley_sagsoget_kala_ind: "1",
  matzlemat_reverse_ind: "1",
};

// IONIQ HYBRID 2021 (P, 00481, 00246) — the second version.
const IONIQ: CatalogRow = {
  ...MAZDA,
  tozeret_cd: "00481",
  degem_cd: "00246",
  degem_nm: "AE7HS1",
  tozar: "יונדאי",
  tozeret_nm: "יונדאי קוריאה",
  kinuy_mishari: "IONIQ HYBRID",
  ramat_gimur: "INSPIRE",
  nefah_manoa: "1580",
  koah_sus: "105",
  technologiat_hanaa_nm: "היברידי רגיל",
  delek_nm: "היבריד/בנזין",
  CO2_WLTP: "104.",
};

// The commercial row (M, 00005, 00179) — the third version, with the catalog's trailing space in hanaa_nm.
const COMMERCIAL: CatalogRow = {
  ...MAZDA,
  sug_degem: "M",
  tozeret_cd: "00005",
  degem_cd: "00179",
  shnat_yitzur: "2021",
  degem_nm: "W1V447",
  tozar: "מרצדס",
  tozeret_nm: "מרצדס גרמניה",
  kinuy_mishari: "VITO",
  ramat_gimur: "TOURER PRO",
  merkav: "נוסעים",
  nefah_manoa: "1950",
  koah_sus: "163",
  mispar_moshavim: "9",
  hanaa_nm: "לא ידוע קוד ", // the file's value, trailing space and all
  CO2_WLTP: "221.",
};

const row = (over: Partial<CatalogRow>): CatalogRow => ({ ...MAZDA, ...over });

// The record the API gives for a row of the file: the same fields, but the two identity codes and
// CO2_WLTP come as numbers (no leading zeros, no trailing dot), the text comes trimmed, and the
// datastore adds its own _id. Everything else is the very same string (Run 15-discovery).
function apiRecord(r: CatalogRow, id = 1): Record<string, unknown> {
  return {
    ...r,
    _id: id,
    tozeret_cd: Number(r.tozeret_cd),
    degem_cd: Number(r.degem_cd),
    CO2_WLTP: Number(r.CO2_WLTP.replace(/\.$/, "")),
    hanaa_nm: r.hanaa_nm.trim(),
  };
}

describe("translateCatalogRow — drive_technology (§2.3)", () => {
  it("each of the four catalog words maps to its code", () => {
    const pairs: [string, string][] = [
      ["הנעה רגילה", "regular"],
      ["היברידי רגיל", "hybrid"],
      ["PLUG IN", "plug_in"],
      ["רכב חשמלי", "electric"],
    ];
    for (const [word, code] of pairs) {
      assert.equal(translateCatalogRow(row({ technologiat_hanaa_nm: word }), "MAZDA 3").drive_technology, code, word);
    }
  });

  it("a word the catalog is not allowed to hold throws, naming the value and the identity", () => {
    assert.throws(
      () => translateCatalogRow(row({ technologiat_hanaa_nm: "מימן" }), "MAZDA 3"),
      (e: Error) => e.message.includes("מימן") && e.message.includes("P|588-237|2021"),
    );
  });

  it("an empty technology throws too — never a silent null", () => {
    assert.throws(() => translateCatalogRow(row({ technologiat_hanaa_nm: "" }), "MAZDA 3"), /technologiat_hanaa_nm/);
  });
});

describe("translateCatalogRow — the 15 flags (§2.3)", () => {
  it('"1" is true and "0" is false', () => {
    const on = translateCatalogRow(row({ halon_bagg_ind: "1" }), "MAZDA 3");
    const off = translateCatalogRow(row({ halon_bagg_ind: "0" }), "MAZDA 3");
    assert.equal(on.sunroof, true);
    assert.equal(off.sunroof, false);
  });

  it("an empty flag throws, naming the source field and the identity", () => {
    assert.throws(
      () => translateCatalogRow(row({ matzlemat_reverse_ind: "" }), "MAZDA 3"),
      (e: Error) => e.message.includes("matzlemat_reverse_ind") && e.message.includes("P|588-237|2021"),
    );
  });

  it('a flag value that is neither "0" nor "1" throws', () => {
    assert.throws(() => translateCatalogRow(row({ bakarat_stiya_activ_s: "2" }), "MAZDA 3"), /bakarat_stiya_activ_s/);
  });

  it("every one of the 15 columns reads its own catalog field", () => {
    const allOff: Partial<CatalogRow> = {
      blimat_hirum_lifnei_holhei_regel_ofanaim: "0",
      zihuy_holchey_regel_ind: "0",
      zihuy_rechev_do_galgali: "0",
      zihuy_matzav_hitkarvut_mesukenet_ind: "0",
      nitur_merhak_milfanim_ind: "0",
      bakarat_stiya_menativ_ind: "0",
      bakarat_stiya_activ_s: "0",
      zihuy_beshetah_nistar_ind: "0",
      bakarat_shyut_adaptivit_ind: "0",
      zihuy_tamrurey_tnua_ind: "0",
      shlita_automatit_beorot_gvohim_ind: "0",
      blima_otomatit_nesia_leahor: "0",
      halon_bagg_ind: "0",
      galgaley_sagsoget_kala_ind: "0",
      matzlemat_reverse_ind: "0",
    };
    const pairs: [keyof CatalogRow, string][] = [
      ["blimat_hirum_lifnei_holhei_regel_ofanaim", "aeb_pedestrian_cyclist"],
      ["zihuy_holchey_regel_ind", "pedestrian_detection"],
      ["zihuy_rechev_do_galgali", "two_wheeler_detection"],
      ["zihuy_matzav_hitkarvut_mesukenet_ind", "forward_collision_warning"],
      ["nitur_merhak_milfanim_ind", "distance_monitoring"],
      ["bakarat_stiya_menativ_ind", "lane_departure_warning"],
      ["bakarat_stiya_activ_s", "lane_keeping"],
      ["zihuy_beshetah_nistar_ind", "blind_spot_detection"],
      ["bakarat_shyut_adaptivit_ind", "adaptive_cruise"],
      ["zihuy_tamrurey_tnua_ind", "traffic_sign_recognition"],
      ["shlita_automatit_beorot_gvohim_ind", "auto_high_beams"],
      ["blima_otomatit_nesia_leahor", "reverse_auto_braking"],
      ["halon_bagg_ind", "sunroof"],
      ["galgaley_sagsoget_kala_ind", "alloy_wheels"],
      ["matzlemat_reverse_ind", "reverse_camera"],
    ];
    for (const [field, column] of pairs) {
      const out = translateCatalogRow(row({ ...allOff, [field]: "1" }), "MAZDA 3") as unknown as Record<string, boolean>;
      const on = pairs.filter(([, c]) => out[c]).map(([, c]) => c);
      assert.deepEqual(on, [column], `${field} -> ${column}`);
    }
  });
});

describe("translateCatalogRow — the three numbers and the trimming (§2.3)", () => {
  it('co2_wltp: "160." -> 160, empty -> null', () => {
    assert.equal(translateCatalogRow(row({ CO2_WLTP: "160." }), "MAZDA 3").co2_wltp, 160);
    assert.equal(translateCatalogRow(row({ CO2_WLTP: "" }), "MAZDA 3").co2_wltp, null);
  });

  it('doors and airbags: "0" stays 0, empty is null', () => {
    const zero = translateCatalogRow(row({ mispar_dlatot: "0", mispar_kariot_avir: "0" }), "MAZDA 3");
    assert.equal(zero.doors, 0);
    assert.equal(zero.airbags, 0);
    const none = translateCatalogRow(row({ mispar_dlatot: "", mispar_kariot_avir: "" }), "MAZDA 3");
    assert.equal(none.doors, null);
    assert.equal(none.airbags, null);
  });

  it("every text value it stores is trimmed", () => {
    const out = translateCatalogRow(
      row({ tozar: " מאזדה ", merkav: "סדאן ", delek_nm: " בנזין", hanaa_nm: "לא ידוע קוד ", ramat_gimur: " PREMIUM " }),
      " MAZDA 3 ",
    );
    assert.equal(out.make, "מאזדה");
    assert.equal(out.body_type, "סדאן");
    assert.equal(out.fuel_type, "בנזין");
    assert.equal(out.drive_type, "לא ידוע קוד");
    assert.equal(out.sub_model, "PREMIUM");
    assert.equal(out.model, "MAZDA 3");
    assert.equal(out.comparison_group, "P|מאזדה|MAZDA 3|סדאן|בנזין|1998|122|auto|לא ידוע קוד|PREMIUM");
  });

  it("the identity and the group key are the row's own (nothing else changed)", () => {
    const out = translateCatalogRow(MAZDA, "MAZDA 3");
    assert.equal(out.vehicle_class, "P");
    assert.equal(out.degem_code, "588-237"); // leading zeros normalized by makeDegemCode
    assert.equal(out.year, 2021);
    assert.equal(out.seats, 5);
    assert.equal(out.safety_rating, 7);
    assert.equal(out.comparison_group, "P|מאזדה|MAZDA 3|סדאן|בנזין|1998|122|auto|קדמי|PREMIUM");
  });
});

describe("catalogRowFromApi (§2.5)", () => {
  it("numbers become strings, null and undefined become empty, _id is dropped", () => {
    const r = catalogRowFromApi({ _id: 7, tozeret_cd: 588, CO2_WLTP: 160, hanaa_nm: null, ramat_gimur: undefined });
    assert.equal("_id" in r, false);
    assert.equal(r.tozeret_cd, "588");
    assert.equal(r.CO2_WLTP, "160");
    assert.equal(r.hanaa_nm, "");
    assert.equal(r.ramat_gimur, "");
  });
});

describe("file and network give the same models row (§2.7)", () => {
  for (const [name, source] of [
    ["MAZDA 3 2021", MAZDA],
    ["IONIQ HYBRID 2021", IONIQ],
    ["the commercial row (M, hanaa_nm with a trailing space)", COMMERCIAL],
  ] as [string, CatalogRow][]) {
    it(name, () => {
      const fromFile = translateCatalogRow(source, source.kinuy_mishari);
      const fromApi = translateCatalogRow(catalogRowFromApi(apiRecord(source)), source.kinuy_mishari);
      assert.deepEqual(fromApi, fromFile);
      assert.equal(fromApi.degem_code, fromFile.degem_code);
      assert.equal(fromApi.comparison_group, fromFile.comparison_group);
    });
  }

  it("the two forms really do differ before the translation", () => {
    const api = catalogRowFromApi(apiRecord(COMMERCIAL));
    assert.equal(COMMERCIAL.tozeret_cd, "00005");
    assert.equal(api.tozeret_cd, "5");
    assert.equal(COMMERCIAL.CO2_WLTP, "221.");
    assert.equal(api.CO2_WLTP, "221");
    assert.equal(COMMERCIAL.hanaa_nm, "לא ידוע קוד ");
    assert.equal(api.hanaa_nm, "לא ידוע קוד");
  });

  it("the degem_code of each version", () => {
    assert.equal(translateCatalogRow(MAZDA, "MAZDA 3").degem_code, "588-237");
    assert.equal(translateCatalogRow(IONIQ, "IONIQ HYBRID").degem_code, "481-246");
    assert.equal(translateCatalogRow(COMMERCIAL, "VITO").degem_code, "5-179");
  });
});

describe("the canonical model spelling, exported (§2.6)", () => {
  it("one key for MAZDA 3 and MAZDA3; the most frequent spelling wins", () => {
    assert.equal(nameKey(" mazda 3 "), "MAZDA3");
    assert.equal(nameKey("MAZDA3"), "MAZDA3");
    const all = [
      row({ kinuy_mishari: "MAZDA3" }),
      row({ kinuy_mishari: "MAZDA 3" }),
      row({ kinuy_mishari: "MAZDA 3" }),
      row({ kinuy_mishari: "IONIQ HYBRID" }),
    ];
    const { canon, merges } = canonicalModelNames(all);
    assert.equal(canon.get("MAZDA3"), "MAZDA 3");
    assert.equal(canon.get("IONIQHYBRID"), "IONIQ HYBRID");
    assert.equal(merges, 1);
  });
});
