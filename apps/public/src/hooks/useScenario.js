import { useEffect, useRef, useState } from "react";

/**
 * The Szenarien worker, one instance shared by both tools.
 *
 * `request` is `{ kind: "whatif" | "sample", payload }`. A newer request
 * supersedes an in-flight one — a stale reply that arrives late is dropped.
 */
export function useScenario(request) {
  const [state, setState] = useState({ status: "idle", result: null, error: null });
  const workerRef = useRef(null);
  const nextId = useRef(0);
  const pending = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL("../worker/scenarioWorker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      if (id !== pending.current) return;
      setState(ok ? { status: "done", result, error: null } : { status: "error", result: null, error });
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!request || !workerRef.current) return;
    const id = ++nextId.current;
    pending.current = id;
    setState((s) => ({ ...s, status: "running" }));
    workerRef.current.postMessage({ id, kind: request.kind, payload: request.payload });
  }, [request]);

  return state;
}
