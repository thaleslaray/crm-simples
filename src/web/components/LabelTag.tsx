import type { Label } from "../api";

/** Etiqueta discreta: bolinha na cor da etiqueta e o nome. */
export function LabelTag({ label }: { label: Pick<Label, "name" | "color"> }) {
  return (
    <span className="label-tag">
      <i style={{ background: label.color }} aria-hidden="true" />
      {label.name}
    </span>
  );
}
