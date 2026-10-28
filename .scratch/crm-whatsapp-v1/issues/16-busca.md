# 16: Busca

**What to build:** o atendente busca por nome ou telefone do contato e também por um trecho do texto das mensagens. Os resultados de mensagem mostram o trecho encontrado e, ao clicar, abrem a conversa posicionada nessa mensagem. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** done

- [x] Índice FTS5 sobre texto e legendas das mensagens, mantido a cada mensagem nova
- [x] Busca por nome e telefone do contato
- [x] Resultado de mensagem leva à conversa posicionada na mensagem (carregando o trecho do histórico ao redor)
- [x] Busca rápida com milhares de mensagens (teste com volume)
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

- 2026-10-27: feito. `GET /api/search?q=` devolve `contacts` (nome via FTS5, telefone por LIKE em digitos) e `messages` (FTS5 sobre `message.text`, trecho com termo entre \u0001/\u0002, mais recentes primeiro, limite 30). Indices FTS5 external-content (`message_fts`, `contact_fts`) mantidos por gatilhos na migracao `0002_busca_fts.sql`; legendas de midia (ticket 08) entram sozinhas se gravadas em `message.text`. `GET /conversations/:id/messages` ganhou `around=<messageId>` e `after=<cursor>` (+ `nextAfter`). `test/setup.ts` agora ignora tabelas FTS5 (virtual e sombras) ao limpar. Teste de volume com 20 mil mensagens; E2E em `e2e/busca.spec.ts` (desktop e celular).
