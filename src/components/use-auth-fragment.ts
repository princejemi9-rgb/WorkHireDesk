"use client";
import { useState, useSyncExternalStore } from "react";

// A per-mount external-store snapshot survives Strict Mode resubscription.
// Tokens are consumed from the browser location once and never persisted.
export function useAuthFragment() {
  const [store] = useState(() => {
    let snapshot: string | null = null;
    return {
      subscribe(listener: () => void) {
        if (snapshot === null) {
          snapshot = window.location.hash.slice(1);
          history.replaceState(null, "", window.location.pathname);
        }
        listener();
        return () => {};
      },
      getSnapshot: () => snapshot,
    };
  });
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}
