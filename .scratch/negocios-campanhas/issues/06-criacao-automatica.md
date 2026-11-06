# 06: Negócio criado pelo código da campanha

**What to build:** no ingest, depois da mensagem inserida com sucesso, procurar `#<código>` no texto/legenda (sem diferenciar maiúsculas; só campanhas ativas). Achou: se o contato tem negócio aberto do mesmo produto, grava evento "voltou pela campanha X" na conversa; senão cria o negócio no funil principal, 1ª etapa, com produto, valor do produto, `originKind=campanha`, `originCampaignId` e `sourceMessageId` (único: reconcile não duplica). Sem funil: não cria. Publica os eventos de tempo real. Spec: histórias 18–20.

**Blocked by:** 02, 05

**Status:** done

- [x] Regex e busca da campanha
- [x] Regra de retorno e evento na conversa (novo tipo de evento)
- [x] Idempotência por `sourceMessageId`
- [x] Testes: cria; reprocessar não duplica; aberto do mesmo produto não cria; outro produto cria; fechado do mesmo produto cria; arquivada ignora; sem funil não cria; sem código não cria
- [x] E2E: Uazapi falsa envia mensagem com código e o cartão aparece

## Comments

### 2026-11-06
Feito. Migração `0023_campanha_automatica`: `conversation_event` ganha `campaign_name`, `campaign_action` (`criou|voltou`) e `source_message_id`, com índice único `(type, source_message_id)`.

- Lógica em `src/worker/campaign-deal.ts` (`applyCampaignCode`, `campaignCodes`, `publishCampaignHit`), chamada por `ingestMessage` só depois da mensagem inserida. Falha no gancho vai para `console.error` e não desfaz a mensagem.
- Regex `#[A-Z]{3}-[A-Z]\d{2,}` sem diferenciar caixa; primeiro código que existir como campanha ativa. Funil principal = primeiro funil por criação, 1ª etapa por `position`; funil sem etapa = não cria. Negócio no fim da etapa (conta todos os negócios da etapa, como `stageDeals`), produto e preço da campanha (mesmo arquivado), `originKind=campanha`, `sourceMessageId` = id da mensagem (`onConflictDoNothing`).
- Evento na conversa: novo tipo `campanha`, gravado nos dois casos ("Negócio criado pela campanha X" e "O cliente voltou pela campanha X"), com `timestamp` da mensagem + 1. Aparece como pílula (`eventText` em `src/web/format.ts`). `listEvents` devolve `campaignName` e `campaignAction`.
- Tempo real: `webhook.ts` e `reconcile.ts` chamam `publishCampaignHit`: `funnel.changed` (negócio novo) e `conversation.updated` com o evento.

Decisões para os tickets 04 e 07:
- **04 (relatório)**: negócios criados automaticamente têm `originKind="campanha"`, `originCampaignId` e `sourceMessageId` preenchido; o manual não tem `sourceMessageId`. O evento "voltou" não cria negócio, então não entra na contagem de negócios (se quiser "retornos por campanha", conte `conversation_event` com `type="campanha"` e `campaign_action="voltou"`; só guarda o nome, não o id da campanha).
- **07**: a faixa/ficha não precisam mudar; o negócio automático chega pelos eventos existentes. No E2E o D1 é compartilhado: o funil principal é o primeiro já criado por qualquer teste, então use `GET /api/funnels` e pegue o primeiro (veja `e2e/campanha-automatica.spec.ts`).
- Código em texto sem `#` não cria; `#` colado a mais letras/dígitos depois do código (ex.: `#CUR-M011x`) não conta.
- Testes: `test/campanha-automatica.test.ts` (13), E2E `e2e/campanha-automatica.spec.ts`.
