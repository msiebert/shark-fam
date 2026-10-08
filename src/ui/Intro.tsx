import { useEffect, useState } from "preact/hooks";
import { useServices } from "../app/context";

/** A quick "how to move" splash: the tree in miniature, with a light walking it the way the real controls would. */
const TITLE_MS = 3400;
const SHOW_MS = 4000;
const SEEN_KEY = "sharkfam:controls-seen";
const FADE_MS = 600;
const SEG_MS = 600;

const NODES = {
  a: [60, 20],
  b: [60, 70],
  c1: [25, 120],
  c2: [60, 120],
  c3: [95, 120],
  d: [60, 170],
} as const;
const LINKS: [keyof typeof NODES, keyof typeof NODES][] = [
  ["a", "b"],
  ["b", "c1"],
  ["b", "c2"],
  ["b", "c3"],
  ["c2", "d"],
];
type Dir = "up" | "down" | "left" | "right";
const WALK: { to: keyof typeof NODES; dir: Dir }[] = [
  { to: "b", dir: "down" },
  { to: "c2", dir: "down" },
  { to: "c3", dir: "right" },
  { to: "c2", dir: "left" },
  { to: "b", dir: "up" },
  { to: "a", dir: "up" },
];
const SWIPE: Record<Dir, [number, number]> = {
  up: [0, -22],
  down: [0, 22],
  left: [-22, 0],
  right: [22, 0],
};
const N = WALK.length;
const PCT = 100 / N;

const pct = (n: number) => `${+n.toFixed(2)}%`;

function css(): string {
  const dot: string[] = [];
  const at = (i: number) => NODES[i === 0 ? "a" : WALK[i - 1]!.to];
  for (let i = 0; i < N; i++) {
    const [fx, fy] = at(i);
    const [tx, ty] = at(i + 1);
    dot.push(
      `${pct(i * PCT + PCT * 0.15)}{transform:translate(${fx}px,${fy}px)}`,
    );
    dot.push(
      `${pct(i * PCT + PCT * 0.7)}{transform:translate(${tx}px,${ty}px)}`,
    );
  }
  const [lx, ly] = NODES.a;
  const out = [
    `@keyframes introDot{0%{transform:translate(${lx}px,${ly}px)}${dot.join("")}100%{transform:translate(${lx}px,${ly}px)}}`,
  ];

  for (const d of ["up", "down", "left", "right"] as Dir[]) {
    // Animate the real properties (no custom-property tricks) so each press ramps up and back down on its own.
    const OFF = "color:#86a5ad;border-color:rgba(111,201,196,.25);background:transparent";
    const ON = "color:#e9cf94;border-color:#e9cf94;background:rgba(233,207,148,.14)";
    const frames: string[] = [`0%{${OFF}}`];
    WALK.forEach((w, i) => {
      if (w.dir !== d) return;
      const t = (f: number) => pct(i * PCT + PCT * f);
      frames.push(`${t(0)}{${OFF}}`, `${t(0.12)}{${ON}}`, `${t(0.4)}{${ON}}`, `${t(0.6)}{${OFF}}`);
    });
    out.push(`@keyframes introKey-${d}{${frames.join("")}100%{${OFF}}}`);
    const [sx, sy] = SWIPE[d];
    const sw: string[] = [];
    WALK.forEach((w, i) => {
      if (w.dir !== d) return;
      sw.push(
        `${pct(i * PCT)}{opacity:0;transform:translate(${-sx}px,${-sy}px)}`,
        `${pct(i * PCT + PCT * 0.15)}{opacity:1;transform:translate(${-sx}px,${-sy}px)}`,
        `${pct(i * PCT + PCT * 0.75)}{opacity:1;transform:translate(${sx}px,${sy}px)}`,
        `${pct(i * PCT + PCT * 0.9)}{opacity:0;transform:translate(${sx}px,${sy}px)}`,
      );
    });
    out.push(
      `@keyframes introSwipe-${d}{0%{opacity:0}${sw.join("")}100%{opacity:0}}`,
    );
  }
  return out.join("");
}
const KEYFRAMES = css();

const KEYS: { dir: Dir; glyph: string }[] = [
  { dir: "up", glyph: "↑" },
  { dir: "left", glyph: "←" },
  { dir: "down", glyph: "↓" },
  { dir: "right", glyph: "→" },
];

/** Wordmark: a shark silhouette swims in, a family tree branches across it, then the name settles underneath. */
const SHARK =
  "M312 94 C290 74 255 64 218 64 C200 62 186 44 172 22 C166 44 160 62 146 66 C112 70 84 80 58 88 C44 66 30 46 12 34 C20 58 26 76 30 92 C26 108 20 128 12 150 C32 138 46 120 62 102 C96 108 130 112 160 112 C170 130 176 142 184 152 C196 138 204 122 210 112 C250 112 290 106 312 94 Z";
// [path, delay in s]: trunk first, then each split a beat later.
const BRANCHES: [string, number][] = [
  ["M30 92 L100 92", 0.9],
  ["M100 92 C125 92 135 76 160 76", 1.3],
  ["M100 92 C125 92 135 108 160 108", 1.3],
  ["M160 76 C185 76 195 68 225 68", 1.7],
  ["M160 76 C185 76 195 84 225 84", 1.7],
  ["M160 108 C185 108 195 100 225 100", 1.7],
  ["M160 108 C185 108 195 112 225 112", 1.7],
];
const LEAVES: [number, number][] = [
  [225, 68],
  [225, 84],
  [225, 100],
  [225, 112],
];

function Logo() {
  return (
    <div class="logo" role="img" aria-label="Shark Fam">
      <svg class="logoshark" viewBox="0 0 324 168" aria-hidden="true">
        <path class="sharkbody" d={SHARK} />
        {BRANCHES.map(([d, delay]) => (
          <path key={d} class="branch" pathLength={1} d={d} style={{ animationDelay: `${delay}s` }} />
        ))}
        <circle class="node" cx={30} cy={92} r={3.2} style={{ animationDelay: "0.9s" }} />
        {[160, 160].map((x, i) => (
          <circle key={i} class="node" cx={x} cy={i ? 108 : 76} r={2.6} style={{ animationDelay: "1.6s" }} />
        ))}
        {LEAVES.map(([x, y]) => (
          <circle key={y} class="node" cx={x} cy={y} r={2.4} style={{ animationDelay: "2.1s" }} />
        ))}
      </svg>
      <h1 class="introtitle">Shark Fam</h1>
    </div>
  );
}

function seenControls(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage unavailable: the hint just shows again next time */
  }
}

export function Intro() {
  const { reducedMotion } = useServices();
  const [phase, setPhase] = useState<"title" | "controls" | "fade" | "gone">(
    "title",
  );
  const touch =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

  // Title first; the controls follow only on a browser's first visit.
  useEffect(() => {
    if (phase !== "title") return;
    const t = window.setTimeout(
      () => setPhase(seenControls() ? "fade" : "controls"),
      reducedMotion ? 1200 : TITLE_MS,
    );
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== "controls") return;
    markSeen();
    const t = window.setTimeout(
      () => setPhase("fade"),
      reducedMotion ? 1800 : SHOW_MS,
    );
    return () => clearTimeout(t);
  }, [phase]);
  // Any key or tap skips whatever is showing.
  useEffect(() => {
    const skip = () => setPhase((p) => (p === "gone" ? p : "fade"));
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);
  useEffect(() => {
    if (phase !== "fade") return;
    const t = window.setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(t);
  }, [phase]);
  if (phase === "gone") return null;

  const dur = `${N * SEG_MS}ms`;
  const anim = (name: string) =>
    reducedMotion ? undefined : { animation: `${name} ${dur} linear infinite` };
  const start = NODES.a;

  return (
    <div
      class={"intro" + (phase === "fade" ? " out" : "")}
      data-testid="intro"
      aria-hidden="true"
    >
      <style>{KEYFRAMES}</style>
      {phase === "title" && <Logo />}
      {phase !== "title" && (
        <div class="introbody">
          <svg class="introtree" viewBox="0 0 120 190" width="120" height="190">
            {LINKS.map(([p, c]) => {
              const [x1, y1] = NODES[p];
              const [x2, y2] = NODES[c];
              const my = (y1 + y2) / 2;
              return (
                <path
                  key={p + c}
                  class="rl"
                  d={`M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
                />
              );
            })}
            {Object.entries(NODES).map(([k, [x, y]]) => (
              <circle key={k} class="rn" cx={x} cy={y} r={3} />
            ))}
            <circle
              class="introdot"
              r={5}
              style={{
                transform: `translate(${start[0]}px,${start[1]}px)`,
                ...anim("introDot"),
              }}
            />
          </svg>
          {touch ? (
            <div class="swipepad">
              {(["up", "down", "left", "right"] as Dir[]).map((d) => (
                <i key={d} class="finger" style={anim(`introSwipe-${d}`)} />
              ))}
              <span>Swipe to move</span>
            </div>
          ) : (
            <div class="keypad">
              {KEYS.map((k) => (
                <kbd
                  key={k.dir}
                  class={"key " + k.dir}
                  style={anim(`introKey-${k.dir}`)}
                >
                  {k.glyph}
                </kbd>
              ))}
              <span>Arrow keys to move</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
