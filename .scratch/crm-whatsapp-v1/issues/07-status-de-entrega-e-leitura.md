# 07: Status de entrega e leitura

**What to build:** o atendente vê em cada mensagem enviada se ela foi enviada, entregue ou lida pelo cliente. Ao abrir uma conversa, as mensagens do cliente são marcadas como lidas no WhatsApp e o contador de não lidas daquela conversa zera. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto)

**Status:** done

- [x] Eventos `messages_update` atualizam o status (`Sent`, `Delivered`, `Read`, `Played`, `Failed`) usando `event.MessageIDs[]`; `event.Timestamp` tratado em segundos
- [x] O status nunca regride; "falhou" só se aplica a mensagens ainda não entregues
- [x] Contador de não lidas por conversa na caixa de entrada
- [x] Abrir a conversa zera o contador e chama marcar-como-lida na Uazapi
- [x] Mudanças de status publicadas no hub

## Comments

- 2026-10-27: implementado test-first (test/status.test.ts, e2e/status-e-leitura.spec.ts). `messages_update` atualiza por `MessageIDs` (id do WhatsApp ou da Uazapi), sem regressão; Failed só antes de entregue; `Timestamp` (segundos) não é usado, o horário da mensagem não muda. Contador `conversation.unread_count` (migração 0005, ADD COLUMN); `POST /api/conversations/:id/read` zera e chama `/message/markread` (falha da Uazapi não prende o contador). Eventos de hub: `message.status` e `conversation.updated`. Formato do payload `messages_update` e do `markread` seguem a spec, não validados com webhook real.
