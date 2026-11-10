import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  { status: "loading" } | { status: "error"; error: unknown } | { status: "loaded"; data: T };

type Settled<T> = { key: string } & (
  { status: "error"; error: unknown } | { status: "loaded"; data: T }
);

/**
 * Loads data for a key (e.g. the order list filter) and reloads when the key changes or reload()
 * is called. While the result for the current key is pending the state is "loading".
 */
export function useAsyncData<T>(key: string, load: () => Promise<T>) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const requestKey = `${key}#${tick}`;
  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (data) => active && setSettled({ key: requestKey, status: "loaded", data }),
      (error: unknown) => active && setSettled({ key: requestKey, status: "error", error }),
    );
    return () => {
      active = false;
    };
  }, [requestKey]);

  const state: AsyncState<T> =
    settled && settled.key === requestKey
      ? settled.status === "loaded"
        ? { status: "loaded", data: settled.data }
        : { status: "error", error: settled.error }
      : { status: "loading" };

  const reload = useCallback(() => setTick((value) => value + 1), []);

  /** Updates the loaded data in place (a row action), without reloading. */
  const update = useCallback((change: (data: T) => T) => {
    setSettled((current) =>
      current && current.status === "loaded" ? { ...current, data: change(current.data) } : current,
    );
  }, []);

  return { state, reload, update };
}
