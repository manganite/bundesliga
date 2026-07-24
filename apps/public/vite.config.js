import { execSync } from "node:child_process";
import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The release version is maintained by hand in package.json (bumped per release
// brief — a standing rule in CLAUDE.md); the build stamp is injected here so a
// screenshot always carries which build produced it.
const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url)));
const shortHash = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; }
})();
const buildDate = new Date().toISOString().slice(0, 10);

// GitHub Pages serves a project page at /<repo>/. The deploy workflow publishes
// only this app's dist, so the base must match the repository name.
export default defineConfig({
  plugins: [react()],
  base: "/bundesliga/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_STAMP__: JSON.stringify(`${shortHash} · ${buildDate}`),
  },
  build: {
    outDir: "dist",
    // The worker is a real module worker; Vite needs to know so it can emit it
    // with the right format for the Pages base path.
    target: "es2022",
  },
  worker: {
    format: "es",
  },
});
