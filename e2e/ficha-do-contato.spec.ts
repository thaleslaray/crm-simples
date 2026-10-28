import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_WEBHOOK } from "./e2e-env";

async function clientWrites(request: APIRequestContext, id: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `fc-${id}`,
        messageid: `WAFC${id}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${id}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Oi, queria saber do prazo",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

/** Com E2E_PRINTS, salva um print do passo (revisao visual); sem a variavel nao faz nada. */
async function snap(page: Page, name: string, project: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: `${dir}/ficha-${name}-${project}.png`, fullPage: true });
}

async function openConversation(page: Page, who: string) {
  const link = page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: new RegExp(`Cliente ${who}`) }).first();
  await link.click();
  return page.getByRole("article", { name: `Conversa com Cliente ${who}` });
}

for (const scheme of ["light", "dark"] as const) {
  test(`ficha do contato: comeca fechada, abre, fecha e lembra (${scheme})`, async ({ page, request }, info) => {
    const mobile = info.project.name === "mobile";
    if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    const run = `${info.project.name}${scheme}${Date.now()}`;
    const first = `${run}a`;
    const second = `${run}b`;
    await clientWrites(request, first, `55117${String(Date.now()).slice(-8)}`);
    await clientWrites(request, second, `55116${String(Date.now() + 1).slice(-8)}`);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
    await page.getByLabel("Senha").fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("navigation", { name: "Conversas" }).waitFor();
    await page.evaluate(() => localStorage.removeItem("crm.fichaAberta"));

    let conversation = await openConversation(page, first);
    const toggle = conversation.getByRole("button", { name: "Ficha do contato" });
    const ficha = page.getByRole("complementary", { name: "Ficha do contato" });

    // Comeca fechada
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(ficha).toHaveCount(0);

    // Abre pelo nome do cabecalho: titulo "Dados do contato" e os blocos
    await toggle.click();
    // No celular a ficha cobre o cabecalho do chat (tela cheia): o botao some junto.
    if (!mobile) await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(ficha.getByRole("heading", { name: "Dados do contato" })).toBeVisible();
    for (const bloco of ["Etiquetas do contato", "Funis do contato", "Dados", "Notas do contato"]) {
      await expect(ficha.getByRole("region", { name: bloco })).toBeVisible();
    }
    await expect(ficha.getByRole("button", { name: "Iniciar conversa" })).toBeVisible();

    if (!mobile) {
      // Terceira coluna de 400px que estreita o chat; o chat continua visivel
      const box = await ficha.boundingBox();
      expect(Math.round(box?.width ?? 0)).toBe(400);
      await expect(conversation.getByLabel("Mensagem", { exact: true })).toBeVisible();
      await snap(page, `aberta-${scheme}`, info.project.name);

      // Lembra ao trocar de conversa e apos recarregar
      conversation = await openConversation(page, second);
      await expect(conversation.getByRole("button", { name: "Ficha do contato" })).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("complementary", { name: "Ficha do contato" }).getByRole("img", { name: `Foto de Cliente ${second}` })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("crm.fichaAberta"))).toBe("1");
      await page.reload();
      await expect(page.getByRole("article", { name: `Conversa com Cliente ${second}` }).getByRole("button", { name: "Ficha do contato" })).toHaveAttribute("aria-expanded", "true");

      // Fecha no X e continua fechada ao recarregar
      await page.getByRole("complementary", { name: "Ficha do contato" }).getByRole("button", { name: "Fechar ficha" }).click();
      await expect(page.getByRole("complementary", { name: "Ficha do contato" })).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("crm.fichaAberta"))).toBe("0");
      await page.reload();
      await expect(page.getByRole("article", { name: `Conversa com Cliente ${second}` }).getByRole("button", { name: "Ficha do contato" })).toHaveAttribute("aria-expanded", "false");
    } else {
      // Celular: tela cheia (o chat some), sem abas; o voltar devolve ao chat
      await expect(page.getByRole("navigation", { name: "Abas" })).toHaveCount(0);
      await expect(conversation.getByLabel("Mensagem", { exact: true })).toBeHidden();
      const box = await ficha.boundingBox();
      expect(Math.round(box?.width ?? 0)).toBe(375);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      await snap(page, `aberta-${scheme}`, info.project.name);
      await ficha.getByRole("button", { name: "Fechar ficha" }).click();
      await expect(ficha).toHaveCount(0);
      await expect(conversation.getByLabel("Mensagem", { exact: true })).toBeVisible();
      // No celular nao se lembra: a proxima conversa abre no chat
      expect(await page.evaluate(() => localStorage.getItem("crm.fichaAberta"))).toBeNull();
    }
  });
}
