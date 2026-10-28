import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const UAZAPI = `http://127.0.0.1:${E2E_UAZAPI_PORT}`;
// PNG 1x1: basta para o <img> carregar; o teste distingue um QR do outro pelo src.
const qr = (cor: string) => `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/${cor}`;

const program = (request: APIRequestContext, method: string, path: string, body: unknown) =>
  request.post(`${UAZAPI}/__fake/program`, { data: { method, path, responses: [{ body }] } });

const connectionEvent = (request: APIRequestContext, status: string, type?: string) =>
  request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { EventType: "connection", token: E2E_WEBHOOK.instanceToken, instance: { status }, ...(type ? { type } : {}) },
  });

test("admin vê a faixa vermelha quando o número cai, reconecta pelo QR code e a faixa some", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation", { name: "Conversas" })).toBeVisible();

  // O número cai: a faixa aparece sem recarregar
  expect((await connectionEvent(request, "disconnected", "Disconnected")).status()).toBe(200);
  const banner = page.getByText("Número do WhatsApp desconectado");
  await expect(banner).toBeVisible();

  // Tela de conexão: faixa continua no topo e há o botão de conectar
  await page.getByRole("link", { name: "Conexão" }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Desconectado");
  await expect(banner).toBeVisible();

  await program(request, "POST", "/webhook", []);
  await program(request, "POST", "/instance/connect", { instance: { status: "connecting", qrcode: qr("AAAA") } });
  await program(request, "GET", "/instance/status", { instance: { status: "connecting", qrcode: qr("AAAA") } });
  await page.getByRole("button", { name: "Conectar número" }).click();
  const image = page.getByRole("img", { name: "QR code para conectar o WhatsApp" });
  await expect(page.getByTestId("connection-status")).toHaveText("Conectando");
  await expect(image).toHaveAttribute("src", qr("AAAA"));

  // O QR code se atualiza sozinho
  await program(request, "GET", "/instance/status", { instance: { status: "connecting", qrcode: qr("BBBB") } });
  await expect(image).toHaveAttribute("src", qr("BBBB"), { timeout: 10_000 });

  // O celular escaneia: a Uazapi avisa e tudo volta ao normal
  await connectionEvent(request, "connected");
  await expect(page.getByTestId("connection-status")).toHaveText("Conectado");
  await expect(banner).toBeHidden();
  await expect(page.getByText("Mensagens não estão chegando nem saindo")).toBeHidden();

  // Sem horizontal scroll em nenhum viewport
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await request.post(`${UAZAPI}/__fake/reset`);
});

test("TemporaryBan aparece como tal na faixa", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation", { name: "Conversas" })).toBeVisible();

  await connectionEvent(request, "disconnected", "TemporaryBan");
  await expect(page.getByText("baniu o número temporariamente")).toBeVisible();

  await connectionEvent(request, "connected");
  await expect(page.getByText("baniu o número temporariamente")).toBeHidden();
});
