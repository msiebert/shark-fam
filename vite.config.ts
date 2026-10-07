import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: { target: "es2022", chunkSizeWarningLimit: 700 },
  test: { include: ["tests/**/*.test.ts"] },
});
