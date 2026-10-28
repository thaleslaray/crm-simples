import path from "node:path";
import { expect, test as base } from "@playwright/test";

// E2E_PRINTS=<pasta>: ao fim de cada teste, salva um print de pagina inteira em <pasta>/<spec>-<projeto>.png.
// Sem a variavel nada muda. Os specs importam test/expect daqui.
// Fixture automatica (e nao test.afterEach): hook em modulo compartilhado so valeria para o primeiro spec carregado.
export const test = base.extend<{ prints: void }>({
  prints: [
    async ({ page }, use, info) => {
      await use();
      const dir = process.env.E2E_PRINTS;
      if (!dir || page.isClosed()) return;
      const spec = path.basename(info.file).replace(/\.spec\.ts$/, "");
      await page.screenshot({ path: path.join(dir, `${spec}-${info.project.name}.png`), fullPage: true });
    },
    { auto: true },
  ],
});
export { expect };

/** Abre o menu ⋮ do cabeçalho da caixa de entrada (Perfil, Sair e atalhos de admin). */
export async function openUserMenu(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Mais opções" }).click();
}
