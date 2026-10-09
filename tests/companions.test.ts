import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { companionsFromEats, MAX_COMPANIONS, resolveCompanions } from "../src/core/companions";
import { compileContent, ContentError } from "../src/data/compile";
import type { TaxonomyIndex } from "../src/data/schema";

describe("companions from diet", () => {
  it("maps what a shark eats to creatures", () => {
    expect(companionsFromEats("Plankton and small fish")).toEqual(["plankton", "baitfish"]);
    expect(companionsFromEats("Stingrays, fish, squid and other sharks")).toEqual(["ray", "baitfish"]);
    expect(companionsFromEats("Seals, sea lions, large fish")).toEqual(["baitfish"]);
    expect(companionsFromEats("Carrion")).toEqual([]);
  });
  it("lets a species list win, then falls back to clade plus diet", () => {
    expect(resolveCompanions(["ray"], ["remora"], "Plankton")).toEqual(["ray"]);
    expect(resolveCompanions([], ["remora"], "Plankton")).toEqual([]);
    expect(resolveCompanions(undefined, ["remora"], "Plankton and small fish")).toEqual(["remora", "plankton", "baitfish"]);
  });
  it("drops duplicates and caps the list", () => {
    expect(resolveCompanions(undefined, ["baitfish"], "fish")).toEqual(["baitfish"]);
    expect(resolveCompanions(undefined, ["remora", "ray"], "Plankton and fish")).toHaveLength(MAX_COMPANIONS);
  });
});

const clade = (id: string, rank: string, parent: string | null, extra: object = {}) => ({ id, rank, parent, latin: id, common: id, meaning: "m", description: "d", ...extra });
const species = (id: string, extra: object = {}) => ({
  id,
  genus: "g",
  latin: "Genus " + id,
  common: id,
  meaning: "m",
  description: "d",
  lengthM: 3,
  depth: "x",
  eats: "Plankton",
  wikipedia: "X",
  distribution: { mode: "open", polygons: [[[0, 0], [1, 0], [1, 1]]] },
  ...extra,
});
const compile = (cladeExtra: object, speciesExtra: object) =>
  compileContent({
    clades: [clade("o", "order", null, cladeExtra), clade("f", "family", "o"), clade("g", "genus", "f")].map((data) => ({ file: `content/clades/${data.id}.json`, data })),
    species: [species("s", speciesExtra)].map((data) => ({ file: `content/species/${data.id}.json`, data })),
  }).index.nodes.find((n) => n.id === "s")!;

describe("companions in content", () => {
  it("inherits from the nearest clade and adds the diet", () => {
    expect(compile({ companions: ["remora"] }, {}).companions).toEqual(["remora", "plankton"]);
  });
  it("lets a species override", () => {
    expect(compile({ companions: ["remora"] }, { companions: ["ray"] }).companions).toEqual(["ray"]);
    expect(compile({ companions: ["remora"] }, { companions: [] }).companions).toBeUndefined();
  });
  it("rejects a creature that does not exist", () => {
    expect(() => compile({}, { companions: ["unicorn"] })).toThrow(ContentError);
  });
  it("gives the shipped species the creatures we designed", () => {
    const idx = JSON.parse(readFileSync("public/data/index.json", "utf8")) as TaxonomyIndex;
    const of = (id: string) => idx.nodes.find((n) => n.id === id)?.companions;
    expect(of("rhincodon-typus")).toEqual(["remora", "plankton", "baitfish"]);
    expect(of("sphyrna-mokarran")).toEqual(["ray", "baitfish"]);
    expect(of("carcharodon-carcharias")).toEqual(["baitfish"]);
  });
});
