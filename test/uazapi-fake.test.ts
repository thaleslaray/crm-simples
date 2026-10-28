import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { createUazapiClient, UazapiHttpError, UazapiTimeoutError } from "../src/worker/uazapi/client";
import { fakeUazapi } from "./helpers/fake-uazapi";

describe("Uazapi falsa + cliente Uazapi", () => {
  const uazapi = fakeUazapi();

  it("grava a chamada recebida e devolve a resposta programada", async () => {
    await uazapi.program("GET", "/instance/status", [{ body: { instance: { status: "connected" } } }]);

    const status = await createUazapiClient(env).getInstanceStatus();

    expect(status).toEqual({ status: "connected" });
    const calls = await uazapi.calls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/instance/status" });
    expect(calls[0]!.headers.token).toBe(env.UAZAPI_INSTANCE_TOKEN);
  });

  it("429: espera ao menos o Retry-After (com jitter) e tenta de novo", async () => {
    await uazapi.program("GET", "/instance/status", [
      { status: 429, headers: { "Retry-After": "2" }, body: { error: "rate limit" } },
      { body: { instance: { status: "connecting" } } },
    ]);
    const waits: number[] = [];
    const client = createUazapiClient(env, { sleep: async (ms) => void waits.push(ms), random: () => 1 });

    expect(await client.getInstanceStatus()).toEqual({ status: "connecting" });

    expect(waits).toEqual([2500]); // Retry-After 2s + jitter maximo de 25%
    expect(await uazapi.calls()).toHaveLength(2);
  });

  it("429 persistente: desiste depois das tentativas e expoe o erro", async () => {
    await uazapi.program("GET", "/instance/status", [{ status: 429, body: { error: "rate limit" } }]);
    const waits: number[] = [];
    const client = createUazapiClient(env, { maxRetries: 2, sleep: async (ms) => void waits.push(ms), random: () => 1 });

    const err = await client.getInstanceStatus().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UazapiHttpError);
    expect(err).toMatchObject({ status: 429 });
    expect(waits).toEqual([500, 1000]); // backoff exponencial sem Retry-After
    expect(await uazapi.calls()).toHaveLength(3);
  });

  it("devolve erro 500 programado", async () => {
    await uazapi.program("GET", "/instance/status", [{ status: 500, body: { error: "boom" } }]);
    await expect(createUazapiClient(env).getInstanceStatus()).rejects.toMatchObject({ status: 500 });
  });

  it("simula atraso: o cliente estoura o timeout", async () => {
    await uazapi.program("GET", "/instance/status", [{ delayMs: 500, body: { instance: { status: "connected" } } }]);
    await expect(createUazapiClient(env, { timeoutMs: 100 }).getInstanceStatus()).rejects.toBeInstanceOf(
      UazapiTimeoutError,
    );
    // A chamada chegou na Uazapi mesmo assim (importante: nunca reenviar automaticamente em timeout).
    expect(await uazapi.calls()).toHaveLength(1);
  });

  it("chamada sem resposta programada falha de forma ruidosa (501)", async () => {
    await expect(createUazapiClient(env).getInstanceStatus()).rejects.toMatchObject({ status: 501 });
  });
});
