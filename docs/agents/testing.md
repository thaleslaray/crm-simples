# Testes

O que testar está em `CODING_STANDARDS.md` (seção Testes). Este arquivo cobre o **harness**: como os testes rodam e as pegadinhas que a config não conta.

## Comandos

- `pnpm check`: typecheck + lint de testes + testes de borda. Roda no pre-commit.
- `pnpm test test/auth.test.ts`: um arquivo só, para o ciclo red → green.
- `pnpm test:e2e`: Playwright (desktop e celular 375px). Fora do `check`; rode ao mexer em tela, login ou bootstrap.

## Testes de borda (`test/`)

- Pacote: `@cloudflare/vitest-plugin` com vitest 5, **não** o `@cloudflare/vitest-pool-workers` (renomeado, só aceita vitest 4). A API é outra: `cloudflareTest()` em `vitest.config.ts` e `import { env, exports } from "cloudflare:workers"`. Não existe `SELF`; o Worker é chamado por `exports.default.fetch()`, já embrulhado em `api()` / `postJson()` / `signIn()` de `test/helpers/api.ts`.
- Handlers `queue` e `scheduled`: importe o Worker e chame `worker.queue!(batch, env, ctx)` / `worker.scheduled!(controller, env, ctx)` com `createMessageBatch`, `createScheduledController` e `createExecutionContext` de `cloudflare:test`; modelo em `test/platform.test.ts`.
- Segredos de teste ficam em `vitest.config.ts` (`miniflare.bindings`); o `.dev.vars` não é usado.
- **Isolamento é por arquivo, não por teste.** `test/setup.ts` aplica as migrações e apaga as tabelas antes de cada teste. Toda tabela nova criada numa migração entra na lista de limpeza do `setup.ts`, senão os testes vazam estado entre si.
- Usuários: `createUser()` de `test/helpers/users.ts` usa a mesma função que o `bootstrap:admin`. Arrange que precisa tocar o banco vira helper em `test/helpers/`; o lint de testes barra SQL e Drizzle dentro dos `*.test.ts`.

## Uazapi falsa

Servidor Node (`test/fake-uazapi/server.ts`) subido no `globalSetup`; `UAZAPI_BASE_URL` aponta para ele. No teste:

```ts
const uazapi = fakeUazapi(); // topo do describe; registra reset em beforeEach
await uazapi.program("POST", "/send/text", [{ status: 429, headers: { "Retry-After": "2" } }, { body: { id: "x" } }]);
// ... exercita o Worker ...
expect(await uazapi.calls()).toMatchObject([{ method: "POST", path: "/send/text" }]);
```

- As respostas programadas são uma fila; a última se repete. `delayMs` simula timeout.
- Rota sem resposta programada devolve `501`: um 501 inesperado num teste significa que faltou `program()`.
- O E2E usa outra instância (`e2e/fake-uazapi-server.ts`, porta 4010).

## Pegadinhas

- `compatibility_date` em `wrangler.jsonc` mais nova que a suportada pelo `workerd` instalado quebra o runtime de teste. Suba a data junto com o `wrangler`/`workerd`.
- O cookie cache de sessão (60 s) faz `requireAuth` aceitar cookie de sessão encerrada. Para provar logout ou revogação, use uma rota com `requireRole` ou `get-session?disableCookieCache=true`.
- E2E: `e2e/app-server.ts` recria o D1 em `.wrangler/e2e-state` e cria o admin pelo `bootstrap:admin` a cada execução.
