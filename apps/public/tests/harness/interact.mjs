// ============================================================================
//  Client interaction harness (§Codex §1) — the layer the SSR harness cannot be.
//
//  `renderToStaticMarkup` sees markup once and never again: no state changes, no
//  events, no focus, no worker. Findings 1 and 2 of the Codex review lived in
//  exactly that blind spot. This harness mounts the REAL bundle (the same one
//  `build.mjs` produces) into a jsdom document with `react-dom/client` and drives
//  it with real DOM events. It ADDS to the SSR harness; it does not replace it.
//
//  No new test dependency: jsdom is already present, React 19 ships `act`, and
//  the scenario Worker is polyfilled by calling the worker's own `handleMessage`
//  synchronously — the same logic the browser runs, without a real thread.
// ============================================================================

import { JSDOM } from "jsdom";
import { harness } from "./build.mjs";
import { handleMessage } from "../../src/worker/scenarioWorker.js";

let setup = null;

export function interactHarness() {
  setup ??= (async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/bundesliga/",
      pretendToBeVisual: true,
    });
    const w = dom.window;
    // Some globals (navigator) are read-only getters in Node 24; assign via
    // defineProperty so it works whether or not the slot is writable.
    const setGlobal = (k, v) => {
      try { globalThis[k] = v; } catch { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
    };
    setGlobal("window", w);
    setGlobal("document", w.document);
    setGlobal("navigator", w.navigator);
    for (const k of [
      "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Element",
      "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "getComputedStyle",
      "DocumentFragment", "NodeList",
    ]) setGlobal(k, w[k]);
    globalThis.requestAnimationFrame = w.requestAnimationFrame ?? ((cb) => setTimeout(() => cb(Date.now()), 0));
    globalThis.cancelAnimationFrame = w.cancelAnimationFrame ?? ((id) => clearTimeout(id));
    // React's act() needs this flag to flush effects deterministically.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    // jsdom has no Worker. Drive the real worker logic synchronously (one
    // microtask later, so it looks async to the hook).
    globalThis.Worker = class {
      constructor() { this.onmessage = null; this.onerror = null; }
      postMessage(data) {
        const reply = handleMessage(data);
        queueMicrotask(() => { this.onmessage?.({ data: reply }); });
      }
      terminate() {}
    };

    // Import React BEFORE the vite build below: `build()` sets
    // NODE_ENV=production, and React's production build omits `act`. Forcing the
    // dev env and importing first gives us `act`; the bundle externalises React,
    // so it shares this same (dev) instance — a production bundle runs fine on
    // it, elements are just data. (Unconditional, in case CI pre-sets production;
    // vite's build() controls its own build mode independently of NODE_ENV.)
    process.env.NODE_ENV = "development";
    const ReactMod = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    const React = ReactMod.default ?? ReactMod;
    const act = React.act ?? ReactMod.act;

    const bundle = await harness();
    return { React, createRoot: ReactDOMClient.createRoot, act, bundle, window: w, document: w.document };
  })();
  return setup;
}

/**
 * Mount an element, returning helpers. Every state-changing call must run inside
 * `act` so React flushes effects and re-renders before the next assertion.
 */
export async function mount(element) {
  const { createRoot, act } = await interactHarness();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return {
    container,
    root,
    async render(next) { await act(async () => { root.render(next); }); },
    async act(fn) { await act(async () => { await fn(); }); },
    unmount() { root.unmount(); container.remove(); },
    $(sel) { return container.querySelector(sel); },
    $all(sel) { return [...container.querySelectorAll(sel)]; },
    text() { return container.textContent ?? ""; },
  };
}

/** Fire a key on an element (focus first, as a real keyboard user would). */
export async function pressKey(view, el, key) {
  await view.act(async () => {
    el.focus();
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

/** Set a form control's value and fire the change React listens for. */
export async function setValue(view, el, value) {
  await view.act(async () => {
    el.value = value;
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

/** Click an element the way a user would (bubbling MouseEvent). */
export async function click(view, el) {
  await view.act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}
