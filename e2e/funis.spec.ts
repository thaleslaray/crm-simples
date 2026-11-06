import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openSettingsItem, signInAsAdmin, spyOnSockets, waitForRealtime } from "./navegacao";
import { E2E_WEBHOOK } from "./e2e-env";

async function clientWrites(
  request: APIRequestContext,
  id: string,
  phone: string,
) {
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
  if (dir)
    await page.screenshot({
      path: `${dir}/funis-${name}-${project}.png`,
      fullPage: true,
    });
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

/** Arrasta o card pela alca ate o centro da coluna: mouse no desktop, toque (CDP) no celular. */
async function dragCard(
  page: Page,
  grip: Locator,
  column: Locator,
  touch: boolean,
) {
  const from = (await grip.boundingBox())!;
  const col = (await column.boundingBox())!;
  const viewport = page.viewportSize()!;
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  const tx = Math.min(col.x + col.width / 2, viewport.width - 12);
  const ty = col.y + Math.min(col.height / 2, 90);
  const steps = 12;
  const at = (i: number) => ({
    x: sx + ((tx - sx) * i) / steps,
    y: sy + ((ty - sy) * i) / steps,
  });
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const send = (
      type: "touchStart" | "touchMove" | "touchEnd",
      p?: { x: number; y: number },
    ) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: p ? [{ x: p.x, y: p.y }] : [],
      });
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

test("admin monta o funil, cria negocio com produto, a equipe arrasta o cartao e o colega ve ao vivo; a ficha altera a etapa, o mesmo cliente tem dois negocios e apagar etapa com negocios pede destino", async ({
  page,
  request,
  browser,
}, info) => {
  const project = info.project.name;
  const touch = project === "mobile";
  const run = `${project}${Date.now()}`;
  const funnelName = `Vendas${run}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const clientName = `Cliente ${run}`;
  await clientWrites(request, run, phone);

  await spyOnSockets(page);
  await signInAsAdmin(page);

  // Cadastro (admin): funil e tres etapas
  await openSettingsItem(page, /Funis e etapas/);
  await page.getByLabel("Nome do funil", { exact: true }).fill(funnelName);
  await page.getByRole("button", { name: "Criar funil" }).click();
  const editor = page.getByRole("region", { name: `Funil ${funnelName}` });
  await expect(editor).toBeVisible();
  for (const stage of ["Novo", "Fechado", "Extra"]) {
    await editor.getByLabel(`Nova etapa em ${funnelName}`).fill(stage);
    await editor
      .getByRole("button", { name: `Adicionar etapa em ${funnelName}` })
      .click();
    await expect(editor.getByLabel(`Nome da etapa ${stage}`)).toBeVisible();
  }
  // Reordena: Extra sobe uma posicao e volta
  await editor.getByRole("button", { name: "Subir etapa Extra" }).click();
  await expect(editor.getByLabel(/^Nome da etapa/).nth(1)).toHaveValue("Extra");
  await editor.getByRole("button", { name: "Descer etapa Extra" }).click();
  await expect(editor.getByLabel(/^Nome da etapa/).nth(2)).toHaveValue("Extra");
  await snap(page, "cadastro", project);
  await noHorizontalOverflow(page);
  await page.getByRole("link", { name: "Funis", exact: true }).click();

  // Produtos do admin (cadastro pela API; a tela tem E2E proprio)
  const curso = `Curso${run}`;
  const mentoria = `Mentoria${run}`;
  for (const [name, priceCents] of [[curso, 99700], [mentoria, 250000]] as const) {
    expect((await page.request.post("/api/products", { data: { name, priceCents } })).ok()).toBe(true);
  }

  // Quadro: "+ Negocio" com contato, etapa inicial e produto (o valor vem do preco)
  await page.getByRole("button", { name: funnelName, exact: true }).click();
  await page.locator(".add-contact summary").click();
  const painel = page.locator(".add-contact-body");
  await painel.getByLabel("Etapa inicial").selectOption({ label: "Novo" });
  await painel.getByLabel("Produto").selectOption({ label: curso });
  await expect(painel.getByLabel("Valor")).toHaveValue(/997,00/);
  await painel.getByLabel("Origem").selectOption({ label: "Indicação" });
  await page.getByLabel("Buscar contato do negócio").fill(phone.slice(-6));
  await page.getByRole("button", { name: `Criar negócio para ${clientName}` }).click();
  const novo = page.getByRole("region", { name: "Etapa Novo" });
  const fechado = page.getByRole("region", { name: "Etapa Fechado" });
  await expect(novo.getByText(clientName)).toBeVisible();
  await expect(novo.getByText(curso)).toBeVisible();
  await expect(novo.getByText(/997,00/)).toBeVisible();
  await snap(page, "quadro", project);
  await noHorizontalOverflow(page);

  // Um colega com o mesmo quadro aberto em outra sessao
  const colleagueCtx = await browser.newContext(info.project.use);
  const colleague = await colleagueCtx.newPage();
  await spyOnSockets(colleague);
  await signInAsAdmin(colleague);
  await colleague.goto("/funis");
  await colleague
    .getByRole("button", { name: funnelName, exact: true })
    .click();
  await expect(
    colleague.getByRole("region", { name: "Etapa Novo" }).getByText(clientName),
  ).toBeVisible();
  await waitForRealtime(colleague);
  await waitForRealtime(page);

  // Arrasta Novo -> Fechado
  await dragCard(
    page,
    page.getByRole("button", { name: `Arrastar ${clientName}` }),
    fechado,
    touch,
  );
  await expect(fechado.getByText(clientName)).toBeVisible();
  await expect(novo.getByText(clientName)).toHaveCount(0);
  await snap(page, "movido", project);
  // O colega ve a mudanca sem recarregar
  await expect(
    colleague
      .getByRole("region", { name: "Etapa Fechado" })
      .getByText(clientName),
  ).toBeVisible();
  await snap(colleague, "colega", project);
  await colleagueCtx.close();
  // E ela persiste
  await page.reload();
  await page.getByRole("button", { name: funnelName, exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Etapa Fechado" }).getByText(clientName),
  ).toBeVisible();

  // O chip do funil fica marcado e o card abre a conversa
  await expect(
    page.getByRole("button", { name: funnelName, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const fechadoCard = page
    .getByRole("region", { name: "Etapa Fechado" })
    .getByRole("link", { name: new RegExp(`Abrir conversa de ${clientName}`) });
  await expect(fechadoCard).toContainText("Quero fechar negócio");
  // "Aberta" é o status comum: o card não repete o selo.
  await expect(fechadoCard).not.toContainText("Aberta");
  await snap(page, "card", project);
  await fechadoCard.click();
  await expect(page).toHaveURL(/\/conversas\/[^/?]+$/);
  await page.goBack();
  await page.getByRole("button", { name: funnelName, exact: true }).click();

  // Ficha (aberta pelo menu do card): mostra a etapa e a altera
  await page.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("link", { name: "Ficha" }).first().click();
  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  await expect(ficha.getByRole("region", { name: "Negócios do contato" })).toContainText(`${curso} · R$ 997,00`);
  const stageSelect = ficha.getByLabel(`Etapa do negócio ${curso} em ${funnelName}`);
  await expect(stageSelect.locator("option:checked")).toHaveText("Fechado");
  await stageSelect.selectOption({ label: "Extra" });
  await expect(stageSelect.locator("option:checked")).toHaveText("Extra");
  await snap(page, "ficha", project);
  await noHorizontalOverflow(page);

  // Apagar a etapa com cards pede o destino
  await page.goto("/funis/gerenciar");
  const editor2 = page.getByRole("region", { name: `Funil ${funnelName}` });
  await editor2.getByRole("button", { name: "Apagar etapa Extra" }).click();
  const destino = editor2.getByRole("group", {
    name: "Destino dos cards de Extra",
  });
  await expect(destino).toBeVisible();
  await expect(editor2.getByLabel("Nome da etapa Extra")).toBeVisible();
  await snap(page, "destino", project);
  await noHorizontalOverflow(page);
  await destino
    .getByLabel("Mover os cards de Extra para")
    .selectOption({ label: "Novo" });
  await destino
    .getByRole("button", { name: "Confirmar apagar etapa Extra" })
    .click();
  await expect(editor2.getByLabel("Nome da etapa Extra")).toHaveCount(0);

  // O negocio foi para o destino. O mesmo cliente ganha um segundo negocio (outro produto) pela ficha
  await page.goto("/funis");
  await page.getByRole("button", { name: funnelName, exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Etapa Novo" }).getByText(clientName),
  ).toBeVisible();
  await page.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("link", { name: "Ficha" }).first().click();
  const ficha2 = page.getByRole("complementary", { name: "Ficha do contato" });
  await ficha2.getByRole("button", { name: "+ Negócio" }).click();
  await ficha2.getByLabel("Funil").selectOption({ label: funnelName });
  await ficha2.getByLabel("Etapa inicial").selectOption({ label: "Fechado" });
  await ficha2.getByLabel("Produto").selectOption({ label: mentoria });
  await ficha2.getByRole("button", { name: "Criar negócio" }).click();
  const negocios = ficha2.getByRole("region", { name: "Negócios do contato" });
  await expect(negocios).toContainText(`${mentoria} · R$ 2.500,00`);
  await expect(negocios).toContainText(`${curso} · R$ 997,00`);
  await snap(page, "ficha-dois-negocios", project);
  await noHorizontalOverflow(page);

  // Quadro: dois cartoes do mesmo cliente; o filtro por produto separa
  await page.goto("/funis");
  await page.getByRole("button", { name: funnelName, exact: true }).click();
  const cartoes = page.locator(".kcard").filter({ hasText: clientName });
  await expect(cartoes).toHaveCount(2);
  await page.getByLabel("Filtrar por produto").selectOption({ label: mentoria });
  await expect(cartoes).toHaveCount(1);
  await expect(cartoes.first()).toContainText(mentoria);
  await page.getByLabel("Filtrar por produto").selectOption({ label: "Todos os produtos" });
  await expect(cartoes).toHaveCount(2);

  // Remover um negocio deixa o outro
  await cartoes.filter({ hasText: mentoria }).getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Remover negócio de ${clientName}` }).click();
  await expect(cartoes).toHaveCount(1);
  await expect(cartoes.first()).toContainText(curso);
  await cartoes.first().getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Remover negócio de ${clientName}` }).click();
  await expect(page.getByText(clientName)).toHaveCount(0);
});

test("Ganhou e Perdeu: diálogos pedem valor e motivo, o negócio fechado sai do quadro, aparece nos filtros sem arrastar e o admin reabre; a ficha também fecha", async ({
  page,
  request,
}, info) => {
  const project = info.project.name;
  const run = `${project}${Date.now()}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  const clientName = `Cliente f${run}`;
  const funnelName = `Fecha${run}`;
  await clientWrites(request, `f${run}`, phone);
  await signInAsAdmin(page);

  // Arrange pela API: funil, produto e negocio
  const funnel = ((await (await page.request.post("/api/funnels", { data: { name: funnelName } })).json()) as { funnel: { id: string } }).funnel;
  const stage = ((await (await page.request.post(`/api/funnels/${funnel.id}/stages`, { data: { name: "Novo" } })).json()) as { stage: { id: string } }).stage;
  const curso = `Curso${run}`;
  const product = ((await (await page.request.post("/api/products", { data: { name: curso, priceCents: 99700 } })).json()) as { product: { id: string } }).product;
  const contacts = ((await (await page.request.get(`/api/contacts?q=${phone.slice(-6)}`)).json()) as { contacts: { id: string }[] }).contacts;
  const dealRes = await page.request.post(`/api/funnels/${funnel.id}/deals`, { data: { contactId: contacts[0]!.id, stageId: stage.id, productId: product.id } });
  expect(dealRes.status()).toBe(201);

  await page.goto(`/funis/${funnel.id}`);
  const card = page.locator(".kcard").filter({ hasText: clientName });
  await expect(card).toBeVisible();

  // Ganhou: dialogo acessivel, valor pre-preenchido; Esc fecha sem fechar o negocio
  await card.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Ganhou: ${clientName}` }).click();
  const dialog = page.getByRole("dialog", { name: "Negócio ganho" });
  await expect(dialog).toBeVisible();
  const valor = dialog.getByLabel("Valor fechado");
  await expect(valor).toBeFocused();
  await expect(valor).toHaveValue(/997,00/);
  await snap(page, "ganhou", project);
  await noHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();

  // Valor vazio bloqueia; valor editado fecha
  await card.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Ganhou: ${clientName}` }).click();
  await valor.fill("");
  await expect(dialog.getByRole("button", { name: "Confirmar ganho" })).toBeDisabled();
  await valor.fill("90000");
  await expect(valor).toHaveValue(/900,00/);
  await dialog.getByRole("button", { name: "Confirmar ganho" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toHaveCount(0);

  // Filtro Ganhos: valor e data, sem alca de arrastar
  await page.getByLabel("Filtrar por situação").selectOption({ label: "Ganhos" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Ganho");
  await expect(card).toContainText(/900,00/);
  await expect(card).toContainText(new Date().toLocaleDateString("pt-BR"));
  await expect(card.getByRole("button", { name: `Arrastar ${clientName}` })).toHaveCount(0);
  await snap(page, "ganhos", project);

  // Admin reabre: volta ao quadro de abertos
  await card.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Reabrir negócio de ${clientName}` }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Filtrar por situação").selectOption({ label: "Abertos" });
  await expect(card).toBeVisible();

  // Perdeu: motivo obrigatorio, observacao opcional
  await card.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Perdeu: ${clientName}` }).click();
  const perdeu = page.getByRole("dialog", { name: "Negócio perdido" });
  await expect(perdeu.getByLabel("Motivo")).toBeFocused();
  await expect(perdeu.getByRole("button", { name: "Confirmar perda" })).toBeDisabled();
  await snap(page, "perdeu", project);
  await noHorizontalOverflow(page);
  await perdeu.getByLabel("Motivo").selectOption({ label: "Comprou de outro" });
  await perdeu.getByLabel("Observação (opcional)").fill("Foi para o concorrente");
  await perdeu.getByRole("button", { name: "Confirmar perda" }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Filtrar por situação").selectOption({ label: "Perdidos" });
  await expect(card).toContainText("Perdido: Comprou de outro");
  await expect(card).toContainText("Foi para o concorrente");
  await snap(page, "perdidos", project);

  // Reabre de novo e fecha pela ficha do contato
  await card.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("button", { name: `Reabrir negócio de ${clientName}` }).click();
  await page.getByLabel("Filtrar por situação").selectOption({ label: "Abertos" });
  await card.getByRole("button", { name: `Ações de ${clientName}` }).click();
  await page.getByRole("link", { name: "Ficha" }).first().click();
  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  await ficha.getByRole("button", { name: `Perdeu o negócio ${curso} em ${funnelName}` }).click();
  const dlg = page.getByRole("dialog", { name: "Negócio perdido" });
  await dlg.getByLabel("Motivo").selectOption({ label: "Preço" });
  await dlg.getByRole("button", { name: "Confirmar perda" }).click();
  await expect(ficha.getByRole("region", { name: "Negócios do contato" })).toContainText("Perdido");
  await expect(ficha.getByRole("button", { name: `Reabrir negócio ${curso} em ${funnelName}` })).toBeVisible();
  await noHorizontalOverflow(page);
  await snap(page, "ficha-perdido", project);
});
