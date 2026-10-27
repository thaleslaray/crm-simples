# 01: Esqueleto e login

**What to build:** o CRM existe e está no ar em `workers.dev`: um único Worker serve a API e o front React, o primeiro admin é criado por script e consegue entrar com e-mail e senha e sair. Não há tela de cadastro. A base de testes do projeto fica pronta para as próximas fatias: testes pela borda do Worker sobre D1, Durable Object, Queues e R2 do Miniflare, um servidor Uazapi falso que grava as chamadas e devolve respostas programadas, e Playwright para os E2E. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Worker com Hono serve API e static assets do React (Vite) na mesma origem; deploy em `workers.dev` no plano Workers Paid
- [ ] D1 com Drizzle e migrações versionadas
- [ ] Better Auth com e-mail e senha, instanciado por requisição, `nodejs_compat` ligado, cache de sessão em cookie
- [ ] Script de bootstrap cria o primeiro admin; não existe rota nem tela de cadastro público
- [ ] Papéis `admin` e `atendente` existem e são verificados no servidor
- [ ] Login, logout e tela inicial vazia (caixa de entrada sem conversas)
- [ ] Harness de testes da borda do Worker com Uazapi falsa, e um teste E2E de login rodando
- [ ] Segredos (tokens Uazapi, segredo do webhook, segredo de auth) lidos de secrets do Worker
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
