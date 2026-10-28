# 01: Esqueleto e login

**What to build:** o CRM existe e está no ar em `workers.dev`: um único Worker serve a API e o front React, o primeiro admin é criado por script e consegue entrar com e-mail e senha e sair. Não há tela de cadastro. A base de testes do projeto fica pronta para as próximas fatias: testes pela borda do Worker sobre D1, Durable Object, Queues e R2 do Miniflare, um servidor Uazapi falso que grava as chamadas e devolve respostas programadas, e Playwright para os E2E. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] Worker com Hono serve API e static assets do React (Vite) na mesma origem; deploy em `workers.dev` no plano Workers Paid
- [x] D1 com Drizzle e migrações versionadas
- [x] Better Auth com e-mail e senha, instanciado por requisição, `nodejs_compat` ligado, cache de sessão em cookie
- [x] Script de bootstrap cria o primeiro admin; não existe rota nem tela de cadastro público
- [x] Papéis `admin` e `atendente` existem e são verificados no servidor
- [x] Login, logout e tela inicial vazia (caixa de entrada sem conversas)
- [x] Harness de testes da borda do Worker com Uazapi falsa, e um teste E2E de login rodando
- [x] Segredos (tokens Uazapi, segredo do webhook, segredo de auth) lidos de secrets do Worker
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

**2026-10-27 — implementação local concluída.** Todos os itens prontos e testados localmente (`pnpm typecheck`, 24 testes de borda, 2 E2E desktop/celular), exceto o **deploy em `workers.dev`**, adiado por decisão do usuário: falta criar D1, R2 e filas na conta, preencher os IDs no `wrangler.jsonc`, cadastrar os secrets e rodar `wrangler deploy` (passos no README). Por isso o status virou `ready-for-human`.

Notas para os próximos tickets:
- O pacote de testes usado é `@cloudflare/vitest-plugin` (sucessor do `vitest-pool-workers`) com vitest 5; a Uazapi falsa é um servidor Node controlado por HTTP (`test/helpers/fake-uazapi.ts`).
- `requireAuth` confia no cookie cache de sessão (60 s); só `requireRole` relê o D1. O ticket 06 (remover membro "imediatamente") precisa tratar isso — ex.: reler o D1 em `requireAuth` ou reduzir o `maxAge`.
- `baseURL` do Better Auth é derivado da origem da requisição; rever ao adotar domínio próprio.

