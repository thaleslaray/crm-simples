import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_WEBHOOK } from "./e2e-env";

// O D1 do E2E é compartilhado entre desktop e celular: nome, telefone e termo únicos por execução.
test("busca por texto leva à conversa posicionada na mensagem e por nome acha o contato", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const termo = `reembolso${run}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  const base = Date.now() - 100 * 60_000;
  // 100 mensagens; a do termo é a 10ª, longe do fim: a conversa tem que abrir nela, não no rodapé.
  for (let n = 1; n <= 100; n++) {
    const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
      data: {
        EventType: "messages",
        token: E2E_WEBHOOK.instanceToken,
        message: {
          id: `e2e-busca-${run}-${n}`,
          messageid: `WAB${run}${n}`,
          chatid: `${phone}@s.whatsapp.net`,
          sender: `${phone}@s.whatsapp.net`,
          senderName: `Cliente Busca ${run}`,
          fromMe: false,
          isGroup: false,
          messageType: "conversation",
          text: n === 10 ? `Quero o ${termo} do pedido` : `Mensagem ${n}`,
          messageTimestamp: base + n * 60_000,
        },
      },
    });
    expect(res.status()).toBe(200);
  }

  await signInAsAdmin(page);const search = page.getByRole("searchbox", { name: "Buscar" });

  // Por nome: o contato aparece
  await search.fill(`Busca ${run}`);
  await expect(
    page
      .getByRole("region", { name: "Contatos" })
      .getByRole("link", { name: new RegExp(`Cliente Busca ${run}`) }),
  ).toBeVisible();

  // Por texto: o resultado mostra o trecho e leva à mensagem
  await search.fill(termo);
  const resultado = page
    .getByRole("region", { name: "Mensagens" })
    .getByRole("link", { name: new RegExp(termo) });
  await expect(resultado.locator("mark")).toHaveText(termo);
  await resultado.click();

  const conversation = page.getByRole("article", {
    name: `Conversa com Cliente Busca ${run}`,
  });
  const achada = conversation.locator(".bubble.is-found");
  await expect(achada).toContainText(termo);
  await expect(achada).toBeInViewport();
  // Só a janela ao redor foi carregada; as mais novas vêm ao rolar até o fim
  await expect(
    conversation.getByText("Mensagem 100", { exact: true }),
  ).toHaveCount(0);
  const scroller = conversation.locator(".messages");
  await expect(async () => {
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(
      conversation.getByText("Mensagem 100", { exact: true }),
    ).toBeVisible({ timeout: 500 });
  }).toPass();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  // Celular: voltar leva de novo aos resultados da busca
  if (info.project.name === "mobile") {
    await page.getByRole("link", { name: "Voltar à caixa de entrada" }).click();
    await expect(search).toHaveValue(termo);
    await expect(resultado).toBeVisible();
  }
});
