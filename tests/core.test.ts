import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Tree } from "../src/core/tree";
import { Navigator, type Move } from "../src/core/nav";
import { layoutLineup, selectLineup, DIVER_M } from "../src/core/lineup";
import { REF_HALF_W, speedScale, trackPose, trackShape } from "../src/core/racetrack";
import { buildRail } from "../src/core/rail";
import { layoutMap, pathOpenSet } from "../src/core/maplayout";
import type { TaxonomyIndex, IndexNode, Rank } from "../src/data/schema";

const real = (): Tree => new Tree(JSON.parse(readFileSync("public/data/index.json", "utf8")) as TaxonomyIndex);

/** A synthetic tree: `shape` is branching per level (order, family, genus, species). */
function synth(shape: number[], lengths: (i: number) => number = (i) => 2 + i): Tree {
  const ranks: Rank[] = ["order", "family", "genus", "species"];
  const nodes: IndexNode[] = [];
  let sp = 0;
  const make = (id: string, depth: number, parent: string | null): number => {
    const rank = ranks[depth]!;
    const n: IndexNode = { id, rank, parent, latin: id, common: id, children: [], speciesCount: 0 };
    nodes.push(n);
    if (depth === 3) {
      n.lengthM = lengths(sp++);
      n.model = "m";
      n.speciesCount = 1;
      return 1;
    }
    for (let i = 0; i < (shape[depth + 1] ?? 1); i++) {
      const cid = `${id}.${i}`;
      n.children.push(cid);
      n.speciesCount += make(cid, depth + 1, id);
    }
    return n.speciesCount;
  };
  const roots: string[] = [];
  for (let i = 0; i < (shape[0] ?? 1); i++) {
    roots.push(`r${i}`);
    make(`r${i}`, 0, null);
  }
  return new Tree({ version: 1, roots, nodes });
}

describe("navigation", () => {
  it("goes down to the first child, then back to the last visited one", () => {
    const t = real();
    const nav = new Navigator(t);
    expect(nav.current.id).toBe("lamniformes");
    nav.step(1);
    expect(nav.current.id).toBe("carcharhiniformes");
    nav.down();
    nav.down();
    nav.down();
    expect(nav.current.id).toBe("carcharhinus-acronotus");
    nav.up();
    nav.up();
    nav.up();
    expect(nav.current.id).toBe("carcharhiniformes");
    expect(nav.up()).toBe(false);
    nav.step(-1);
    nav.step(1);
    nav.down();
    expect(nav.current.id).toBe("carcharhinidae");
  });

  it("remembers the whole path after a jump", () => {
    const t = real();
    const nav = new Navigator(t);
    nav.go(t.get("rhincodon-typus")!);
    nav.go(t.get("orectolobiformes")!);
    nav.down();
    nav.down();
    expect(nav.current.id).toBe("rhincodon");
  });

  it("stops at the ends of the siblings and never flows into cousins", () => {
    const t = real();
    const nav = new Navigator(t, t.get("carcharodon-carcharias")!);
    expect(nav.step(1)).toBe(false);
    expect(nav.step(-1)).toBe(false);
    expect(nav.current.id).toBe("carcharodon-carcharias");
    const o = new Navigator(t, t.get("lamniformes")!);
    expect(o.step(-1)).toBe(false);
    expect(o.step(1)).toBe(true);
    expect(o.step(1)).toBe(true);
    expect(o.step(1)).toBe(true);
    expect(o.step(1)).toBe(true);
    expect(o.step(1)).toBe(true);
    expect(o.step(1)).toBe(true);
    expect(o.current.id).toBe("squatiniformes");
    expect(o.step(1)).toBe(false);
  });

  it("cannot go up from an order or down from a species", () => {
    const t = real();
    expect(new Navigator(t).current.rank).toBe("order");
    expect(new Navigator(t).up()).toBe(false);
    expect(new Navigator(t, t.get("rhincodon-typus")!).down()).toBe(false);
  });

  it("describes moves through the shared ancestor", () => {
    const t = real();
    const nav = new Navigator(t, t.get("lamniformes")!);
    const moves: Move[] = [];
    nav.subscribe((m) => moves.push(m));
    nav.step(1);
    nav.go(t.get("rhincodon-typus")!);
    nav.down(); // no-op
    expect(moves[0]).toMatchObject({ kind: "sibling", up: 1, down: 1, dx: 1, dy: 0 });
    expect(moves[0]!.via).toBe(t.root);
    expect(moves[1]).toMatchObject({ kind: "jump", up: 1, down: 4, dx: 1, dy: 1 });
    expect(moves).toHaveLength(2);
    nav.go(t.get("lamniformes")!);
    expect(moves[2]).toMatchObject({ kind: "jump", dx: -1 });
  });

  it("notifies on start", () => {
    const nav = new Navigator(real());
    let m: Move | undefined;
    nav.subscribe((x) => (m = x));
    nav.start();
    expect(m).toMatchObject({ kind: "init", from: null });
  });
});

describe("lineup selection", () => {
  it("shows the lineup of the real tree, capped at six", () => {
    const t = real();
    const ids = selectLineup(t, t.root).map((s) => s.id);
    expect(ids).toEqual(["squatina-squatina", "chlamydoselachus-anguineus", "somniosus-microcephalus", "sphyrna-mokarran", "carcharodon-carcharias", "rhincodon-typus"]);
  });

  it("caps at the maximum and represents every branch before a second pick", () => {
    const t = synth([4, 1, 1, 3]); // 4 orders x 3 species = 12
    const picks = selectLineup(t, t.root, 6);
    expect(picks).toHaveLength(6);
    const orders = new Set(picks.map((p) => p.parentNode!.parentNode!.parentNode!.id));
    expect(orders.size).toBe(4);
  });

  it("prefers curated representatives over bigger sharks", () => {
    const t = synth([1, 1, 1, 8]);
    const genus = t.get("r0.0.0")!;
    genus.childNodes[2]!.representative = true;
    const picks = selectLineup(t, genus, 3);
    expect(picks.map((p) => p.id)).toContain(genus.childNodes[2]!.id);
    expect(picks).toHaveLength(3);
  });

  it("sorts shortest first and skips species without a model", () => {
    const t = synth([1, 1, 1, 4], (i) => [5, 1, 3, 2][i]!);
    const genus = t.get("r0.0.0")!;
    delete genus.childNodes[1]!.model;
    expect(selectLineup(t, genus).map((s) => s.lengthM)).toEqual([2, 3, 5]);
  });
});

describe("lineup layout", () => {
  const base = { halfW: 2, halfH: 1.4, viewH: 800, top: 0.08, bottom: 0.47, labelPx: 36 };
  it("draws to scale on a shared baseline, diver first", () => {
    const l = layoutLineup({ ...base, lengthsM: [2, 4.5, 10] });
    expect(l.rows).toHaveLength(3);
    expect(l.diver.tailX).toBeCloseTo(l.rows[0]!.tailX);
    expect(new Set(l.rows.map((r) => r.unitsPerM)).size).toBe(1);
    expect(l.diver.y).toBeGreaterThan(l.rows[0]!.y); // diver is the first, topmost bar
    for (let i = 1; i < l.rows.length; i++) expect(l.rows[i]!.y).toBeLessThan(l.rows[i - 1]!.y);
    expect(DIVER_M * l.unitsPerM).toBeLessThan(2 * l.unitsPerM);
  });
  it("fits six sharks inside the zone and the width", () => {
    const l = layoutLineup({ ...base, lengthsM: [1, 2, 3, 4, 6, 12] });
    const lowest = l.rows[5]!;
    const floor = (0.5 - 0.47) * 2 * base.halfH;
    expect(lowest.y - (0.2 * 12 * l.unitsPerM) / 2).toBeGreaterThanOrEqual(floor - 1e-9);
    expect(12 * l.unitsPerM).toBeLessThanOrEqual(2 * base.halfW * 0.6 + 1e-9);
  });
});

describe("racetrack", () => {
  const shape = trackShape(1.15, 0.5, 2.2);
  it("is continuous around the lap", () => {
    let prev = trackPose(shape, 0);
    for (let t = 0.01; t < shape.period * 2; t += 0.01) {
      const p = trackPose(shape, t);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(shape.v * 0.011 + 1e-6);
      prev = p;
    }
  });
  it("closes on itself", () => {
    const a = trackPose(shape, 0);
    const b = trackPose(shape, shape.period - 1e-9);
    expect(b.x).toBeCloseTo(a.x, 3);
    expect(b.z).toBeCloseTo(a.z, 3);
  });
  it("enters from the left, off screen, in the far lane", () => {
    const p = trackPose(shape, -shape.lead / shape.v);
    expect(p.x).toBeLessThan(-2.2 - 1.15 * 0.5);
    expect(p.z).toBeLessThan(0);
  });
  it("keeps full speed on a wide view and slows down on a narrow one", () => {
    expect(speedScale(REF_HALF_W)).toBe(1);
    expect(speedScale(5)).toBe(1);
    const phone = speedScale(0.85);
    expect(phone).toBeLessThan(0.6);
    expect(phone).toBeGreaterThanOrEqual(0.4);
    expect(trackShape(1.15, 0.5, 0.85).v).toBeCloseTo(0.5 * 1.15 * phone, 6);
  });
  it("crosses a phone screen no faster than about twice as fast (in screen widths) as a desktop one", () => {
    const desktop = trackShape(1.15, 0.5, 2.4);
    const phone = trackShape(1.15, 0.5, 0.85);
    const perSecond = (s: { v: number }, halfW: number) => s.v / (2 * halfW);
    expect(perSecond(phone, 0.85) / perSecond(desktop, 2.4)).toBeLessThan(2.2);
  });
  it("runs partly off screen on a narrow view", () => {
    const narrow = trackShape(1.44, 0.22, 0.85);
    let maxX = 0;
    for (let t = 0; t < narrow.period; t += 0.05) maxX = Math.max(maxX, Math.abs(trackPose(narrow, t).x));
    expect(maxX).toBeGreaterThanOrEqual(0.85 - 0.01);
  });
});

describe("rail", () => {
  it("fans out only the current level and shows one dot above and below", () => {
    const t = synth([5, 1, 1, 1]);
    const cur = t.get("r2")!;
    const m = buildRail(cur, 4, cur.childNodes[0]);
    const byKind = (k: string) => m.dots.filter((d) => d.kind === k);
    expect(byKind("current")).toHaveLength(1);
    expect(byKind("sibling")).toHaveLength(4);
    expect(byKind("path")).toHaveLength(0);
    expect(byKind("next")).toHaveLength(1);
    expect(m.dots.filter((d) => d.row === 0)).toHaveLength(5);
    expect(m.more).toHaveLength(0);
  });
  it("marks siblings beyond the fan", () => {
    const t = synth([12, 1, 1, 1]);
    const m = buildRail(t.get("r5")!, 4, undefined);
    expect(m.more).toEqual([{ row: 0, side: -1 }, { row: 0, side: 1 }]);
    expect(m.dots.filter((d) => d.row === 0)).toHaveLength(5);
  });
});

describe("map layout", () => {
  it("lays out only unfolded branches and centres parents", () => {
    const t = synth([3, 3, 3, 3]);
    const closed = layoutMap(t, new Set());
    expect(closed.slots).toHaveLength(3);
    const open = layoutMap(t, pathOpenSet(t.get("r1.1.1.1")!));
    expect(open.slots.length).toBeLessThan(t.size);
    const first = t.roots[1]!;
    const kids = first.childNodes.map((c) => open.byNode.get(c)!.x);
    expect(open.byNode.get(first)!.x).toBeCloseTo((kids[0]! + kids[2]!) / 2);
  });
  it("handles hundreds of nodes quickly", () => {
    const t = synth([8, 8, 8, 4]); // 2048 species
    const t0 = performance.now();
    const l = layoutMap(t, pathOpenSet(t.get("r3.3.3.3")!));
    expect(performance.now() - t0).toBeLessThan(50);
    expect(l.slots.length).toBeLessThan(80);
  });
});
