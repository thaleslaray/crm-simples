import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { signInAsNewAttendant } from "./atendente";
import { E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";
import { expect, test } from "./fixtures";
import { openSettingsItem, signInAsAdmin } from "./navegacao";

const UAZAPI = `http://127.0.0.1:${E2E_UAZAPI_PORT}`;
const ADMIN_TOKEN = "admin-token-e2e-secreto-9876";
const qr = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/AAAA`;

const program = (request: APIRequestContext, method: string, route: string, body: unknown) =>
  request.post(`${UAZAPI}/__fake/program`, { data: { method, path: route, responses: [{ body }] } });

/** Com E2E_PRINTS, salva um print nomeado do passo (revisão visual); sem a variável não faz nada. */
async function print(page: Page, name: string, projeto: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: path.join(dir, `${name}-${projeto}.png`), fullPage: true });
}

test("admin informa o admin token, escolhe e cria instâncias e conecta o número com a escolhida; atendente não vê a tela", async ({
  page,
  request,
}, info) => {
  await signInAsAdmin(page);
  // Número desconectado: é quando a tela oferece "Conectar número".
  await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { EventType: "connection", token: E2E_WEBHOOK.instanceToken, instance: { status: "disconnected" }, type: "Disconnected" },
  });

  // Passo 1: instalação sem dados da Uazapi pede endereço e admin token e não oferece "Conectar número".
  await page.route("**/api/admin/uazapi", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { configured: false } }) : route.fallback(),
  );
  await openSettingsItem(page, /Conexão do número/);
  await expect(page.getByText("Informe os dados da Uazapi para escolher a instância e conectar o número.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar número" })).toBeHidden();
  await print(page, "passo1-admin-token", info.project.name);

  // Salva: a Uazapi falsa confirma o admin token (lista as instâncias) antes de o CRM gravar.
  await page.unroute("**/api/admin/uazapi");
  await page.getByLabel("Endereço do servidor").fill(UAZAPI);
  await page.getByLabel("Admin token").fill(ADMIN_TOKEN);
  await page.getByRole("button", { name: "Salvar" }).click();

  // Passo 2: resumo com o fim do admin token e a lista de instâncias.
  const resumo = page.getByTestId("uazapi-resumo");
  await expect(resumo).toContainText(`Servidor: ${UAZAPI}`);
  await expect(resumo).toContainText("Admin token ••••9876");
  await expect(resumo).not.toContainText(ADMIN_TOKEN);
  const loja = page.getByRole("listitem").filter({ hasText: "Loja Centro" });
  const suporte = page.getByRole("listitem").filter({ hasText: "Suporte" });
  await expect(loja).toContainText("Desconectada");
  await expect(suporte).toContainText("Conectada");
  await expect(suporte).toContainText("Suporte Laray");
  await expect(page.getByRole("button", { name: "Conectar número" })).toBeHidden();
  await print(page, "passo2-instancias", info.project.name);

  // Nenhum token (nem de instância) volta do servidor.
  for (const url of ["/api/admin/uazapi", "/api/admin/uazapi/instances"]) {
    const text = await (await page.request.get(url)).text();
    for (const secreto of [ADMIN_TOKEN, E2E_WEBHOOK.instanceToken, "token-suporte-e2e"]) expect(text).not.toContain(secreto);
  }

  // Cria uma instância nova: ela entra em uso.
  const nova = { id: "inst-nova", name: "Atendimento Novo", token: "token-nova-e2e", status: "disconnected", profileName: "", profilePicUrl: "" };
  await program(request, "POST", "/instance/create", { response: "ok", instance: nova, name: nova.name, token: nova.token });
  await program(request, "GET", "/instance/all", [
    { id: "inst-loja", name: "Loja Centro", token: E2E_WEBHOOK.instanceToken, status: "disconnected", profileName: "", profilePicUrl: "" },
    nova,
  ]);
  await page.getByLabel("Nova instância").fill(nova.name);
  await page.getByRole("button", { name: "Criar" }).click();
  const criada = page.getByRole("listitem").filter({ hasText: nova.name });
  await expect(criada).toContainText("Em uso");

  // Escolhe a Loja (o token dela é o do ambiente do E2E, então o webhook segue valendo).
  await program(request, "GET", "/instance/status", { instance: { status: "disconnected" } });
  await expect(loja.getByRole("button", { name: "Usar esta" })).toBeVisible();
  await loja.getByRole("button", { name: "Usar esta" }).click();
  await expect(loja).toContainText("Em uso");
  await expect(criada.getByRole("button", { name: "Usar esta" })).toBeVisible();

  // Passo 3: com a instância escolhida, o pareamento (QR) vale para ela.
  await program(request, "POST", "/instance/connect", { instance: { status: "connecting", qrcode: qr } });
  await program(request, "GET", "/instance/status", { instance: { status: "connecting", qrcode: qr } });
  await page.getByRole("button", { name: "Conectar número" }).click();
  await expect(page.getByRole("img", { name: "QR code para conectar o WhatsApp" })).toHaveAttribute("src", qr);
  await print(page, "passo3-conectar", info.project.name);

  // "Alterar" reabre o formulário com o endereço e sem o admin token.
  await resumo.getByRole("button", { name: "Alterar" }).click();
  await expect(page.getByLabel("Endereço do servidor")).toHaveValue(UAZAPI);
  await expect(page.getByLabel("Admin token")).toHaveValue("");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(resumo).toBeVisible();

  // Devolve o estado: número conectado e Uazapi sem dados salvos, como o resto da suíte espera (valem as variáveis de ambiente).
  await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { EventType: "connection", token: E2E_WEBHOOK.instanceToken, instance: { status: "connected" } },
  });
  expect((await page.request.delete("/api/admin/uazapi")).status()).toBe(200);
  await request.post(`${UAZAPI}/__fake/reset`);

  // Atendente não vê a tela nem acessa as rotas.
  await page.context().clearCookies();
  await signInAsNewAttendant(page);
  const desktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (desktop) await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: "Configurações" }).click();
  else await page.getByRole("navigation", { name: "Abas" }).getByRole("link", { name: "Mais" }).click();
  await expect(page.getByRole("navigation", { name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Conexão do número/ })).toBeHidden();
  expect((await page.request.get("/api/admin/uazapi")).status()).toBe(403);
  expect((await page.request.get("/api/admin/uazapi/instances")).status()).toBe(403);
});
