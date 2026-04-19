import { vitePlugin as remix } from "@remix-run/dev";
import { transform } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/** JSX-in-.js from the webpack-era `src/` tree — must run before Vite import analysis. */
function legacySrcJsxPlugin(): Plugin {
  const srcRoot = path.join(repoRoot, "src") + path.sep;
  return {
    name: "legacy-src-jsx",
    enforce: "pre",
    async transform(code, id) {
      if (!id.startsWith(srcRoot) || !id.endsWith(".js")) return null;
      if (id.includes(`${path.sep}node_modules${path.sep}`)) return null;
      const result = await transform(code, {
        loader: "jsx",
        jsx: "automatic",
        format: "esm",
        sourcemap: true,
        sourcefile: id,
      });
      return { code: result.code, map: result.map ?? undefined };
    },
  };
}

export default defineConfig({
  server: {
    fs: {
      // Allow importing shared assets/CSS from the main app during migration.
      allow: [repoRoot],
    },
  },
  ssr: {
    noExternal: ["@intastellar/signin-sdk-react", "react-router-dom-v5"],
  },
  optimizeDeps: {
    include: [
      "@intastellar/signin-sdk-react",
      "chart.js",
      "react-chartjs-2",
      "punycode",
      "react-router-dom-v5",
    ],
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  resolve: {
    alias: {
      "@legacy": path.join(repoRoot, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    legacySrcJsxPlugin(),
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
