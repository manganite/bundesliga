import { defineConfig } from "vite";

// Everything must end up in ONE file, so no code splitting and no separate
// asset requests. scripts/inline.mjs then folds the result into a single HTML.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 1e9,
    cssCodeSplit: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
});
