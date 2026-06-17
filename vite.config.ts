// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// better-sqlite3 uses CJS bindings — must stay external on Node (Render + server.js).
const nativeDb = ["better-sqlite3", "bindings", "file-uri-to-path"];

// Cloudflare worker bundle breaks Node hosting; disable for Render.
export default defineConfig({
  cloudflare: false,
  vite: {
    ssr: { external: nativeDb },
    build: {
      rollupOptions: {
        external: nativeDb,
      },
    },
  },
});
