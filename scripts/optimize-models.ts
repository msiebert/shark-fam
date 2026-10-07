/**
 * Optimizes the GLBs the Blender pipeline writes to `models/` into web-ready files in `public/models/`.
 *   - albedo down to 1024x2048 WebP, micro-detail maps down to 512x512 WebP
 *   - geometry compressed with meshopt
 * Run after adding or regenerating a model:  npm run models [-- name ...]
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization, ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "models");
const out = join(root, "public/models");
mkdirSync(out, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
void EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization;

const wanted = process.argv.slice(2);
const files = readdirSync(src).filter((f) => f.endsWith(".glb") && (!wanted.length || wanted.includes(f.replace(/\.glb$/, ""))));
for (const f of files) {
  const doc = await io.read(join(src, f));
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 2048], slots: /baseColor/, quality: 82 }),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], slots: /normal|metallicRoughness/, quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(join(out, f), doc);
  console.log(`${f}: ${(statSync(join(src, f)).size / 1024).toFixed(0)} KB -> ${(statSync(join(out, f)).size / 1024).toFixed(0)} KB`);
}
