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

## Deploy (Cloudflare, conta "Thales Laray")

Recursos criados com o `cf` em 2026-10-28 e já apontados em `wrangler.jsonc`:

- Worker `crm-simples`; D1 `crm-simples` (migrações aplicadas); R2 `crm-simples-media` com expiração de 365 dias
  (a mídia mais velha passa a aparecer como "mídia expirada"); filas `crm-simples-media` e `crm-simples-media-dlq`.

O deploy é pelo GitHub (Workers Builds): cada push no `main` de `thaleslaray/crm-simples` builda e publica.

- Build: `pnpm build`
- Deploy: `pnpm exec wrangler d1 migrations apply DB --remote && pnpm exec wrangler deploy`

Secrets do Worker (fora do repositório): `BETTER_AUTH_SECRET` e `WEBHOOK_URL_SECRET`. Para trocar um:
`pnpm exec wrangler secret put <NOME>`.

Uazapi: o admin informa o endereço do servidor e o token da instância em Configurações › Conexão do número. O token
fica cifrado no D1 (AES-GCM, chave derivada do `BETTER_AUTH_SECRET`) e nunca volta ao navegador. **Trocar o
`BETTER_AUTH_SECRET` invalida o token guardado**: a tela volta a pedir os dados. Sem dados no banco, valem os secrets
opcionais `UAZAPI_BASE_URL` e `UAZAPI_INSTANCE_TOKEN` (usados por testes e por quem já os tem configurados).

Primeiro admin: `pnpm bootstrap:admin --remote --email ... --name ... --password ...` (precisa de `pnpm exec wrangler login`).

O `Env` está tipado à mão em `src/worker/env.d.ts` (atualize ao adicionar bindings/secrets).
