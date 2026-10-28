import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";

test("atendente inicia conversa com um número novo; número inválido é recusado antes do envio", async ({
  page,
}) => {
  const phone = `55119${String(Date.now()).slice(-8)}`;
  await signInAsAdmin(page);

  await page.getByRole("button", { name: "Nova conversa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova conversa" });
  await dialog.getByLabel("Contato ou número").fill("12ab");
  await dialog.getByLabel("Mensagem").fill("Olá!");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Número inválido");

  await dialog.getByLabel("Contato ou número").fill(phone);
  await expect(dialog).toContainText("Enviar para o número");
  await expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await dialog.getByRole("button", { name: "Enviar" }).click();

  await expect(page).toHaveURL(/\/conversas\//);
  await expect(
    page.getByRole("article", { name: /Conversa com/ }).getByText("Olá!"),
  ).toBeVisible();
});

test("atendente inicia conversa com um contato que já existe, escolhido na busca", async ({
  page,
}) => {
  const phone = `55118${String(Date.now()).slice(-8)}`;
  await signInAsAdmin(page);
  await page.getByRole("button", { name: "Nova conversa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova conversa" });
  await dialog.getByLabel("Contato ou número").fill(phone);
  await dialog.getByLabel("Mensagem").fill("Primeira");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(page).toHaveURL(/\/conversas\//);

  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Conversas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova conversa" }).click();
  const again = page.getByRole("dialog", { name: "Nova conversa" });
  await again.getByLabel("Contato ou número").fill(phone.slice(-8));
  await again
    .getByRole("list", { name: "Sugestões" })
    .getByRole("button")
    .first()
    .click();
  await expect(again.getByText("Para:")).toBeVisible();
  await again.getByLabel("Mensagem").fill("Segunda");
  await again.getByRole("button", { name: "Enviar" }).click();
  await expect(
    page.getByRole("article", { name: /Conversa com/ }).getByText("Segunda"),
  ).toBeVisible();
});
