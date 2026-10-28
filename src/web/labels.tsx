import { useCallback, useEffect, useState } from "react";
import { api, type Label } from "./api";
import { onRealtime } from "./realtime";

/** Texto preto ou branco, conforme o brilho da cor da etiqueta (hex `#rrggbb`). */
function readableOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

/** Etiqueta como pílula colorida. */
export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="label-chip" style={{ background: label.color, color: readableOn(label.color) }}>
      {label.name}
    </span>
  );
}

/** Etiquetas da equipe; busca de novo ao abrir e quando o admin muda algo. */
export function useLabels(): Label[] {
  const [labels, setLabels] = useState<Label[]>([]);
  const load = useCallback(() => {
    api.labels().then((r) => setLabels(r.labels)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    return onRealtime((e) => {
      if (e.type === "labels.changed" || e.type === "reconnected") load();
    });
  }, [load]);
  return labels;
}
