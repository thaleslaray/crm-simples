# 06: Negócio criado pelo código da campanha

**What to build:** no ingest, depois da mensagem inserida com sucesso, procurar `#<código>` no texto/legenda (sem diferenciar maiúsculas; só campanhas ativas). Achou: se o contato tem negócio aberto do mesmo produto, grava evento "voltou pela campanha X" na conversa; senão cria o negócio no funil principal, 1ª etapa, com produto, valor do produto, `originKind=campanha`, `originCampaignId` e `sourceMessageId` (único: reconcile não duplica). Sem funil: não cria. Publica os eventos de tempo real. Spec: histórias 18–20.

**Blocked by:** 02, 05

**Status:** ready-for-agent

- [ ] Regex e busca da campanha
- [ ] Regra de retorno e evento na conversa (novo tipo de evento)
- [ ] Idempotência por `sourceMessageId`
- [ ] Testes: cria; reprocessar não duplica; aberto do mesmo produto não cria; outro produto cria; fechado do mesmo produto cria; arquivada ignora; sem funil não cria; sem código não cria
- [ ] E2E: Uazapi falsa envia mensagem com código e o cartão aparece

## Comments
