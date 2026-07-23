// ============================================================================
//  Bundle the app's JSX so tests can render the REAL components.
//
//  The pages are JSX and Node cannot import them directly; the project runs no
//  transpiler of its own and is not going to grow one for the tests. So the
//  app's own toolchain does the work: vite builds `entry.jsx` in SSR mode, and
//  the tests render the result with react-dom/server.
//
//  That matters more than it sounds. The last round of UI defects here — a 54-row
//  cross product, truncated scores, overlapping labels — were all invisible to
//  logic tests and only showed up in a browser. Rendering the actual components
//  is the cheapest thing that would have caught the first two.
// ============================================================================

import path from "node:path";
import { build } from "vite";

const ROOT = path.resolve(import.meta.dirname, "../..");
// node:test runs each test FILE in its own process, in parallel. A single shared
// output directory would let two concurrent builds clobber each other's bundle
// mid-write — a race that surfaces as a spurious failure once enough test files
// consume the harness. Per-process output keeps them independent; all of `.out`
// is gitignored.
const OUT = path.join(import.meta.dirname, ".out", `p${process.pid}`);

let built = null;

/** Build once per test process, then import the bundle. */
export function harness() {
  built ??= (async () => {
    await build({
      root: ROOT,
      logLevel: "error",
      build: {
        ssr: path.join(import.meta.dirname, "entry.jsx"),
        outDir: OUT,
        emptyOutDir: true,
        // Only the bundle. Copying public/ would duplicate the whole synced
        // data directory on every test run for nothing.
        copyPublicDir: false,
        // React stays external so the test and the bundle share one instance.
        rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime", "react-dom/server"] },
      },
    });
    return import(path.join(OUT, "entry.js"));
  })();
  return built;
}
