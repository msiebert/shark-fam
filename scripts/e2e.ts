/**
 * End-to-end checks in a real (headless) Chromium, at desktop and phone sizes. Screenshots go to .e2e/.
 *   npm run build && npm run e2e            # serves dist/ with vite preview
 *   E2E_URL=http://localhost:5173/ npm run e2e   # or point at a running dev server
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

// CHROME_PATH wins; otherwise the sandbox browser if present; otherwise the one `playwright-core install chromium` fetched.
const SANDBOX_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROME = process.env.CHROME_PATH ?? (existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const OUT = ".e2e";
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok: boolean, what: string, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function serve(): Promise<{ url: string; stop: () => void }> {
  if (process.env.E2E_URL) return { url: process.env.E2E_URL, stop: () => {} };
  const port = 4799;
  const p: ChildProcess = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore" });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, stop: () => p.kill() };
}

interface Actor {
  id: string;
  mode: string;
  alpha: number;
  leaving: boolean;
  gone: boolean;
  visible: boolean;
  pose: { x: number; y: number; z: number; yaw: number; s: number } | null;
  bend: number;
  roll: number;
}
const state = (page: Page) => page.evaluate(() => (window as any).__scene.debugState()) as Promise<{ time: number; view: string; actors: Actor[] }>;
const here = (page: Page) => page.evaluate(() => (window as any).__nav.current.id as string);
const key = async (page: Page, k: string, wait = 150) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(wait);
};

async function run(browser: Browser, name: string, vp: { width: number; height: number }, mobile: boolean, base: string, reduced = false) {
  console.log(`\n== ${name}${reduced ? " (reduced motion)" : ""} ${vp.width}x${vp.height}`);
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (n: string) => page.screenshot({ path: `${OUT}/${name}-${reduced ? "rm-" : ""}${n}.png` });

  await page.goto(base);
  await page.waitForSelector('[data-testid="info"]');
  await page.waitForFunction(() => (window as any).__scene?.debugState().actors.some((a: any) => a.visible), null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot("01-start");

  // The window never scrolls.
  const scroll = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check(scroll.sh <= scroll.ih && scroll.sw <= scroll.iw, "page is exactly viewport-sized", JSON.stringify(scroll));
  await page.mouse.wheel(0, 0);
  const first = await state(page);
  check((await here(page)) === "lamniformes", "the tree starts at the first order");
  check(first.view === "lineup" && first.actors.filter((a) => a.visible).length === 2, "an order with two modelled sharks shows a lineup of two");
  await key(page, "ArrowUp", 300);
  check((await here(page)) === "lamniformes", "up from an order goes nowhere");

  // Navigation model.
  await key(page, "ArrowLeft");
  check((await here(page)) === "lamniformes", "left stops at the first sibling");
  await key(page, "ArrowRight", 1600);
  check((await here(page)) === "carcharhiniformes", "right moves to the next sibling");
  await key(page, "ArrowRight", 1600);
  await key(page, "ArrowRight");
  check((await here(page)) === "orectolobiformes", "right stops at the last sibling and never flows into cousins");
  await key(page, "ArrowLeft", 1600);

  // Sibling hop timing: the old text leaves (~0.3 s) before the new text arrives, never overlapping.
  await key(page, "ArrowDown", 1600); // carcharhiniformes -> sphyrnidae
  await key(page, "ArrowDown", 1600); // -> sphyrna
  check((await here(page)) === "sphyrna", "down returns through families");
  const timeline: { t: number; ghost: number; fresh: number }[] = [];
  // Text timing, read from the browser's own animation timeline so software-GL frame rate cannot skew it.
  const timing = (await page.evaluate(`(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    return new Promise((resolve) => setTimeout(() => {
      const t = (name) => {
        const a = document.getAnimations().find((x) => x.animationName === name);
        if (!a) return null;
        const c = a.effect.getComputedTiming();
        return { delay: c.delay, duration: c.duration };
      };
      resolve({ out: t("slideOut"), in: t("slideIn") });
    }, 30));
  })()`)) as { out: { delay: number; duration: number } | null; in: { delay: number; duration: number } | null };
  await page.waitForTimeout(1500);
  if (!reduced) {
    check(!!timing.out && timing.out.duration <= 350, "old text leaves in about 0.3 s", JSON.stringify(timing.out));
    check(!!timing.in && !!timing.out && timing.in.delay >= timing.out.delay + timing.out.duration - 1, "new text starts only after the old has left (no overlap)", JSON.stringify(timing.in));
    check(!!timing.in && timing.in.duration >= 800 && timing.in.duration <= 1200, "new text arrives over about 1 s", String(timing.in?.duration));
  } else {
    check(!timing.out && (!timing.in || timing.in.duration === 0), "reduced motion: no text animation", JSON.stringify(timing));
  }

  // Carry-over: a shark in the genus lineup glides into its swim path; it is the same actor, never respawned.
  await page.goto(`${base}#sphyrna`);
  await page.waitForFunction(() => (window as any).__scene?.debugState().actors.some((a: any) => a.visible && a.alpha > 0.99), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const before = (await state(page)).actors.find((a) => a.id === "sphyrna-mokarran")!;
  await key(page, "ArrowDown", 60);
  const samples: { t: number; a: Actor }[] = [];
  for (let i = 0; i < 24; i++) {
    const s = await state(page);
    const a = s.actors.find((x) => x.id === "sphyrna-mokarran")!;
    samples.push({ t: s.time, a });
    await page.waitForTimeout(80);
  }
  check(samples.every((s) => s.a.visible && !s.a.leaving && s.a.alpha > 0.99), "carry-over: the same shark stays opaque and visible (no fade/respawn)");
  check(samples[0]!.a.mode === "swim", "carry-over: it switches to its swim path");
  let maxStep = 0;
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i - 1]!.a.pose!;
    const q = samples[i]!.a.pose!;
    maxStep = Math.max(maxStep, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
  }
  check(maxStep < 0.45 * before.pose!.s, "carry-over: the glide is continuous", `largest step ${maxStep.toFixed(3)} world units`);
  await shot("02-species-glide");
  await page.waitForTimeout(3500);
  await shot("03-species");
  const sp = await state(page);
  check(sp.view === "species" && sp.actors.filter((a) => a.visible && !a.leaving).length === 1, "species view shows exactly one shark");

  // The shark swims a full lap: pass, U-turn toward the camera, pass back, turn away.
  const xs: number[] = [];
  const zs: number[] = [];
  const ys: number[] = [];
  const yaws: number[] = [];
  const bends: number[] = [];
  const rolls: number[] = [];
  for (let i = 0; i < 80; i++) {
    await page.evaluate("window.__scene.debugAdvance(0.25)"); // scene time, not wall time: software GL is slow
    const a = (await state(page)).actors.find((x) => x.id === "sphyrna-mokarran" && x.visible)!;
    xs.push(a.pose!.x);
    zs.push(a.pose!.z);
    ys.push(a.pose!.y);
    yaws.push(a.pose!.yaw);
    bends.push(a.bend);
    rolls.push(a.roll);
  }
  check(Math.max(...ys) - Math.min(...ys) < 0.2, "species: depth stays roughly constant", `y range ${(Math.max(...ys) - Math.min(...ys)).toFixed(3)}`);
  check(Math.min(...yaws) < -Math.PI * 1.5, "species: it completes the turns (yaw passes a half turn and beyond)");
  check(Math.max(...bends.map(Math.abs)) > 0.08, "species: the body bends into the turns", `peak bend ${Math.max(...bends.map(Math.abs)).toFixed(3)}`);
  check(bends.every((b) => Math.abs(b) <= 0.141) && bends.some((b) => Math.abs(b) < 0.01), "species: the bend is bounded and relaxes on the straights");
  check(Math.max(...rolls.map(Math.abs)) > 0.08 && Math.max(...rolls.map(Math.abs)) <= 0.221, "species: it banks into the turns", `peak roll ${Math.max(...rolls.map(Math.abs)).toFixed(3)}`);
  check(Math.max(...zs) - Math.min(...zs) > 0.2, "species: the shark swims toward and away from the camera (racetrack)", `z range ${(Math.max(...zs) - Math.min(...zs)).toFixed(2)}`);
  check(Math.max(...xs) - Math.min(...xs) > 0.8, "species: the shark crosses the view", `x range ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)}`);

  // Species facts and the Wikipedia link.
  const link = await page.locator("a.wiki").getAttribute("href");
  check(link === "https://en.wikipedia.org/wiki/Great_hammerhead", "species: Wikipedia link", String(link));
  check((await page.locator("a.wiki").getAttribute("target")) === "_blank", "species: link opens in a new tab");
  check((await page.locator(".facts li").count()) === 2 && (await page.locator(".range svg").count()) === 1, "species: Depth, Eats and a distribution map");

  // Leaving a species: the shark swims off to the right while fading.
  const x0 = (await state(page)).actors.find((a) => a.id === "sphyrna-mokarran")!.pose!.x;
  // Hop to a shark that is not in the old view (going up would carry the same shark into the genus lineup).
  await page.evaluate("window.__nav.go(window.__nav.tree.get('rhincodon-typus'))");
  await page.waitForTimeout(150);
  await page.evaluate("window.__scene.debugAdvance(0.35)");
  const mid = (await state(page)).actors.find((a) => a.id === "sphyrna-mokarran")!;
  check(mid.leaving && mid.alpha < 0.95 && mid.pose!.x > x0 - 0.05, "leaving: fading and drifting right", `alpha ${mid.alpha.toFixed(2)}, dx ${(mid.pose!.x - x0).toFixed(2)}`);
  await page.waitForTimeout(1200);
  await page.evaluate("window.__nav.go(window.__nav.tree.get('sphyrnidae'))");
  await page.waitForTimeout(800);

  // Tree map.
  await key(page, "m", 900);
  check(await page.locator('[data-testid="map"]').isVisible(), "M opens the tree map");
  await shot("04-map");
  const nodes = await page.locator(".mn").count();
  check(nodes >= 5, "map shows the unfolded path", `${nodes} nodes`);
  await page.locator('[data-testid="fold-lamniformes"]').click();
  await page.waitForTimeout(900);
  check((await page.locator('[data-testid="map-carcharodon"]').count()) === 0, "map: unfolding is lazy (genus below the folded family is not drawn yet)");
  await shot("05-map-unfolded");
  await key(page, "Escape", 800);
  check((await page.locator('[data-testid="map"]').count()) === 0, "Esc closes the map");
  await page.keyboard.press("t");
  await page.waitForTimeout(700);
  for (const id of ["orectolobiformes", "rhincodontidae", "rhincodon"]) {
    await page.locator(`[data-testid="fold-${id}"]`).click();
    await page.waitForTimeout(500);
  }
  await page.locator('[data-testid="map-rhincodon-typus"]').click();
  await page.waitForTimeout(500);
  check((await here(page)) === "rhincodon-typus", "map: clicking a name dives there");
  check((await page.evaluate(() => location.hash)) === "#rhincodon-typus", "URL hash follows the node");

  // Rail dots and lineup labels.
  await page.locator('[data-testid="rail-orectolobiformes"]').dispatchEvent("click");
  await page.waitForTimeout(400);
  check((await here(page)) === "orectolobiformes", "rail: dots are clickable");
  await page.goto(base);
  await page.waitForFunction(() => (window as any).__scene?.debugState().actors.some((a: any) => a.visible), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="lbl-carcharodon-carcharias"]').click();
  await page.waitForTimeout(500);
  check((await here(page)) === "carcharodon-carcharias", "lineup: clicking a shark's name dives to its species");

  // Shareable hash.
  await page.goto(`${base}#rhincodon-typus`);
  await page.waitForSelector('[data-testid="info"]');
  check((await here(page)) === "rhincodon-typus", "opening a hash lands on that node");
  await page.waitForTimeout(2500);
  await shot("06-whale");

  check(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

const srv = await serve();
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"] });
try {
  await run(browser, "desktop", { width: 1280, height: 800 }, false, srv.url);
  await run(browser, "phone", { width: 390, height: 844 }, true, srv.url);
  await run(browser, "desktop", { width: 1280, height: 800 }, false, srv.url, true);
} finally {
  await browser.close();
  srv.stop();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
