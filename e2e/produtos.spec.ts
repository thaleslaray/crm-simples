import { expect, test } from "./fixtures";
import { openSettingsItem, signInAsAdmin } from "./navegacao";

test("admin cria produto com preço em R$, edita e arquiva", async ({ page }, info) => {
  const name = `Curso${info.project.name}${Date.now()}`;
  await signInAsAdmin(page);
  await openSettingsItem(page, /Produtos/);

  await page.getByLabel("Nome do produto").fill(name);
  await page.getByLabel("Preço").fill("");
  await page.getByLabel("Preço").pressSequentially("99700");
  await expect(page.getByLabel("Preço")).toHaveValue(/R\$\s*997,00/);
  await page.getByRole("button", { name: "Adicionar" }).click();

  const list = page.getByRole("list", { name: "Produtos cadastrados" });
  const item = list.getByRole("listitem").filter({ hasText: name });
  await expect(item).toContainText(/R\$\s*997,00/);

  await page.getByRole("button", { name: `Editar ${name}` }).click();
  await page.getByLabel("Preço").fill("");
  await page.getByLabel("Preço").pressSequentially("120050");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(item).toContainText(/R\$\s*1\.200,50/);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Arquivar ${name}` }).click();
  await expect(list.getByText(name)).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Nome do produto")).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
});
