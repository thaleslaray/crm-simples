import { env } from "cloudflare:workers";
import { api, postJson } from "./api";

export const SETUP_CODE = "frase-de-instalacao-teste";
export const DADOS = { name: "Dona do CRM", email: "dona@exemplo.com", password: "senha-longa-123" };

/** Chama o primeiro acesso pela borda, como se viesse do IP dado (a Cloudflare manda o IP real em `cf-connecting-ip`). */
export const primeiroAcesso = (body: Record<string, unknown>, ip = "203.0.113.50") =>
  postJson("/api/setup", { code: SETUP_CODE, ...DADOS, ...body }, { headers: { "cf-connecting-ip": ip } });

export const precisaDeSetup = async (): Promise<boolean> => ((await (await api("/api/setup")).json()) as { needed: boolean }).needed;

/** Roda `fn` com o SETUP_CODE trocado (ou removido, com `undefined`) e restaura no fim. */
export async function comSetupCode<T>(code: string | undefined, fn: () => Promise<T>): Promise<T> {
  const bag = env as unknown as { SETUP_CODE?: string };
  const antes = bag.SETUP_CODE;
  bag.SETUP_CODE = code;
  try {
    return await fn();
  } finally {
    bag.SETUP_CODE = antes;
  }
}
