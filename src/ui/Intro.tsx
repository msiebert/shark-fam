import { useEffect, useState } from "preact/hooks";
import { useServices } from "../app/context";

/** A quick "how to move" splash: the tree in miniature, with a light walking it the way the real controls would. */
const TITLE_MS = 2200;
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
      {phase === "title" && <h1 class="introtitle">Shark Fam</h1>}
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
