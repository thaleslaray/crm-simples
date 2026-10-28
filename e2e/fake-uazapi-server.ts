// Sobe a Uazapi falsa (a mesma dos testes de borda) para o E2E. Controle: http://127.0.0.1:4010/__fake/*
import { startFakeUazapi } from "../test/fake-uazapi/server";
import { E2E_UAZAPI_PORT } from "./e2e-env";

const fake = await startFakeUazapi({
  port: E2E_UAZAPI_PORT,
  defaults: [
    { method: "GET", path: "/instance/status", responses: [{ body: { instance: { status: "connected" } } }] },
    { method: "POST", path: "/send/text", responses: [{ body: { id: "owner:e2e-out", messageid: "e2e-out" } }] },
    { method: "POST", path: "/send/media", responses: [{ body: { id: "owner:e2e-media", messageid: "e2e-media" } }] },
  ],
});
console.log(`Uazapi falsa em ${fake.url}`);
process.on("SIGTERM", () => void fake.close().then(() => process.exit(0)));
process.on("SIGINT", () => void fake.close().then(() => process.exit(0)));
