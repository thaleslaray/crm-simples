import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  holdResponses,
  signInAsAdmin,
  spyOnSockets,
  waitForRealtime,
} from "./navegacao";
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
    const held = await holdResponses(page, "**/api/connection");
    await signInAsAdmin(page);
    await waitForRealtime(page);

    await connectionEvent(request, "disconnected");
    await expect(banner(page)).toBeVisible();

    await held.release();
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
    const held = await holdResponses(page, "**/api/workspace");
    await signInAsAdmin(page);
    await waitForRealtime(page);

    const saved = await page.request.patch("/api/workspace", {
      data: { companyName: name },
    });
    expect(saved.ok()).toBe(true);
    await expect(page).toHaveTitle(new RegExp(`${name}$`));

    await held.release();
    await expect(page).toHaveTitle(new RegExp(`${name}$`));
  } finally {
    await page.request.patch("/api/workspace", {
      data: { companyName: "Atendimento" },
    });
  }
});

test("lista de conversas: resposta atrasada da busca não apaga a conversa que chegou ao vivo", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  await spyOnSockets(page);
  const held = await holdResponses(page, "**/api/conversations");
  await signInAsAdmin(page);
  await waitForRealtime(page);

  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `trc-${run}`,
        messageid: `WATRC${run}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Ao vivo ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Cheguei",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
  const row = page.getByRole("link", { name: new RegExp(`Ao vivo ${run}`) });
  await expect(row).toBeVisible();

  await held.release();
  await expect(row).toBeVisible();
});
