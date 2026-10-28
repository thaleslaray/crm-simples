import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_WEBHOOK } from "./e2e-env";

type WithSockets = { __sockets: WebSocket[] };

async function clientWrites(request: APIRequestContext, id: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `fn-${id}`,
        messageid: `WAFN${id}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${id}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Quero fechar negócio",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

/** Com E2E_PRINTS, salva um print do passo (revisao visual); sem a variavel nao faz nada. */
async function snap(page: Page, name: string, project: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: `${dir}/funis-${name}-${project}.png`, fullPage: true });
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

/** Guarda os WebSockets do tempo real para saber quando um esta realmente aberto (padrao de avisos.spec.ts). */
async function trackSockets(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as WithSockets;
    w.__sockets = [];
    const RealWebSocket = window.WebSocket;
    window.WebSocket = class extends RealWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        w.__sockets.push(this);
      }
    };
  });
}

const realtimeOpen = (page: Page) =>
  page.waitForFunction(() => (window as unknown as WithSockets).__sockets.some((s) => s.readyState === WebSocket.OPEN));

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Atendimento" })).toBeVisible();
}

/** Arrasta o card pela alca ate o centro da coluna: mouse no desktop, toque (CDP) no celular. */
async function dragCard(page: Page, grip: Locator, column: Locator, touch: boolean) {
  const from = (await grip.boundingBox())!;
  const col = (await column.boundingBox())!;
  const viewport = page.viewportSize()!;
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  const tx = Math.min(col.x + col.width / 2, viewport.width - 12);
  const ty = col.y + Math.min(col.height / 2, 90);
  const steps = 12;
  const at = (i: number) => ({ x: sx + ((tx - sx) * i) / steps, y: sy + ((ty - sy) * i) / steps });
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
    await send("touchStart", at(0));
    for (let i = 1; i <= steps; i++) await send("touchMove", at(i));
    await send("touchEnd");
    await cdp.detach();
  } else {
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(at(i).x, at(i).y);
    await page.mouse.up();
  }
}

test("admin monta o funil, a equipe arrasta o card e o colega ve ao vivo; a ficha altera a etapa e apagar etapa com cards pede destino", async ({ page, request, browser }, info) => {
  const project = info.project.name;
  const touch = project === "mobile";
  const run = `${project}${Date.now()}`;
  const funnelName = `Vendas${run}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const clientName = `Cliente ${run}`;
  await clientWrites(request, run, phone);

  await trackSockets(page);
  await login(page);

  // Cadastro (admin): funil e tres etapas
  await page.getByRole("link", { name: "Funis" }).click();
  await page.getByRole("link", { name: "Gerenciar funis" }).click();
  await page.getByLabel("Nome do funil", { exact: true }).fill(funnelName);
  await page.getByRole("button", { name: "Criar funil" }).click();
  const editor = page.getByRole("region", { name: `Funil ${funnelName}` });
  await expect(editor).toBeVisible();
  for (const stage of ["Novo", "Fechado", "Extra"]) {
    await editor.getByLabel(`Nova etapa em ${funnelName}`).fill(stage);
    await editor.getByRole("button", { name: `Adicionar etapa em ${funnelName}` }).click();
    await expect(editor.getByLabel(`Nome da etapa ${stage}`)).toBeVisible();
  }
  // Reordena: Extra sobe uma posicao e volta
  await editor.getByRole("button", { name: "Subir etapa Extra" }).click();
  await expect(editor.getByLabel(/^Nome da etapa/).nth(1)).toHaveValue("Extra");
  await editor.getByRole("button", { name: "Descer etapa Extra" }).click();
  await expect(editor.getByLabel(/^Nome da etapa/).nth(2)).toHaveValue("Extra");
  await snap(page, "cadastro", project);
  await noHorizontalOverflow(page);
  await page.getByRole("link", { name: "Voltar" }).click();

  // Quadro: adiciona o contato escolhendo a etapa inicial
  await page.getByRole("button", { name: funnelName, exact: true }).click();
  await page.getByText("Adicionar contato").click();
  await page.getByLabel("Etapa inicial").selectOption({ label: "Novo" });
  await page.getByLabel("Buscar contato para adicionar").fill(phone.slice(-6));
  await page.getByRole("button", { name: `Adicionar ${clientName}` }).click();
  const novo = page.getByRole("region", { name: "Etapa Novo" });
  const fechado = page.getByRole("region", { name: "Etapa Fechado" });
  await expect(novo.getByText(clientName)).toBeVisible();
  await snap(page, "quadro", project);
  await noHorizontalOverflow(page);

  // Um colega com o mesmo quadro aberto em outra sessao
  const colleagueCtx = await browser.newContext(info.project.use);
  const colleague = await colleagueCtx.newPage();
  await trackSockets(colleague);
  await login(colleague);
  await colleague.goto("/funis");
  await colleague.getByRole("button", { name: funnelName, exact: true }).click();
  await expect(colleague.getByRole("region", { name: "Etapa Novo" }).getByText(clientName)).toBeVisible();
  await realtimeOpen(colleague);
  await realtimeOpen(page);

  // Arrasta Novo -> Fechado
  await dragCard(page, page.getByRole("button", { name: `Arrastar ${clientName}` }), fechado, touch);
  await expect(fechado.getByText(clientName)).toBeVisible();
  await expect(novo.getByText(clientName)).toHaveCount(0);
  await snap(page, "movido", project);
  // O colega ve a mudanca sem recarregar
  await expect(colleague.getByRole("region", { name: "Etapa Fechado" }).getByText(clientName)).toBeVisible();
  await snap(colleague, "colega", project);
  await colleagueCtx.close();
  // E ela persiste
  await page.reload();
  await page.getByRole("button", { name: funnelName, exact: true }).click();
  await expect(page.getByRole("region", { name: "Etapa Fechado" }).getByText(clientName)).toBeVisible();

  // O chip do funil fica marcado e o card abre a conversa
  await expect(page.getByRole("button", { name: funnelName, exact: true })).toHaveAttribute("aria-pressed", "true");
  const fechadoCard = page.getByRole("region", { name: "Etapa Fechado" }).getByRole("link", { name: new RegExp(`Abrir conversa de ${clientName}`) });
  await expect(fechadoCard).toContainText("Quero fechar negócio");
  await expect(fechadoCard).toContainText("Aberta");
  await snap(page, "card", project);
  await fechadoCard.click();
  await expect(page).toHaveURL(/\/conversas\/[^/?]+$/);
  await page.goBack();
  await page.getByRole("button", { name: funnelName, exact: true }).click();

  // Ficha (aberta pelo menu do card): mostra a etapa e a altera
  await page.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("link", { name: "Ficha" }).first().click();
  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  const stageSelect = ficha.getByLabel(`Etapa em ${funnelName}`);
  await expect(stageSelect.locator("option:checked")).toHaveText("Fechado");
  await stageSelect.selectOption({ label: "Extra" });
  await expect(stageSelect.locator("option:checked")).toHaveText("Extra");
  await snap(page, "ficha", project);
  await noHorizontalOverflow(page);

  // Apagar a etapa com cards pede o destino
  await page.goto("/funis/gerenciar");
  const editor2 = page.getByRole("region", { name: `Funil ${funnelName}` });
  await editor2.getByRole("button", { name: "Apagar etapa Extra" }).click();
  const destino = editor2.getByRole("group", { name: "Destino dos cards de Extra" });
  await expect(destino).toBeVisible();
  await expect(editor2.getByLabel("Nome da etapa Extra")).toBeVisible();
  await snap(page, "destino", project);
  await noHorizontalOverflow(page);
  await destino.getByLabel("Mover os cards de Extra para").selectOption({ label: "Novo" });
  await destino.getByRole("button", { name: "Confirmar apagar etapa Extra" }).click();
  await expect(editor2.getByLabel("Nome da etapa Extra")).toHaveCount(0);

  // O card foi para o destino; tirar o contato do funil o remove do quadro
  await page.goto("/funis");
  await page.getByRole("button", { name: funnelName, exact: true }).click();
  await expect(page.getByRole("region", { name: "Etapa Novo" }).getByText(clientName)).toBeVisible();
  await page.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Tirar ${clientName} do funil` }).click();
  await expect(page.getByText(clientName)).toHaveCount(0);
});
