import { vitePlugin as remix } from "@remix-run/dev";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig({
  server: {
    fs: {
      // Allow importing shared assets/CSS from the main app during migration.
      allow: [repoRoot],
    },
  },
  resolve: {
    alias: {
      "@legacy": path.join(repoRoot, "src"),
    },
  },
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
});
