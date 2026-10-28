# CRM de atendimento por WhatsApp

Um Worker da Cloudflare (Hono) serve a API (`/api/*`) e o front React + Vite (SPA) na mesma origem.
D1 + Drizzle, R2, Queues, um Durable Object (hub da caixa de entrada) e Cron Trigger. Login com Better Auth
(e-mail e senha, **sem cadastro público**). Spec e tickets em `.scratch/crm-whatsapp-v1/`.

## Instalar

```bash
pnpm install
cp .dev.vars.example .dev.vars   # ajuste os valores (o arquivo é ignorado pelo git)
```

## Rodar local

```bash
pnpm db:migrate:local            # aplica migrations/ no D1 local (.wrangler/state)
pnpm bootstrap:admin --local --email voce@exemplo.com --name "Seu Nome" --password 'uma-senha-forte'
pnpm dev                         # Vite + Worker no workerd, em http://localhost:5173
```

Mudou o esquema (`src/worker/db/schema.ts`)? `pnpm db:generate` cria a migração em `migrations/`; depois `pnpm db:migrate:local`.

## Criar o primeiro admin

`pnpm bootstrap:admin (--local | --remote) --email ... --name ... --password ...` (a senha também pode vir de
`BOOTSTRAP_ADMIN_PASSWORD`). Gera o hash com o hasher do próprio Better Auth e grava `user` + `account` via
`wrangler d1 execute`. É o único jeito de criar usuário por enquanto: não há rota nem tela de cadastro.

## Testes

```bash
pnpm typecheck   # tsc sobre worker, front, testes e scripts
pnpm test        # vitest + @cloudflare/vitest-plugin (Miniflare: D1, R2, Queue, Durable Object, cron)
pnpm test:e2e    # Playwright (desktop + celular 375px); sobe o app com D1 limpo e a Uazapi falsa
```

- Testes de borda entram pelo Worker (`exports.default.fetch`, `worker.queue`, `worker.scheduled`) e aplicam as
  migrações antes (`test/setup.ts`). As tabelas são limpas entre os testes.
- **Uazapi falsa** (`test/fake-uazapi/server.ts`): servidor HTTP Node que grava as chamadas e devolve respostas
  programadas (status, headers como `Retry-After`, corpo, atraso). No vitest sobe no `globalSetup` e
  `UAZAPI_BASE_URL` aponta para ele; os testes a controlam por `test/helpers/fake-uazapi.ts`
  (`program(...)`, `calls()`). O E2E usa o mesmo servidor (`e2e/fake-uazapi-server.ts`, porta 4010).
- Usuários nos testes: `test/helpers/users.ts` usa a mesma função do bootstrap (`src/worker/db/seed-user.ts`).
- Primeira vez com Playwright: `pnpm exec playwright install chromium`.

## Papéis e segurança

`requireAuth` e `requireRole('admin')` (`src/worker/middleware.ts`) validam a sessão no servidor. O cache de sessão
em cookie dura 60 s: `requireRole` ignora o cache e relê a sessão do D1, então rebaixar/remover alguém vale na hora
nas rotas de admin. Rotas só com `requireAuth` podem aceitar uma sessão revogada por até 60 s.

## O que falta configurar para o deploy

Nada foi criado na conta Cloudflare. Os IDs em `wrangler.jsonc` são placeholders.

1. `wrangler login`; plano **Workers Paid**.
2. `wrangler d1 create crm-whatsapp` e colocar o `database_id` em `wrangler.jsonc`.
3. `wrangler r2 bucket create crm-whatsapp-media` e a regra de expiração: `wrangler r2 bucket lifecycle add crm-whatsapp-media expire-365d --expire-days 365` (apaga objetos com mais de 365 dias; a mídia passa a aparecer como "mídia expirada").
4. `wrangler queues create crm-media` e `wrangler queues create crm-media-dlq`.
5. Secrets: `wrangler secret put` para `BETTER_AUTH_SECRET`, `UAZAPI_BASE_URL`, `UAZAPI_INSTANCE_TOKEN`,
   `UAZAPI_ADMIN_TOKEN`, `WEBHOOK_URL_SECRET`.
6. `pnpm build && wrangler d1 migrations apply DB --remote && wrangler deploy`.
7. `pnpm bootstrap:admin --remote ...`.

O `Env` está tipado à mão em `src/worker/env.d.ts` (atualize ao adicionar bindings/secrets).
