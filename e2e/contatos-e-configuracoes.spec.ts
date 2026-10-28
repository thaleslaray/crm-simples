import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { signInAsNewAttendant } from "./atendente";
import { E2E_ADMIN, E2E_WEBHOOK } from "./e2e-env";
import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";

async function receiveFrom(
  request: APIRequestContext,
  run: string,
  phone: string,
) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `e2e-${run}-1`,
        messageid: `WA${run}1`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Olá, preciso de ajuda",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

async function print(page: Page, project: string, name: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir)
    await page.screenshot({ path: path.join(dir, `${name}-${project}.png`) });
}

const settingsList = (page: Page) =>
  page.getByRole("navigation", { name: "Configurações" });
const contactList = (page: Page) =>
  page.getByRole("list", { name: "Contatos" });

test("atendente vê só Respostas rápidas, Perfil e Sair nas Configurações", async ({
  page,
}, info) => {
  const { name, email } = await signInAsNewAttendant(page);
  await page.goto("/configuracoes");
  const list = settingsList(page);
  await expect(list).toContainText(name);
  await expect(list).toContainText(email);
  await expect(list).toContainText("Atendente");
  await expect(
    list.getByRole("link", { name: /Respostas rápidas/ }),
  ).toBeVisible();
  await expect(list.getByRole("link", { name: /Perfil/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /Sair/ })).toBeVisible();
  for (const hidden of [
    /Etiquetas/,
    /Funis e etapas/,
    /Equipe/,
    /Conexão do número/,
    /Empresa/,
  ]) {
    await expect(list.getByRole("link", { name: hidden })).toHaveCount(0);
  }
  await print(page, info.project.name, "atendente-config");

  // Comportamento de hoje: o atendente abre a tela, mas só o admin cadastra.
  await list.getByRole("link", { name: /Respostas rápidas/ }).click();
  await expect(page).toHaveURL(/\/respostas-rapidas$/);
  await expect(
    page.getByText("Só o admin cadastra respostas rápidas."),
  ).toBeVisible();

  // Rota de admin devolve para a caixa de entrada.
  await page.goto("/equipe");
  await expect(
    page.getByRole("navigation", { name: "Conversas" }),
  ).toBeVisible();
});

test("admin vê todos os itens e cada rota abre com o item marcado", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "no celular o item abre em tela própria, sem a lista",
  );
  await signInAsAdmin(page);
  await page.goto("/configuracoes");
  const list = settingsList(page);
  await expect(list).toContainText("Administrador");
  await expect(list).toContainText(E2E_ADMIN.email);
  const routes: [RegExp, string][] = [
    [/Respostas rápidas/, "/respostas-rapidas"],
    [/Etiquetas/, "/etiquetas"],
    [/Funis e etapas/, "/funis/gerenciar"],
    [/Equipe/, "/equipe"],
    [/Conexão do número/, "/conexao"],
    [/Perfil/, "/perfil"],
  ];
  for (const [name] of routes)
    await expect(list.getByRole("link", { name })).toBeVisible();
  await expect(list.getByRole("button", { name: /Sair/ })).toBeVisible();

  for (const [name, url] of routes) {
    await page.goto(url);
    await expect(
      settingsList(page).getByRole("link", { name }),
    ).toHaveAttribute("aria-current", "page");
  }
  await print(page, info.project.name, "admin-config-conexao");
  await page.goto("/perfil");
  await print(page, info.project.name, "admin-config-perfil");
  await page.goto("/equipe");
  await expect(
    page.getByRole("button", { name: "Gerar link de convite" }),
  ).toBeVisible();
  await print(page, info.project.name, "admin-config-equipe");

  // Pela lista chega no item e a rota muda.
  await page.goto("/configuracoes");
  await settingsList(page)
    .getByRole("link", { name: /Etiquetas/ })
    .click();
  await expect(page).toHaveURL(/\/etiquetas$/);
});

test("celular: lista de Configurações, item em tela própria e voltar", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "mobile",
    "duas colunas viram telas no celular",
  );
  await signInAsAdmin(page);
  await page
    .getByRole("navigation", { name: "Abas" })
    .getByRole("link", { name: "Mais" })
    .click();
  await expect(page).toHaveURL(/\/configuracoes$/);
  const list = settingsList(page);
  await expect(list).toBeVisible();

  await list.getByRole("link", { name: /Perfil/ }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(list).toBeHidden();
  await expect(
    page.getByLabel("Assinar minhas mensagens com meu nome"),
  ).toBeVisible();
  await print(page, info.project.name, "config-detalhe");

  await page.getByRole("link", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/configuracoes$/);
  await expect(list).toBeVisible();
});

test("contatos: busca, ficha à direita e Abrir conversa", async ({
  page,
  request,
}, info) => {
  const run = `ctt${Date.now()}`;
  await receiveFrom(request, run, `55119${String(Date.now()).slice(-8)}`);
  await signInAsAdmin(page);
  await page.goto("/contatos");

  await page.getByLabel("Buscar contato").fill(run);
  const row = contactList(page).getByRole("link", {
    name: new RegExp(`Cliente ${run}`),
  });
  await expect(row).toBeVisible();
  await print(page, info.project.name, "contatos-lista");

  await row.click();
  await expect(page).toHaveURL(/\/contatos\/[^/]+$/);
  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  await expect(ficha).toBeVisible();
  await expect(ficha.getByTestId("ficha-phone")).toBeVisible();
  await print(page, info.project.name, "contatos-ficha");
  if (info.project.name === "desktop")
    await expect(contactList(page)).toBeVisible();
  else await expect(contactList(page)).toBeHidden();

  await ficha.getByRole("link", { name: "Abrir conversa" }).click();
  await expect(page).toHaveURL(/\/conversas\//);
  await expect(
    page.getByRole("article", { name: `Conversa com Cliente ${run}` }),
  ).toBeVisible();
});

test("celular: contatos em lista, ficha em tela própria e voltar", async ({
  page,
  request,
}, info) => {
  test.skip(
    info.project.name !== "mobile",
    "duas colunas viram telas no celular",
  );
  const run = `cttm${Date.now()}`;
  await receiveFrom(request, run, `55119${String(Date.now()).slice(-8)}`);
  await signInAsAdmin(page);
  await page.goto("/contatos");
  await page.getByLabel("Buscar contato").fill(run);
  await contactList(page)
    .getByRole("link", { name: new RegExp(`Cliente ${run}`) })
    .click();
  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  await expect(ficha).toBeVisible();
  await expect(contactList(page)).toBeHidden();
  await ficha.getByRole("button", { name: "Fechar ficha" }).click();
  await expect(page).toHaveURL(/\/contatos$/);
  await expect(contactList(page)).toBeVisible();
});

test("contatos: chips de etiqueta filtram a lista", async ({
  page,
  request,
}, info) => {
  const run = `ctl${Date.now()}`;
  await receiveFrom(request, run, `55119${String(Date.now()).slice(-8)}`);
  await signInAsAdmin(page);
  const label = `Chip${Date.now()}`;
  const created = await page.request.post("/api/labels", {
    data: { name: label, color: "#2563eb" },
  });
  expect(created.ok()).toBe(true);
  await page.goto("/contatos");
  await expect(page.getByRole("button", { name: "Todos" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: label }).click();
  await expect(page.getByRole("button", { name: label })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Nenhum contato encontrado.")).toBeVisible();
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByLabel("Buscar contato").fill(run);
  await expect(
    contactList(page).getByRole("link", { name: new RegExp(`Cliente ${run}`) }),
  ).toBeVisible();
  await print(page, info.project.name, "contatos-chips");
});
