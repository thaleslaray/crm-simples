# 10: Responder citando

**What to build:** o atendente escolhe uma mensagem do cliente e responde em cima dela, como no WhatsApp; o cliente vê a citação. Quando o cliente responde citando algo, o CRM mostra a citação na conversa. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto)

**Status:** ready-for-agent

- [ ] Ação "responder" numa mensagem envia com `replyid`
- [ ] Mensagens recebidas com citação mostram o trecho citado e levam até a mensagem original
- [ ] Funciona para texto e para mídia enviada com legenda
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
