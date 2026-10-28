# 03: Responder com texto

**What to build:** o atendente escreve e envia uma resposta de texto na conversa e o cliente a recebe no WhatsApp com o nome do atendente no início (`*Ana:*`). Se a Uazapi recusar, a mensagem aparece como "falhou" com botão de reenviar; se o envio der timeout, aparece como "incerto" e não é reenviada sozinha. O atendente pode desligar a assinatura no perfil. O rascunho de cada conversa é preservado ao trocar de conversa. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** done

- [x] Cliente Uazapi injetável com envio de texto, backoff com jitter em `429` respeitando `Retry-After`
- [x] Mensagem gravada como "enviando", atualizada com o id retornado pela Uazapi
- [x] Recusa → "falhou" com reenvio manual; timeout → "incerto", nunca reenviada automaticamente
- [x] Prefixo `*Nome:*` + quebra de linha quando a assinatura do atendente estiver ligada (padrão ligada); preferência editável no perfil
- [x] Rascunho por conversa preservado ao navegar
- [x] Testes cobrem assinatura ligada/desligada, recusa, timeout e ausência de reenvio automático
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

**2026-10-27** — Implementado. `pnpm check` verde (testes de borda em `test/send.test.ts` e `test/uazapi-fake.test.ts`: assinatura ligada/desligada, recusa e reenvio manual, timeout como incerto sem reenvio automático nem manual, backoff de 429 com Retry-After e jitter, evento `message.created` no tempo real) e E2E em desktop e celular (`e2e/responder.spec.ts`: rascunho preservado, envio com `*Nome:*`, falhou + reenviar, assinatura desligada no perfil).

Decisões e pendências:
- Envio é síncrono no request (`POST /api/conversations/:id/messages`); a mensagem nasce `sending`, vira `sent` (com id da Uazapi), `failed` (HTTP recusado) ou `uncertain` (timeout/erro de rede). Reenvio só de `failed` (`POST .../:messageId/resend`, 409 caso contrário). Mensagem `uncertain` não tem botão de reenviar; o atendente confere no WhatsApp e escreve de novo. Se a decisão for outra, é ajuste pequeno.
- Mensagem "enviando" presa (Worker morto no meio do envio) fica `sending`; sem varredura por ora.
- A mensagem guarda o texto digitado (sem o prefixo); o prefixo só vai à Uazapi.
- Migração `0002` recria `message` (external_id agora nulo, `direction` aceita `out`, colunas `status` e `sent_by_id`); o SQL do INSERT foi ajustado à mão porque o drizzle-kit selecionava colunas que a tabela antiga não tem.
- Harness: `fileParallelism: false` no vitest (a Uazapi falsa é uma só; chamadas de um arquivo vazavam no outro). `UAZAPI_TIMEOUT_MS` opcional (500 nos testes).
- Rascunho em `sessionStorage` por conversa, limpo ao sair. Status de entrega (entregue/lida) é do ticket 06.
- Preferência de assinatura lida do D1 no envio (o cookie de sessão pode estar 60 s defasado).
