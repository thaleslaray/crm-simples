import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}`;
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="#0f766e"/></svg>';

async function receive(
  request: APIRequestContext,
  message: Record<string, unknown>,
) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { EventType: "messages", token: E2E_WEBHOOK.instanceToken, message },
  });
  expect(res.status()).toBe(200);
}

async function program(
  request: APIRequestContext,
  method: string,
  path: string,
  response: Record<string, unknown>,
) {
  const res = await request.post(`${FAKE}/__fake/program`, {
    data: { method, path, responses: [response] },
  });
  expect(res.ok()).toBe(true);
}

test("mídia recebida: carregando, imagem, documento e localização, sem estourar a tela", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  const jid = `${phone}@s.whatsapp.net`;
  const base = Date.now() - 60_000;
  const common = (n: number) => ({
    id: `e2e-m-${run}-${n}`,
    messageid: `WM${run}${n}`,
    chatid: jid,
    sender: jid,
    senderName: `Midia ${run}`,
    fromMe: false,
    isGroup: false,
    messageTimestamp: base + n * 1000,
  });

  // 1) A Uazapi falsa ainda não tem o arquivo (501): a mídia fica "carregando" (a fila tenta de novo só em 5 s).
  await receive(request, {
    ...common(1),
    messageType: "ImageMessage",
    mediaType: "image",
    text: "Primeira foto",
    content: {
      mimetype: "image/svg+xml",
      fileLength: SVG.length,
      caption: "Primeira foto",
    },
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("link", { name: new RegExp(`Midia ${run}`) }).click();
  const conversation = page.getByRole("article", {
    name: `Conversa com Midia ${run}`,
  });
  await expect(conversation.getByText("Carregando mídia…")).toBeVisible();
  await expect(
    conversation.getByText("Primeira foto", { exact: true }),
  ).toBeVisible();

  // 2) Agora o arquivo existe: a pendente é baixada na nova tentativa, e as outras mídias já nascem prontas.
  await program(request, "POST", "/message/download", {
    body: { fileURL: `${FAKE}/files/e2e.svg`, mimetype: "image/svg+xml" },
  });
  await program(request, "GET", "/files/e2e.svg", {
    headers: { "content-type": "image/svg+xml" },
    body: SVG,
  });
  await receive(request, {
    ...common(2),
    messageType: "DocumentMessage",
    mediaType: "document",
    content: {
      mimetype: "application/pdf",
      fileName: "contrato.pdf",
      fileLength: 2048,
    },
  });
  await receive(request, {
    ...common(3),
    messageType: "LocationMessage",
    content: {
      degreesLatitude: -23.55,
      degreesLongitude: -46.63,
      name: "Escritório",
      address: "Av. Paulista, 1000",
    },
  });
  await page.reload();

  const image = conversation.getByRole("img", { name: "Primeira foto" });
  await expect(async () => {
    await page.reload();
    await expect(image).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  expect(
    await image.evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBeGreaterThan(0);

  await expect(
    conversation.getByRole("link", { name: /contrato\.pdf/ }),
  ).toBeVisible();
  await expect(conversation.getByText("Escritório")).toBeVisible();
  await expect(
    conversation.getByRole("link", { name: "Ver no mapa" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
