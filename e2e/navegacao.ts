import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN } from "./e2e-env";

/** Abre um item das Configurações pela barra de ícones (computador) ou pela aba "Mais" (celular), sem recarregar a página. */
export async function openSettingsItem(page: Page, item: string | RegExp) {
  const desktop = (page.viewportSize()?.width ?? 0) >= 768;
  const rail = page.getByRole("navigation", { name: "Seções" });
  if (desktop) await rail.getByRole("link", { name: "Configurações" }).click();
  else
    await page
      .getByRole("navigation", { name: "Abas" })
      .getByRole("link", { name: "Mais" })
      .click();
  await page
    .getByRole("navigation", { name: "Configurações" })
    .getByRole("link", { name: item })
    .click();
}

/** Volta para a caixa de entrada pelo link Conversas da barra de ícones ou das abas. */
export async function backToInbox(page: Page) {
  await page.getByRole("link", { name: /^Conversas/ }).click();
}

/** Abre o menu ⋮ do cabeçalho da caixa de entrada (Perfil e Sair). */
export async function openUserMenu(page: Page) {
  await page.getByRole("button", { name: "Mais opções" }).click();
}

/** Entra como admin pela tela de login e espera a caixa de entrada aparecer. */
export async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(
    page.getByRole("navigation", { name: "Conversas" }),
  ).toBeVisible();
}

declare global {
  interface Window {
    __sockets: WebSocket[];
  }
}

/** Guarda os WebSockets que a página abre (chame antes do goto). O evento "websocket" do Playwright dispara na criação, não na abertura. */
export async function spyOnSockets(page: Page) {
  await page.addInitScript(() => {
    window.__sockets = [];
    const Real = window.WebSocket;
    window.WebSocket = class extends Real {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        window.__sockets.push(this);
      }
    };
  });
}

/** Espera o tempo real estar aberto (precisa de spyOnSockets antes), para o evento do teste não passar antes. */
export async function waitForRealtime(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sockets.some(
          (s) =>
            s.url.endsWith("/api/realtime") && s.readyState === WebSocket.OPEN,
        ),
      ),
    )
    .toBe(true);
}

/** Uma sessão de admin num contexto próprio (cookies separados), como uma segunda pessoa; com o tempo real aberto. */
export async function loggedInPage(browser: Browser, info: TestInfo) {
  const context = await browser.newContext(info.project.use);
  const page = await context.newPage();
  await spyOnSockets(page);
  await signInAsAdmin(page);
  await waitForRealtime(page);
  return { context, page };
}

/**
 * Segura as respostas GET que casam com `pattern` (o corpo é o de quando o pedido saiu) até `release()`:
 * simula uma busca lenta que termina depois de um evento do tempo real. `release` espera a tela receber tudo.
 */
export async function holdResponses(page: Page, pattern: string) {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const pending: Promise<void>[] = [];
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const real = await route.fetch().catch(() => null);
    if (!real) return; // o teste acabou no meio do pedido
    pending.push(gate.then(() => route.fulfill({ response: real })).catch(() => undefined));
  });
  return {
    async release() {
      open();
      await Promise.all(pending);
      // Uma ida e volta ao servidor para a tela processar as respostas soltas.
      await page.evaluate(() => fetch("/api/health").then(() => undefined));
    },
  };
}
