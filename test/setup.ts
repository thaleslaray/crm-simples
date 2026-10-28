import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

// Aplica as migracoes versionadas (migrations/) no D1 do Miniflare antes dos testes de cada arquivo.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// O armazenamento e isolado por ARQUIVO de teste, nao por teste: limpa TODAS as tabelas entre os testes,
// descobertas em sqlite_master (tabela nova entra sozinha). Fica de fora a de controle das migracoes do D1
// (d1_migrations), senao elas reaplicariam. defer_foreign_keys adia o checo de FK ate o fim do batch,
// entao a ordem dos DELETE nao importa (PRAGMA foreign_keys = OFF nao e suportado no D1).
beforeEach(async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name != 'd1_migrations'",
  ).all<{ name: string }>();
  await env.DB.batch([env.DB.prepare("PRAGMA defer_foreign_keys = ON"), ...results.map(({ name }) => env.DB.prepare(`DELETE FROM "${name}"`))]);
});
