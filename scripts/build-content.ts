/**
 * Validates `content/` and compiles it into `public/data/`:
 *   index.json            the whole tree, compact, loaded eagerly
 *   species/<id>.json     per-species detail, loaded on demand
 * Exits non-zero on any problem so CI and `npm run dev` fail loudly.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileContent, ContentError } from "../src/data/compile";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readDir = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      try {
        return { file: `${dir}/${file}`, data: JSON.parse(readFileSync(join(root, dir, file), "utf8")) as unknown };
      } catch (e) {
        throw new ContentError([`${dir}/${file}: invalid JSON (${(e as Error).message})`]);
      }
    });

try {
  // What ships is public/models (optimized); a species pointing at a model that is missing there would 404 at runtime.
  const modelsDir = join(root, "public/models");
  const models = new Set(existsSync(modelsDir) ? readdirSync(modelsDir).filter((f) => f.endsWith(".glb")).map((f) => f.replace(/\.glb$/, "")) : []);
  const { index, details, warnings } = compileContent({ clades: readDir("content/clades"), species: readDir("content/species"), models });

  const out = join(root, "public/data");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "species"), { recursive: true });
  writeFileSync(join(out, "index.json"), JSON.stringify(index));
  for (const d of details) writeFileSync(join(out, "species", `${d.id}.json`), JSON.stringify(d));
  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`content: ${index.nodes.length} nodes, ${details.length} species`);
} catch (e) {
  if (e instanceof ContentError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
