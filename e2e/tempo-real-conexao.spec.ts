import type { APIRequestContext, Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInAsAdmin, spyOnSockets, waitForRealtime } from "./navegacao";
import { E2E_WEBHOOK } from "./e2e-env";

const connectionEvent = (request: APIRequestContext, status: string) =>
  request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "connection",
      token: E2E_WEBHOOK.instanceToken,
      instance: { status },
      ...(status === "disconnected" ? { type: "Disconnected" } : {}),
    },
  });

const banner = (page: Page) =>
  page.getByText("WhatsApp desconectado: as mensagens não estão chegando.");

const socketOpen = (page: Page) =>
  page.evaluate(() =>
    window.__sockets.some(
      (s) => s.url.endsWith("/api/realtime") && s.readyState === WebSocket.OPEN,
    ),
  );

test("o que mudou antes de o tempo real abrir pela primeira vez aparece sem recarregar", async ({
  page,
  request,
}) => {
  await connectionEvent(request, "disconnected");
  try {
    await spyOnSockets(page);
    // Antes de o socket abrir, a busca do estado devolve o retrato antigo (o número ainda "conectado").
    await page.route("**/api/connection", async (route) => {
      const real = await route.fetch();
      if (await socketOpen(page)) return route.fulfill({ response: real });
      const body = (await real.json()) as { connection: object };
      return route.fulfill({
        response: real,
        json: {
          ...body,
          connection: {
            ...body.connection,
            status: "connected",
            temporaryBan: false,
          },
        },
      });
    });
    await signInAsAdmin(page);
    await waitForRealtime(page);
    await expect(banner(page)).toBeVisible();
  } finally {
    await connectionEvent(request, "connected");
  }
});

test("resposta atrasada da busca não desfaz um evento mais novo", async ({
  page,
  request,
}) => {
  try {
    await spyOnSockets(page);
    // Segura as respostas de /api/connection (o corpo é o de quando o pedido saiu) até o teste soltar.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const delivered: Promise<void>[] = [];
    await page.route("**/api/connection", async (route: Route) => {
      const real = await route.fetch();
      delivered.push(gate.then(() => route.fulfill({ response: real })));
    });
    await signInAsAdmin(page);
    await waitForRealtime(page);

    await connectionEvent(request, "disconnected");
    await expect(banner(page)).toBeVisible();

    release();
    await Promise.all(delivered);
    // Uma ida e volta ao servidor para a tela processar as respostas soltas.
    await page.evaluate(() => fetch("/api/health").then(() => undefined));
    await expect(banner(page)).toBeVisible();
  } finally {
    await connectionEvent(request, "connected");
  }
});

test("nome da empresa: resposta atrasada da busca não desfaz a troca mais nova", async ({
  page,
}, info) => {
  const name = `Loja ${info.project.name} ${Date.now()}`;
  try {
    await spyOnSockets(page);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const delivered: Promise<void>[] = [];
    await page.route("**/api/workspace", async (route: Route) => {
      if (route.request().method() !== "GET") return route.continue();
      const real = await route.fetch();
      delivered.push(gate.then(() => route.fulfill({ response: real })));
    });
    await signInAsAdmin(page);
    await waitForRealtime(page);

    const saved = await page.request.patch("/api/workspace", {
      data: { companyName: name },
    });
    expect(saved.ok()).toBe(true);
    await expect(page).toHaveTitle(new RegExp(`${name}$`));

    release();
    await Promise.all(delivered);
    await page.evaluate(() => fetch("/api/health").then(() => undefined));
    await expect(page).toHaveTitle(new RegExp(`${name}$`));
  } finally {
    await page.unroute("**/api/workspace");
    await page.request.patch("/api/workspace", {
      data: { companyName: "Atendimento" },
    });
  }
});
