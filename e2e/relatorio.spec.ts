import type { Page } from "@playwright/test";
import { signInAsNewAttendant } from "./atendente";
import { E2E_WEBHOOK } from "./e2e-env";
import { expect, test } from "./fixtures";
import { openSettingsItem, signInAsAdmin } from "./navegacao";

/** Com E2E_PRINTS, salva um print do passo (revisao visual); sem a variavel nao faz nada. */
async function snap(page: Page, name: string, project: string, scheme: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: `${dir}/relatorio-${name}-${scheme}-${project}.png`, fullPage: true });
}

for (const scheme of ["light", "dark"] as const) {
  test(`admin abre o relatório e vê a linha da campanha com os números certos (${scheme})`, async ({ page, request }, info) => {
    const mobile = info.project.name === "mobile";
    if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    const run = `${info.project.name}${scheme}${Date.now()}`;
    const phone = `55119${String(Date.now()).slice(-8)}`;
    const produto = `Curso${run}`;
    const campanha = `Black Friday ${run}`;

    // O cliente escreve; o resto do arrange vai pela API (cada tela já tem E2E próprio).
    const hook = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
      data: {
        EventType: "messages",
        token: E2E_WEBHOOK.instanceToken,
        message: {
          id: `rl-${run}`,
          messageid: `WARL${run}`,
          chatid: `${phone}@s.whatsapp.net`,
          sender: `${phone}@s.whatsapp.net`,
          senderName: `Cliente ${run}`,
          fromMe: false,
          isGroup: false,
          messageType: "conversation",
          text: "Quero saber do curso",
          messageTimestamp: Date.now(),
        },
      },
    });
    expect(hook.status()).toBe(200);
    await signInAsAdmin(page);
    const post = async <T>(url: string, data: unknown) => {
      const res = await page.request.post(url, { data });
      expect(res.ok(), url).toBe(true);
      return (await res.json()) as T;
    };
    const { funnel } = await post<{ funnel: { id: string } }>("/api/funnels", { name: `Funil${run}` });
    const { stage } = await post<{ stage: { id: string } }>(`/api/funnels/${funnel.id}/stages`, { name: "Novo" });
    const { product } = await post<{ product: { id: string } }>("/api/products", { name: produto, priceCents: 99700 });
    const { campaign } = await post<{ campaign: { id: string } }>("/api/campaigns", { name: campanha, productId: product.id, channel: "meta" });
    const contacts = ((await (await page.request.get(`/api/contacts?q=${phone.slice(-6)}`)).json()) as { contacts: { id: string }[] }).contacts;
    const deal = { contactId: contacts[0]!.id, stageId: stage.id, productId: product.id, originKind: "campanha", originCampaignId: campaign.id };
    const ganho = await post<{ deal: { id: string } }>(`/api/funnels/${funnel.id}/deals`, deal);
    const perdido = await post<{ deal: { id: string } }>(`/api/funnels/${funnel.id}/deals`, deal);
    await post(`/api/funnels/${funnel.id}/deals`, deal);
    await post(`/api/funnels/${funnel.id}/deals/${ganho.deal.id}/close`, { status: "ganho", valueCents: 150000 });
    await post(`/api/funnels/${funnel.id}/deals/${perdido.deal.id}/close`, { status: "perdido", lostReason: "preco" });

    await openSettingsItem(page, /Relatório de campanhas/);
    // O banco do E2E é compartilhado: o filtro de produto isola os números deste teste.
    await page.getByRole("combobox", { name: "Produto" }).selectOption({ label: produto });

    const linha = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: campanha }) });
    await expect(linha.getByRole("cell")).toHaveText(["3", "1", "1", "R$ 1.500,00", "33,3%"]);
    const total = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Total" }) });
    await expect(total.getByRole("cell")).toHaveText(["3", "1", "1", "R$ 1.500,00", "33,3%"]);
    expect(await linha.getByRole("cell").first().evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain("tabular-nums");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (mobile) {
      // No celular a tabela rola dentro do próprio bloco, sem estourar a página.
      const bloco = page.getByRole("region", { name: "Tabela do relatório" });
      expect(await bloco.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    }
    await snap(page, "tabela", info.project.name, scheme);

    // Mês passado não tem nada deste produto; personalizado com as duas datas volta a mostrar.
    await page.getByRole("button", { name: "Mês passado" }).click();
    await expect(page.getByText("Nenhum negócio neste período")).toBeVisible();
    await snap(page, "vazio", info.project.name, scheme);
    await page.getByRole("button", { name: "Personalizado" }).click();
    const hoje = new Date();
    const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await page.getByLabel("De", { exact: true }).fill(dia(new Date(hoje.getTime() - 86_400_000)));
    await page.getByLabel("Até", { exact: true }).fill(dia(new Date(hoje.getTime() + 86_400_000)));
    await expect(linha.getByRole("cell").first()).toHaveText("3");
    await snap(page, "personalizado", info.project.name, scheme);
  });
}

test("atendente não vê a entrada do relatório e a rota responde 403", async ({ page }, info) => {
  await signInAsNewAttendant(page);
  const mobile = info.project.name === "mobile";
  if (mobile) await page.getByRole("navigation", { name: "Abas" }).getByRole("link", { name: "Mais" }).click();
  else await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: "Configurações" }).click();
  await expect(page.getByRole("navigation", { name: "Configurações" }).getByRole("link", { name: "Perfil" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Relatório de campanhas/ })).toHaveCount(0);
  expect((await page.request.get("/api/reports/campaigns?from=0&to=10")).status()).toBe(403);
  await page.goto("/relatorio");
  await expect(page).toHaveURL(/\/$/); // a rota é só de admin: o atendente volta para a caixa de entrada
  await expect(page.getByRole("table")).toHaveCount(0);
});
