# 07: Status de entrega e leitura

**What to build:** o atendente vê em cada mensagem enviada se ela foi enviada, entregue ou lida pelo cliente. Ao abrir uma conversa, as mensagens do cliente são marcadas como lidas no WhatsApp e o contador de não lidas daquela conversa zera. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto)

**Status:** ready-for-agent

- [ ] Eventos `messages_update` atualizam o status (`Sent`, `Delivered`, `Read`, `Played`, `Failed`) usando `event.MessageIDs[]`; `event.Timestamp` tratado em segundos
- [ ] O status nunca regride; "falhou" só se aplica a mensagens ainda não entregues
- [ ] Contador de não lidas por conversa na caixa de entrada
- [ ] Abrir a conversa zera o contador e chama marcar-como-lida na Uazapi
- [ ] Mudanças de status publicadas no hub
