import { expect, test } from "./fixtures";
import { openSettingsItem, signInAsAdmin } from "./navegacao";
import { E2E_WEBHOOK } from "./e2e-env";

test("admin cria campanha, copia o link, ve o QR code, usa a campanha de origem no negócio e arquiva", async ({ page, request, context }, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const run = `${info.project.name}${Date.now()}`;
  const produto = `Curso${run}`;
  const campanha = `Black Friday ${run}`;
  const funil = `Vendas${run}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const cliente = `Cliente ${run}`;
  const hook = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `cp-${run}`,
        messageid: `WACP${run}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: cliente,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Quero saber mais",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(hook.status()).toBe(200);

  await signInAsAdmin(page);
  // Arrange pela API (as telas de produto e funil têm E2E próprio)
  expect((await page.request.post("/api/products", { data: { name: produto, priceCents: 99700 } })).ok()).toBe(true);
  const created = (await (await page.request.post("/api/funnels", { data: { name: funil } })).json()) as { funnel: { id: string } };
  await page.request.post(`/api/funnels/${created.funnel.id}/stages`, { data: { name: "Novo" } });

  await openSettingsItem(page, /Campanhas/);
  await expect(page.getByText("Conecte o número do WhatsApp para gerar o link.")).toHaveCount(0);
  await page.getByLabel("Nome da campanha").fill(campanha);
  await page.getByRole("combobox", { name: /^Produto/ }).selectOption({ label: produto });
  await page.getByLabel("Canal").selectOption({ label: "Instagram" });
  await page.getByRole("button", { name: "Criar campanha" }).click();

  const item = page.getByRole("list", { name: "Campanhas cadastradas" }).getByRole("listitem").filter({ hasText: campanha });
  await expect(item).toContainText(/código CUR-I\d\d/);
  const code = (await item.locator("code").textContent())!;
  const link = `https://wa.me/5511987654321?text=${encodeURIComponent(`Oi! Quero saber do ${produto} #${code}`)}`;
  await expect(page.getByRole("textbox", { name: `Link de ${campanha}` })).toHaveValue(link);

  await page.getByRole("button", { name: `Copiar link de ${campanha}` }).click();
  await expect(item.getByText("Link copiado.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  await page.getByRole("button", { name: `Ver QR code de ${campanha}` }).click();
  const qr = page.getByRole("img", { name: `QR code do link de ${campanha}` });
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth > 0)).toBe(true);

  // Mensagem sem o código é recusada
  await page.getByRole("button", { name: `Editar mensagem de ${campanha}` }).click();
  await page.getByRole("textbox", { name: `Mensagem de ${campanha}` }).fill("Oi, quero saber mais");
  await page.getByRole("button", { name: "Salvar mensagem" }).click();
  await expect(page.getByRole("alert")).toContainText(`#${code}`);
  await page.getByRole("textbox", { name: `Mensagem de ${campanha}` }).fill(`Quero o curso! #${code}`);
  await page.getByRole("button", { name: "Salvar mensagem" }).click();
  await expect(item).toContainText(`Quero o curso! #${code}`);

  // A campanha ativa vira origem do negócio
  await page.getByRole("link", { name: "Funis", exact: true }).click();
  await page.getByRole("button", { name: funil, exact: true }).click();
  await page.locator(".add-contact summary").click();
  const painel = page.locator(".add-contact-body");
  await painel.getByLabel("Origem").selectOption({ label: `${campanha} (${code})` });
  await page.getByLabel("Buscar contato do negócio").fill(phone.slice(-6));
  await page.getByRole("button", { name: `Criar negócio para ${cliente}` }).click();
  await expect(page.getByRole("region", { name: "Etapa Novo" })).toContainText(`Campanha: ${campanha}`);

  // Arquivar: some da lista e da escolha de origem
  await openSettingsItem(page, /Campanhas/);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Arquivar ${campanha}` }).click();
  await expect(page.getByText(campanha)).toHaveCount(0);
  await page.getByRole("link", { name: "Funis", exact: true }).click();
  await page.getByRole("button", { name: funil, exact: true }).click();
  await expect(page.getByRole("region", { name: "Etapa Novo" })).toContainText(`Campanha: ${campanha}`);
  await page.locator(".add-contact summary").click();
  await expect(page.locator(".add-contact-body").getByLabel("Origem").locator("option", { hasText: campanha })).toHaveCount(0);
});
