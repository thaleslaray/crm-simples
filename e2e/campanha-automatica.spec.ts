import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_WEBHOOK } from "./e2e-env";

test("mensagem do cliente com o código da campanha cria o cartão no funil principal", async ({ page, request }, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const produto = `Curso${run}`;
  const campanha = `Black Friday ${run}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const cliente = `Cliente ${run}`;

  await signInAsAdmin(page);
  // O D1 do E2E é compartilhado: o funil principal é o primeiro já criado por qualquer teste.
  let funnels = ((await (await page.request.get("/api/funnels")).json()) as { funnels: { id: string; name: string; stages: { id: string; name: string }[] }[] }).funnels;
  if (funnels.length === 0) {
    await page.request.post("/api/funnels", { data: { name: `Vendas${run}` } });
    funnels = ((await (await page.request.get("/api/funnels")).json()) as { funnels: { id: string; name: string; stages: { id: string; name: string }[] }[] }).funnels;
  }
  const principal = funnels[0]!;
  if (principal.stages.length === 0) await page.request.post(`/api/funnels/${principal.id}/stages`, { data: { name: "Novo" } });

  const created = (await (await page.request.post("/api/products", { data: { name: produto, priceCents: 99700 } })).json()) as { product: { id: string } };
  const made = (await (await page.request.post("/api/campaigns", { data: { name: campanha, productId: created.product.id, channel: "meta" } })).json()) as { campaign: { code: string } };

  // A Uazapi falsa entrega a mensagem do cliente ao webhook, como a real faria.
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `ca-${run}`,
        messageid: `WACA${run}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: cliente,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: `Oi! Quero saber do ${produto} #${made.campaign.code.toLowerCase()}`,
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);

  await page.getByRole("link", { name: "Funis", exact: true }).click();
  await page.getByRole("button", { name: principal.name, exact: true }).click();
  const cartao = page.locator("li, article").filter({ hasText: cliente }).filter({ hasText: produto }).first();
  await expect(cartao).toContainText("R$ 997,00");
  await expect(cartao).toContainText(`Campanha: ${campanha}`);
});
