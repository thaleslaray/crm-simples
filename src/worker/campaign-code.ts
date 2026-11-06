import { CAMPAIGN_CHANNEL_VALUES } from "./db/schema";

/** Canais de campanha e a letra de cada um no codigo. */
export const CAMPAIGN_CHANNELS = CAMPAIGN_CHANNEL_VALUES;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

const CHANNEL_LETTER: Record<CampaignChannel, string> = { meta: "M", google: "G", instagram: "I", tiktok: "T", outro: "O" };

/** Prefixo do codigo: 3 letras do produto (A-Z, sem acento; completa com X) + "-" + letra do canal. Ex.: `CUR-M`. */
export function codePrefix(productName: string, channel: CampaignChannel): string {
  const letters = productName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return `${letters.slice(0, 3).padEnd(3, "X")}-${CHANNEL_LETTER[channel]}`;
}

/** Proximo codigo do prefixo: maior numero ja usado + 1 (nunca reaproveita, nem de arquivada). `null` quando passa de 99. */
export function nextCode(prefix: string, usedCodes: readonly string[]): string | null {
  let max = 0;
  for (const code of usedCodes) {
    const m = code.startsWith(prefix) ? /^(\d{2})$/.exec(code.slice(prefix.length)) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max >= 99 ? null : `${prefix}${String(max + 1).padStart(2, "0")}`;
}
