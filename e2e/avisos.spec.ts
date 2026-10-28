import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

declare global {
  interface Window {
    __notifications: { title: string; body: string; tag: string; click: () => void }[];
    __beeps: number;
    __permissionAsks: number;
    __sockets: WebSocket[];
  }
}

/** Aba "sem foco" e navegador com Notification e WebAudio falsos, para observar o que o app faz. */
async function fakeBrowserAlerts(page: Page) {
  await page.addInitScript(() => {
    window.__notifications = [];
    window.__beeps = 0;
    window.__permissionAsks = 0;
    // O React em dev monta o efeito duas vezes: o primeiro socket do tempo real fecha logo. Guardo todos para
    // saber quando ha um realmente aberto (o evento "websocket" do Playwright dispara na criacao, nao na abertura).
    window.__sockets = [];
    const RealWebSocket = window.WebSocket;
    window.WebSocket = class extends RealWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        window.__sockets.push(this);
      }
    };
    document.hasFocus = () => false;
    class FakeNotification {
      static permission = "default";
      static requestPermission() {
        window.__permissionAsks++;
        FakeNotification.permission = "granted";
        return Promise.resolve("granted");
      }
      onclick: (() => void) | null = null;
      constructor(title: string, opts: { body: string; tag: string }) {
        window.__notifications.push({ title, body: opts.body, tag: opts.tag, click: () => this.onclick?.() });
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
    class FakeAudio {
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createGain() {
        const node = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
        return node;
      }
      createOscillator() {
        window.__beeps++;
        return { frequency: { value: 0 }, connect: (n: unknown) => n, start() {}, stop() {} };
      }
    }
    Object.defineProperty(window, "AudioContext", { value: FakeAudio, configurable: true });
  });
}

/** O cliente escreve pelo webhook, como a Uazapi entregaria. */
async function clientWrites(request: APIRequestContext, run: string, phone: string, n: number) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `av-${run}-${n}`,
        messageid: `WAAV${run}${n}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: `Aviso ${n}`,
        messageTimestamp: Date.now() + n,
      },
    },
  });
  expect(res.status()).toBe(200);
}

/** Entra como admin; o clique em "Entrar" é o gesto que libera som e pede a permissão. Só devolve com o tempo real aberto. */
async function loginWithRealtime(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation", { name: "Conversas" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__sockets.some((s) => s.url.endsWith("/api/realtime") && s.readyState === WebSocket.OPEN)))
    .toBe(true);
  await page.mouse.click(5, 5);
  await expect.poll(() => page.evaluate(() => window.__permissionAsks)).toBe(1);
}

test("mensagem nova com a aba em segundo plano toca som, notifica com nome e prévia, e clicar abre a conversa; título mostra não lidas", async ({
  page,
  request,
}, info) => {
  await fakeBrowserAlerts(page);
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  await loginWithRealtime(page);

  // Conversa sem responsável: avisa todos os atendentes (aqui, o admin)
  await clientWrites(request, run, phone, 1);

  await expect.poll(() => page.evaluate(() => window.__notifications.length)).toBe(1);
  expect(await page.evaluate(() => window.__notifications[0])).toMatchObject({ title: `Cliente ${run}`, body: "Aviso 1" });
  expect(await page.evaluate(() => window.__beeps)).toBe(1);
  await expect(page).toHaveTitle(/^\(\d+\) CRM WhatsApp$/);

  // Clicar na notificação abre a conversa
  await page.evaluate(() => window.__notifications[0]!.click());
  await expect(page).toHaveURL(/\/conversas\//);
  await expect(page.getByRole("article", { name: `Conversa com Cliente ${run}` })).toBeVisible();
});

test("conversa de um colega não avisa, a minha avisa, e mensagem enviada pela equipe não avisa", async ({ page, request }, info) => {
  await fakeBrowserAlerts(page);
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const alerts = () => page.evaluate(() => ({ notifications: window.__notifications.length, beeps: window.__beeps }));
  const item = page.getByRole("link", { name: new RegExp(`Cliente ${run}`) }).first();
  await loginWithRealtime(page);

  // Um colega para ser o responsável (sessão própria no `request`; o admin segue na página)
  const origin = new URL(page.url()).origin;
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await request.post("/api/auth/sign-in/email", { data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password }, headers: { origin } });
  const invite = (await (await request.post("/api/admin/invites", { data: { role: "atendente" }, headers: { origin } })).json()) as { token: string };
  const joined = await request.post(`/api/invites/${invite.token}`, {
    data: { name: `Colega ${stamp}`, email: `colega-${stamp}@exemplo.com`, password: "senha-do-colega-1" },
    headers: { origin },
  });
  expect(joined.ok()).toBe(true);
  const colleagueId = ((await (await page.request.get("/api/members")).json()) as { members: { id: string; name: string }[] }).members.find(
    (m) => m.name === `Colega ${stamp}`,
  )!.id;

  // Primeira mensagem: conversa sem responsável avisa o admin
  await clientWrites(request, run, phone, 1);
  await expect.poll(async () => (await alerts()).notifications).toBe(1);
  const conversationId = ((await (await page.request.get("/api/conversations")).json()) as { conversations: { id: string; contact: { phone: string } }[] })
    .conversations.find((c) => c.contact.phone === phone)!.id;

  // O colega assume (atribuída a ele): mensagem do cliente não avisa o admin
  const assigned = await page.request.post(`/api/conversations/${conversationId}/assign`, { data: { userId: colleagueId } });
  expect(assigned.ok()).toBe(true);
  await clientWrites(request, run, phone, 2);
  await expect(item).toContainText("Aviso 2"); // o app já processou o evento
  expect(await alerts()).toEqual({ notifications: 1, beeps: 1 });

  // Transferida para o admin: a mensagem seguinte avisa só ele
  const transferred = await page.request.post(`/api/conversations/${conversationId}/assign`, {
    data: { userId: ((await (await page.request.get("/api/me")).json()) as { user: { id: string } }).user.id },
  });
  expect(transferred.ok()).toBe(true);
  await clientWrites(request, run, phone, 3);
  await expect.poll(async () => (await alerts()).notifications).toBe(2);

  // Resposta da equipe (saída) nunca avisa
  await request.post(`http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake/program`, {
    data: { method: "POST", path: "/send/text", responses: [{ status: 200, body: { id: `owner:av-out-${run}` } }] },
  });
  const sent = await page.request.post(`/api/conversations/${conversationId}/messages`, { data: { text: `Resposta ${run}` } });
  expect(sent.ok()).toBe(true);
  await expect(item).toContainText(`Resposta ${run}`);
  expect(await alerts()).toEqual({ notifications: 2, beeps: 2 });
});
