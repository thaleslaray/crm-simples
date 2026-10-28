// Sobe a Uazapi falsa (a mesma dos testes de borda) para o E2E. Controle: http://127.0.0.1:4010/__fake/*
import { startFakeUazapi } from "../test/fake-uazapi/server";
import { E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const fake = await startFakeUazapi({
  port: E2E_UAZAPI_PORT,
  defaults: [
    // Admin: lista de instancias. A primeira usa o token do ambiente do E2E, para o webhook seguir valendo se ela ficar escolhida.
    {
      method: "GET",
      path: "/instance/all",
      responses: [
        {
          body: [
            { id: "inst-loja", name: "Loja Centro", token: E2E_WEBHOOK.instanceToken, status: "disconnected", profileName: "", profilePicUrl: "" },
            { id: "inst-suporte", name: "Suporte", token: "token-suporte-e2e", status: "connected", profileName: "Suporte Laray", profilePicUrl: "" },
          ],
        },
      ],
    },
    { method: "POST", path: "/webhook", responses: [{ body: [] }] },
    {
      method: "GET",
      path: "/instance/status",
      responses: [{ body: { instance: { status: "connected" } } }],
    },
    {
      method: "POST",
      path: "/send/text",
      responses: [{ body: { id: "owner:e2e-out", messageid: "e2e-out" } }],
    },
    {
      method: "POST",
      path: "/message/markread",
      responses: [{ body: { ok: true } }],
    },
    // Foto de perfil: um SVG embutido, para a ficha mostrar uma imagem de verdade sem sair da maquina.
    {
      method: "POST",
      path: "/chat/details",
      responses: [
        {
          body: {
            image:
              "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%230f766e'/><circle cx='32' cy='26' r='12' fill='white'/></svg>",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/send/media",
      responses: [{ body: { id: "owner:e2e-media", messageid: "e2e-media" } }],
    },
  ],
});
console.log(`Uazapi falsa em ${fake.url}`);
process.on("SIGTERM", () => void fake.close().then(() => process.exit(0)));
process.on("SIGINT", () => void fake.close().then(() => process.exit(0)));
