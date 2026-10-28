import { useCallback, useEffect, useState } from "react";
import { api, type Funnel } from "./api";
import { onRealtime } from "./realtime";

/** Funis e etapas da equipe; `null` enquanto carrega. Busca de novo ao reconectar e quando algo muda. */
export function useFunnels(): Funnel[] | null {
  const [funnels, setFunnels] = useState<Funnel[] | null>(null);
  const load = useCallback(() => {
    api.funnels().then((r) => setFunnels(r.funnels)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    return onRealtime((e) => {
      if (e.type === "funnel.changed" || e.type === "reconnected") load();
    });
  }, [load]);
  return funnels;
}
