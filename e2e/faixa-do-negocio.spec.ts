import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loggedInPage, signInAsAdmin, spyOnSockets, waitForRealtime } from "./navegacao";
import { E2E_WEBHOOK } from "./e2e-env";

async function clientWrites(request: APIRequestContext, id: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `fx-${id}`,
        messageid: `WAFX${id}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${id}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Quero saber do curso",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

/** Com E2E_PRINTS, salva um print do passo (revisao visual); sem a variavel nao faz nada. */
async function snap(page: Page, name: string, project: string, scheme: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: `${dir}/faixa-${name}-${scheme}-${project}.png` });
}

type Ids = { funnelId: string; stageId: string; contactId: string };

async function arrange(page: Page, run: string, phone: string): Promise<Ids & { stageName: string }> {
  const stageName = `Qualificacao${run}`;
  const funnel = ((await (await page.request.post("/api/funnels", { data: { name: `Funil${run}` } })).json()) as { funnel: { id: string } }).funnel;
  const stage = ((await (await page.request.post(`/api/funnels/${funnel.id}/stages`, { data: { name: stageName } })).json()) as { stage: { id: string } }).stage;
  const contacts = ((await (await page.request.get(`/api/contacts?q=${phone.slice(-6)}`)).json()) as { contacts: { id: string }[] }).contacts;
  return { funnelId: funnel.id, stageId: stage.id, contactId: contacts[0]!.id, stageName };
}

async function addDeal(page: Page, ids: Ids, data: Record<string, unknown> = {}) {
  const res = await page.request.post(`/api/funnels/${ids.funnelId}/deals`, { data: { contactId: ids.contactId, stageId: ids.stageId, ...data } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { deal: { id: string } }).deal.id;
}

async function product(page: Page, name: string, priceCents: number) {
  return ((await (await page.request.post("/api/products", { data: { name, priceCents } })).json()) as { product: { id: string } }).product.id;
}

for (const scheme of ["light", "dark"] as const) {
  test(`faixa na conversa: nenhum, um e vários negócios; Ganhou tira da faixa; "+ Negócio" cria (${scheme})`, async ({ page, request }, info) => {
    const mobile = info.project.name === "mobile";
    if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    const run = `${info.project.name}${scheme}${Date.now()}`;
    const phone = `55119${String(Date.now()).slice(-8)}`;
    await clientWrites(request, run, phone);
    await signInAsAdmin(page);
    const ids = await arrange(page, run, phone);
    const curso = `Curso${run}`;
    const mentoria = `Mentoria${run}`;
    const cursoId = await product(page, curso, 99700);
    const mentoriaId = await product(page, mentoria, 250000);

    await page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: new RegExp(`Cliente ${run}`) }).first().click();
    const conversa = page.getByRole("article", { name: `Conversa com Cliente ${run}` });
    const faixa = conversa.getByRole("region", { name: "Negócio do contato" });

    // Nenhum: so "+ Negocio"
    await expect(faixa.getByRole("button", { name: "+ Negócio" })).toBeVisible();
    await expect(faixa.getByRole("button", { name: "Ganhou" })).toHaveCount(0);
    await snap(page, "nenhum", info.project.name, scheme);

    // "+ Negocio" cria com o contato ja escolhido e a faixa aparece
    await faixa.getByRole("button", { name: "+ Negócio" }).click();
    const dlg = page.getByRole("dialog", { name: "Novo negócio" });
    await expect(dlg).toContainText(`Cliente ${run}`);
    await dlg.getByLabel("Funil").selectOption({ label: `Funil${run}` });
    await dlg.getByLabel("Produto").selectOption({ label: curso });
    await dlg.getByLabel("Etapa inicial").selectOption({ label: ids.stageName });
    await dlg.getByRole("button", { name: "Criar negócio" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(faixa).toContainText(`${curso} · R$ 997,00 · ${ids.stageName}`);
    await expect(faixa.getByRole("button", { name: "+ Negócio" })).toHaveCount(0);
    await snap(page, "um", info.project.name, scheme);

    // Vários: mostra o mais recente e "+1"
    await addDeal(page, ids, { productId: mentoriaId });
    await expect(faixa).toContainText(`${mentoria} · R$ 2.500,00 · ${ids.stageName}`);
    const mais = faixa.getByRole("button", { name: /^\+1/ });
    await expect(mais).toBeVisible();
    await snap(page, "varios", info.project.name, scheme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // "+1" abre a ficha no bloco Negocios
    await mais.click();
    const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
    await expect(ficha.getByRole("region", { name: "Negócios do contato" })).toBeInViewport();
    await ficha.getByRole("button", { name: "Fechar ficha" }).click();
    await expect(ficha).toHaveCount(0);

    // Ganhou pela faixa: o mais recente sai e a faixa mostra o outro
    await faixa.getByRole("button", { name: "Ganhou" }).click();
    const ganho = page.getByRole("dialog", { name: "Negócio ganho" });
    await ganho.getByRole("button", { name: "Confirmar ganho" }).click();
    await expect(ganho).toHaveCount(0);
    await expect(faixa).toContainText(curso);
    await expect(faixa).not.toContainText(mentoria);
    await expect(faixa.getByRole("button", { name: /^\+1/ })).toHaveCount(0);

    // Perdeu o ultimo aberto: volta a "+ Negocio"
    await faixa.getByRole("button", { name: "Perdeu" }).click();
    const perdido = page.getByRole("dialog", { name: "Negócio perdido" });
    await perdido.getByLabel("Motivo").selectOption("preco");
    await perdido.getByRole("button", { name: "Confirmar perda" }).click();
    await expect(faixa.getByRole("button", { name: "+ Negócio" })).toBeVisible();
  });
}

test("faixa na conversa: outra pessoa muda o negócio e a faixa reflete em tempo real", async ({ page, request, browser }, info) => {
  const run = `${info.project.name}rt${Date.now()}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  await clientWrites(request, run, phone);
  await spyOnSockets(page);
  await signInAsAdmin(page);
  await waitForRealtime(page);
  await page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: new RegExp(`Cliente ${run}`) }).first().click();
  const faixa = page.getByRole("article", { name: `Conversa com Cliente ${run}` }).getByRole("region", { name: "Negócio do contato" });
  await expect(faixa.getByRole("button", { name: "+ Negócio" })).toBeVisible();

  const other = await loggedInPage(browser, info);
  try {
    const ids = await arrange(other.page, run, phone);
    const nome = `Curso${run}`;
    const pid = await product(other.page, nome, 49700);
    const dealId = await addDeal(other.page, ids, { productId: pid });
    await expect(faixa).toContainText(`${nome} · R$ 497,00 · ${ids.stageName}`);

    const res = await other.page.request.post(`/api/funnels/${ids.funnelId}/deals/${dealId}/close`, { data: { status: "ganho", valueCents: 49700 } });
    expect(res.ok()).toBe(true);
    await expect(faixa.getByRole("button", { name: "+ Negócio" })).toBeVisible();
  } finally {
    await other.context.close();
  }
});
