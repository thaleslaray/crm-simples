/** Origens fixas de um negocio (sem campanha), na ordem em que a tela e o relatorio as mostram. */
export const MANUAL_ORIGINS = [
  { value: "indicacao", label: "Indicação" },
  { value: "organico", label: "Orgânico" },
  { value: "cliente_antigo", label: "Cliente antigo" },
  { value: "outro", label: "Outro" },
] as const;

export type ManualOrigin = (typeof MANUAL_ORIGINS)[number]["value"];

export const MANUAL_ORIGIN_VALUES: readonly string[] = MANUAL_ORIGINS.map((o) => o.value);

/** Rotulo da origem fixa; `undefined` se nao for uma delas. */
export const manualOriginLabel = (value: string | null): string | undefined => MANUAL_ORIGINS.find((o) => o.value === value)?.label;
