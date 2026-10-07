import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/; the deploy workflow sets BASE_PATH. Locally it is just "/".
  base: process.env.BASE_PATH ?? "/",
  plugins: [preact()],
  build: { target: "es2022", chunkSizeWarningLimit: 700 },
  test: { include: ["tests/**/*.test.ts"] },
});
