import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      // Workaround for an npm workspace hoisting quirk: @powersync/common
      // ends up installed only under apps/desktop/node_modules (not hoisted
      // to the workspace root), but @powersync/shared-internals and
      // @powersync/tauri-plugin ARE hoisted to the root node_modules and
      // import '@powersync/common' as a bare specifier from there. Plain
      // Node/esbuild resolution walks up from the *importing file's*
      // location, so it never finds apps/desktop's copy - confirmed via
      // `vite build`/`vite dev`, both of which fail with "Could not resolve
      // '@powersync/common'" from
      // node_modules/@powersync/shared-internals/lib/client/*.js without
      // this alias.
      "@powersync/common": path.resolve(process.cwd(), "node_modules/@powersync/common"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
