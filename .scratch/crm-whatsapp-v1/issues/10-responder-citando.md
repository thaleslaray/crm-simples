# 10: Responder citando

**What to build:** o atendente escolhe uma mensagem do cliente e responde em cima dela, como no WhatsApp; o cliente vê a citação. Quando o cliente responde citando algo, o CRM mostra a citação na conversa. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto)

**Status:** done

- [x] Ação "responder" numa mensagem envia com `replyid`
- [x] Mensagens recebidas com citação mostram o trecho citado e levam até a mensagem original
- [x] Funciona para texto e para mídia enviada com legenda
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-27: Texto entregue e testado (API, webhook, E2E desktop e celular, com print). `message.quoted_id` guarda o `messageid` do WhatsApp da citada; o histórico devolve `quote` (resolvida na mesma conversa; some se a original é anterior à conexão). Envio manda `replyid`; reenvio mantém a citação; `replyTo` inválido dá 400 `citacao_invalida`.
Pendente (item "mídia enviada com legenda"): depende do ticket 09, que ainda não existe. Ao enviar mídia, o 09 deve aceitar `replyTo` como em `sendOutgoingText` (resolver `whatsappMessageId` da citada na mesma conversa, gravar `quotedId`, mandar `replyid`); a UI (barra "Respondendo a" e botão Responder) já é genérica. Campo `quoted` do webhook (e `content.contextInfo.stanzaID`) segue a doc da Uazapi, ainda não validado com webhook real.

2026-10-27: Mídia com legenda entregue pelo ticket 09: `POST /messages` multipart aceita `replyTo`, resolve o `whatsappMessageId` da citada na mesma conversa, grava `quotedId` e manda `replyid` em `/send/media`; citação inválida dá 400 sem gravar o arquivo; reenvio mantém a citação (testes em `test/send-media.test.ts`). A UI usa a mesma barra "Respondendo a" para anexo e nota de voz.
