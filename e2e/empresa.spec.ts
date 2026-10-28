import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN } from "./e2e-env";

// O D1 do E2E é compartilhado entre todos os testes: o nome volta ao padrão no fim.
const DEFAULT_NAME = "Atendimento";

async function loggedInPage(browser: Browser, info: TestInfo) {
  const context = await browser.newContext(info.project.use);
  const page = await context.newPage();
  // Guarda os WebSockets para saber quando o tempo real está aberto (senão o evento do teste pode passar antes).
  await page.addInitScript(() => {
    const w = window as unknown as { __sockets: WebSocket[] };
    w.__sockets = [];
    const Real = window.WebSocket;
    window.WebSocket = class extends Real {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        w.__sockets.push(this);
      }
    };
  });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation", { name: "Conversas" })).toBeVisible();
  // Em dev os sockets do tempo real se reabrem logo depois do login: só segue quando o conjunto ficou estável por 1,5 s.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __sockets: WebSocket[]; __stable?: { key: string; since: number } };
      const key = w.__sockets.map((x) => x.readyState).join(",");
      if (w.__stable?.key !== key) w.__stable = { key, since: Date.now() };
      return w.__sockets.some((x) => x.readyState === WebSocket.OPEN) && Date.now() - w.__stable.since > 1500;
    },
    undefined,
    { polling: 200 },
  );
  return { context, page };
}

/** Salva pela tela e confere no servidor; repete se a tela remontou no meio e devolveu o campo ao valor antigo. */
async function saveName(page: Page, name: string) {
  await page.goto("/empresa");
  await expect(async () => {
    await page.getByLabel("Nome da empresa").fill(name);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("status")).toHaveText("Nome salvo.", { timeout: 1500 });
    const saved = (await (await page.request.get("/api/workspace")).json()) as { companyName: string };
    expect(saved.companyName).toBe(name);
  }).toPass();
}

test("o admin troca o nome da empresa e o título muda numa segunda aba, no login e na lista", async ({ browser, page }, info) => {
  const name = `Loja ${info.project.name} ${Date.now()}`;
  const first = await loggedInPage(browser, info);
  const second = await loggedInPage(browser, info);
  try {
    await expect(second.page).toHaveTitle(new RegExp(`${DEFAULT_NAME}$`));

    await saveName(first.page, name);

    // Segunda aba: sem recarregar, título e cabeçalho da lista trocam.
    await expect(second.page.getByRole("heading", { name })).toBeVisible();
    await expect(second.page).toHaveTitle(new RegExp(`${name}$`));

    // Quem ainda não entrou vê o nome novo no login e na aba.
    await page.goto("/login");
    await expect(page.getByTestId("company-name-login")).toHaveText(name);
    await expect(page).toHaveTitle(name);
  } finally {
    await saveName(first.page, DEFAULT_NAME);
    await first.context.close();
    await second.context.close();
  }
});

test("nome vazio não salva", async ({ browser }, info) => {
  const { context, page } = await loggedInPage(browser, info);
  await page.goto("/empresa");
  // A área logada pode remontar logo após o login e devolver o campo ao valor salvo: repete até pegar.
  await expect(async () => {
    await page.getByLabel("Nome da empresa").fill("   ");
    await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled({ timeout: 500 });
  }).toPass();
  await context.close();
});
