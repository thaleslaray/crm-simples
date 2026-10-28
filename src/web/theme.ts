// Tema do aparelho: preferência salva em localStorage (`crm.theme`) ou, em automático, o tema do sistema.
// O resultado vai para `<html data-theme>`, que os tokens de styles.css leem.
import { useEffect, useState } from "react";

export type ThemePreference = "auto" | "light" | "dark";

const KEY = "crm.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage bloqueado: segue o sistema
  }
  return "auto";
}

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref !== "auto") return pref;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function apply() {
  const theme = resolve(getThemePreference());
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111b21" : "#008069");
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // sem localStorage a escolha vale só até recarregar
  }
  apply();
}

/** Aplica o tema no carregamento e reage à troca do sistema enquanto estiver em automático. */
export function initTheme() {
  apply();
  window.matchMedia(DARK_QUERY).addEventListener("change", () => {
    if (getThemePreference() === "auto") apply();
  });
}

export function useThemePreference() {
  const [pref, setPref] = useState(getThemePreference);
  useEffect(() => setThemePreference(pref), [pref]);
  return [pref, setPref] as const;
}
