import path from "node:path";
import { expect, test as base } from "@playwright/test";

// E2E_PRINTS=<pasta>: ao fim de cada teste, salva um print de pagina inteira em <pasta>/<spec>-<projeto>.png.
// Sem a variavel nada muda. Os specs importam test/expect daqui.
// Fixture automatica (e nao test.afterEach): hook em modulo compartilhado so valeria para o primeiro spec carregado.
// O login tem limite de 5 tentativas por minuto por IP (cf-connecting-ip). Todos os testes saem do mesmo IP local e
// entram varias vezes, entao cada teste ganha o proprio IP: o limite continua LIGADO, so deixa de ser compartilhado.
let proximoIp = 0;
export const test = base.extend<{ prints: void }>({
  extraHTTPHeaders: async ({}, use) => {
    const n = proximoIp++;
    await use({ "cf-connecting-ip": `10.${(n >> 8) & 255}.${n & 255}.1` });
  },
  prints: [
    async ({ page }, use, info) => {
      await use();
      const dir = process.env.E2E_PRINTS;
      if (!dir || page.isClosed()) return;
      const spec = path.basename(info.file).replace(/\.spec\.ts$/, "");
      await page.screenshot({
        path: path.join(dir, `${spec}-${info.project.name}.png`),
        fullPage: true,
      });
    },
    { auto: true },
  ],
});
export { expect };
