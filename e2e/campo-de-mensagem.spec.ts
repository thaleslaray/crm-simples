import type { APIRequestContext, Page } from "@playwright/test";
import { expect, openUserMenu, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function receive(request: APIRequestContext, run: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `cm-${run}`,
        messageid: `WACM${run}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Paula ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Oi, preciso de ajuda",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

async function calls(request: APIRequestContext) {
  return (await (await request.get(`${FAKE}/calls`)).json()) as { path: string }[];
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    localStorage.setItem("crm.theme", t);
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForTimeout(300); // deixa a transição de cor do campo terminar antes do print
}

/** Com E2E_PRINTS, salva um print do passo; sem a variável não faz nada. */
async function snap(page: Page, name: string, project: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: `${dir}/campo-${name}-${project}.png` });
}

test("campo de mensagem: nota não vai ao cliente, / filtra e insere, microfone vira enviar, + abre anexos", async ({ page, request }, info) => {
  if (info.project.name === "desktop") await page.setViewportSize({ width: 1440, height: 900 });
  const run = `${info.project.name}${Date.now()}`;
  const shortcut = `cm${run}`.toLowerCase();
  await receive(request, run, `55119${String(Date.now()).slice(-8)}`);
  await request.post(`${FAKE}/reset`);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Uma resposta rápida para o "/" achar
  await openUserMenu(page);
  await page.getByRole("link", { name: "Respostas rápidas" }).click();
  await page.getByLabel("Atalho (sem espaços)").fill(shortcut);
  await page.getByLabel("Texto", { exact: true }).fill("Olá {nome}, já te ajudo");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("list", { name: "Respostas cadastradas" }).getByText(`/${shortcut}`)).toBeVisible();
  await page.getByRole("link", { name: "Voltar" }).click();

  await page.getByRole("link", { name: new RegExp(`Paula ${run}`) }).first().click();
  const conversation = page.getByRole("article", { name: `Conversa com Paula ${run}` });
  const field = conversation.locator("form.composer textarea");
  const mobile = info.project.name !== "desktop";

  // Microfone vira enviar quando há texto
  await expect(conversation.getByRole("button", { name: "Gravar nota de voz" })).toBeVisible();
  await expect(conversation.getByRole("button", { name: "Enviar", exact: true })).toHaveCount(0);
  await expect(field).toHaveAttribute("placeholder", mobile ? "Mensagem ou /" : "Digite uma mensagem ou / para respostas rápidas");
  await field.fill("oi");
  await expect(conversation.getByRole("button", { name: "Enviar", exact: true })).toBeVisible();
  await expect(conversation.getByRole("button", { name: "Gravar nota de voz" })).toHaveCount(0);
  await field.fill("");
  await expect(conversation.getByRole("button", { name: "Gravar nota de voz" })).toBeVisible();

  // "+" abre o menu de anexos
  await conversation.getByRole("button", { name: "Anexar" }).click();
  const attach = conversation.getByRole("menu", { name: "Anexar" });
  await expect(attach.getByRole("menuitem", { name: "Fotos e vídeos" })).toBeVisible();
  await expect(attach.getByRole("menuitem", { name: "Documento" })).toBeVisible();
  await expect(attach.getByRole("menuitem", { name: "Câmera" })).toBeVisible();
  await snap(page, "00-anexos-claro", info.project.name);
  await noHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(attach).toHaveCount(0);

  // "/" filtra pelo atalho e Enter insere
  await field.fill(`/${shortcut.slice(0, 6)}`);
  const menu = conversation.getByRole("listbox", { name: "Respostas rápidas" });
  await expect(menu.getByRole("option", { name: new RegExp(`/${shortcut}`) })).toBeVisible();
  await snap(page, "01-respostas-rapidas-claro", info.project.name);
  await setTheme(page, "dark");
  await snap(page, "02-respostas-rapidas-escuro", info.project.name);
  await setTheme(page, "light");
  await field.press("Enter");
  await expect(field).toHaveValue(`Olá Paula ${run}, já te ajudo`);
  await expect(menu).toHaveCount(0);
  // Esc fecha o menu sem inserir
  await field.fill("/");
  await expect(menu).toBeVisible();
  await field.press("Escape");
  await expect(menu).toHaveCount(0);
  await field.fill("");

  // Cadeado: modo nota. Campo amarelo, dica, placeholder próprio
  const lock = conversation.getByRole("button", { name: "Nota interna" });
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(conversation.getByText("Nota interna: só a equipe vê. O cliente não recebe.")).toBeVisible();
  await expect(field).toHaveAttribute("placeholder", mobile ? "Nota para a equipe" : "Escreva uma nota para a equipe");
  expect(await conversation.locator("form.composer").evaluate((el) => el.classList.contains("note-mode"))).toBe(true);
  await field.fill("Cliente prefere PIX");
  await snap(page, "03-nota-claro", info.project.name);
  await setTheme(page, "dark");
  await snap(page, "04-nota-escuro", info.project.name);
  await setTheme(page, "light");
  await conversation.getByRole("button", { name: "Salvar nota" }).click();
  await expect(conversation.getByTestId("internal-note")).toContainText("Cliente prefere PIX");
  expect((await calls(request)).filter((c) => c.path.startsWith("/send"))).toHaveLength(0);

  // Cadeado de novo: volta ao modo mensagem
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await expect(conversation.getByText("Nota interna: só a equipe vê. O cliente não recebe.")).toHaveCount(0);
  await snap(page, "05-mensagem-claro", info.project.name);

  // Limpa o cadastro para não poluir o D1 compartilhado
  await page.goto("/respostas-rapidas");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Apagar /${shortcut}` }).click();
  await expect(page.getByText(`/${shortcut}`)).toHaveCount(0);
});
