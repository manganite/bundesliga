import { useEffect, useRef, useState } from "react";

/**
 * Run the season simulation in a worker.
 *
 * Default run counts follow §3: 20 000 for the current outlook, a lower default
 * on a small screen with a note, and the UI is never blocked either way.
 *
 * IMPORTANT: this recomputes the CURRENT VIEW only. It never becomes the basis
 * of a displayed matchday delta — those come from the committed canonical
 * artefact, so raising or lowering the run count here cannot silently change a
 * historical difference (§3).
 */
export const DEFAULT_RUNS = 20000;
export const MOBILE_RUNS = 5000;

export function defaultRunCount() {
  if (typeof window === "undefined") return DEFAULT_RUNS;
  const small = window.matchMedia?.("(max-width: 720px)")?.matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  return small || cores <= 4 ? MOBILE_RUNS : DEFAULT_RUNS;
}

export function useSimulation(request) {
  const [state, setState] = useState({ status: "idle", result: null, error: null });
  const workerRef = useRef(null);
  const nextId = useRef(0);
  const pending = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL("../worker/simWorker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      if (id !== pending.current) return; // a stale run finished after a newer one started
      setState(ok ? { status: "done", result, error: null } : { status: "error", result: null, error });
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!request || !workerRef.current) return;
    const id = ++nextId.current;
    pending.current = id;
    setState((s) => ({ ...s, status: "running" }));
    workerRef.current.postMessage({ id, payload: request });
  }, [request]);

  return state;
}
