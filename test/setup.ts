import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

// Aplica as migracoes versionadas (migrations/) no D1 do Miniflare antes dos testes de cada arquivo.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// O armazenamento e isolado por ARQUIVO de teste, nao por teste: limpa as tabelas entre os testes.
beforeEach(async () => {
  await env.DB.batch(["session", "account", "verification", "user"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});
