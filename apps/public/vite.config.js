import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project page at /<repo>/. The deploy workflow publishes
// only this app's dist, so the base must match the repository name.
export default defineConfig({
  plugins: [react()],
  base: "/bundesliga/",
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
