# 02: Nome da empresa

**What to build:** o admin define o nome da empresa em Configurações › Empresa. O nome aparece no topo da lista de conversas, no login, no estado vazio e na aba do navegador ("(3) Nome da empresa"), no lugar de "CRM WhatsApp". Quem estiver com o CRM aberto vê a troca na hora. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). História 4.

**Blocked by:** 01 (Tokens, tema e casca de navegação)

**Status:** done

- [x] Tabela `workspace_setting` (linha única, `companyName`, padrão "Atendimento"), com migração gerada só por `ADD`/`CREATE`
- [x] `GET /api/workspace` público; `PATCH /api/workspace` só para o admin, relendo o papel do D1
- [x] A mudança publica um evento no hub, e os clientes trocam o título sem recarregar
- [x] Tela `/empresa` (só admin) com o campo e o botão salvar
- [x] O nome aparece no cabeçalho da lista, no login, no estado vazio e no título da aba
- [x] Teste de borda: atendente recebe 403; admin rebaixado recebe 403 mesmo com cookie válido; o nome vazio é recusado
- [x] E2E: o admin troca o nome e o título muda numa segunda aba

## Comments

# Ticket 02 (2026-10-28)

- Backend: `workspace_setting` (migração `0015_sticky_magdalene`, só CREATE), `src/worker/workspace.ts` (`GET /api/workspace` público, `PATCH` admin com `requireRole`), evento `workspace.changed` com `companyName` (worker, web e whitelist do cliente). Nome de 1 a 60 letras; erro `nome_invalido`.
- Front: `src/web/workspace.ts` exporta `useCompanyName()` (e `getCompanyName`/`onCompanyName`); usado no login, no h1 da lista (`InboxPage`), no estado vazio e no título da aba (`alerts.ts`: `(N) <nome>`). Tela `/empresa` em `CompanyPage.tsx` (fora da lista de Configurações, o ticket 07 coloca).
- E2E: o heading de "logado" nos specs agora é `Atendimento` (o h1 da lista mostra o nome); `empresa.spec.ts` restaura o nome padrão no fim (D1 compartilhado). `index.html` e `avisos.spec.ts` ajustados.
- `everConnected` de `realtime.ts` saiu do hook para o módulo: se a área logada remonta, o novo socket conta como reconexão e as telas rebuscam. Em dev os sockets reabrem logo após o login (React monta duas vezes), então testes que dependem de evento esperam o conjunto de sockets estabilizar (ver `empresa.spec.ts`).
- Para o 03 e o 07: o h1 da lista ainda existe e agora mostra o nome; ao refazer o cabeçalho, mantenha `useCompanyName()` e o specs de "logado" (casca, login, equipe, funis) trocam para o que o 03 expuser.
