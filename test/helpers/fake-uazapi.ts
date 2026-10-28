/**
 * Controle da Uazapi falsa a partir dos testes (que rodam dentro do workerd, falando HTTP com o servidor
 * Node subido no globalSetup). Uso:
 *
 *   const uazapi = fakeUazapi();            // no topo do arquivo; ja faz reset a cada teste
 *   await uazapi.program("GET", "/instance/status", [{ status: 429, headers: { "Retry-After": "2" } }, { body: {...} }]);
 *   ... exercita o Worker / cliente ...
 *   expect(await uazapi.calls()).toHaveLength(1);
 */
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";
import type { ProgrammedResponse, RecordedCall } from "../fake-uazapi/server";

export type { ProgrammedResponse, RecordedCall };

async function control(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${env.UAZAPI_BASE_URL}/__fake${path}`, init);
  if (!res.ok) throw new Error(`Uazapi falsa: controle ${path} falhou (${res.status})`);
  return res;
}

export const fakeUazapi = () => {
  beforeEach(async () => {
    await (await control("/reset", { method: "POST" })).body?.cancel();
  });
  return {
    async program(method: string, path: string, responses: ProgrammedResponse[]): Promise<void> {
      await (
        await control("/program", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method, path, responses }),
        })
      ).body?.cancel();
    },
    async calls(): Promise<RecordedCall[]> {
      return (await (await control("/calls")).json()) as RecordedCall[];
    },
  };
};
