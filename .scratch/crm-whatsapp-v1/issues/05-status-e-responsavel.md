# 05: Status e responsável

**What to build:** o atendente assume uma conversa aberta e ela passa a "em andamento" com ele como responsável; quando ele responde ao cliente, ela passa sozinha a "aguardando cliente" e volta a "em andamento" quando o cliente escreve. Ele pode transferi-la a um colega e marcá-la como resolvida. O admin atribui ou transfere qualquer conversa. Uma conversa resolvida ou aguardando cliente volta para "em andamento" com o mesmo responsável quando o cliente escreve de novo. Cada mudança aparece na linha do tempo com autor e horário, e a caixa ganha filtros por status, "minhas" e responsável. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto), 04 (Tempo real)

**Status:** done

- [x] Novo status `aguardando_cliente` (rótulo "Aguardando cliente") em `CONVERSATION_STATUSES`
- [x] Transições: `aberta` → `em_andamento` (assumir ou atribuir); `aberta` → `aguardando_cliente` na primeira resposta enviada, que também torna o autor responsável; `em_andamento` → `aguardando_cliente` em qualquer envio ao cliente (texto, mídia, nota de voz, resposta rápida, citação), nunca em nota interna nem em envio que falhou; transferir mantém o status; `em_andamento` ou `aguardando_cliente` → `resolvida`; `resolvida` ou `aguardando_cliente` → `em_andamento` com o mesmo responsável quando o cliente escreve (sem responsável existente → `aberta` sem dono)
- [x] Assumir é condicional: com dois atendentes assumindo ao mesmo tempo, só um vence e o outro recebe erro claro
- [x] Atendente só transfere conversa da qual é responsável; admin atribui e transfere qualquer uma
- [x] Eventos de sistema (quem e quando) na linha do tempo; o vaivém automático `em_andamento` ↔ `aguardando_cliente` não gera evento
- [x] Filtros da caixa: status (incluindo "Aguardando cliente"), "minhas", responsável
- [x] Mudanças publicadas no hub e refletidas em tempo real
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-27: implementado test-first (`test/status.test.ts`, 30 testes pela borda) e E2E `e2e/status.spec.ts` (desktop e celular, prints conferidos).
- Rotas: `POST /:id/assume|assign|resolve`, `GET /:id/events`, filtros `?status=&assignee=me|none|<id>` em `GET /api/conversations`, `GET /api/members`. Tabela nova `conversation_event` (migração 0005, só CREATE TABLE).
- Transição para `aguardando_cliente` num ponto único: `markReplied` em `src/worker/status.ts`, chamada ao fim de `sendOutgoingText` (`send.ts`) quando o envio não falhou (inclui "incerto"). Tickets de mídia, citação e resposta rápida devem chamar `markReplied` no mesmo ponto do envio deles.
- Tempo real: evento novo `conversation.updated { conversation, event }`; `message.created` já traz a conversa com o status novo.
- Decisões: só o responsável (ou admin) resolve e transfere; atribuir conversa sem dono é só do admin. Remover atendente (devolver conversas a `aberta`) é do ticket de equipe; a reabertura já trata responsável inexistente.
- Fora do E2E: transferência pela UI (só há um membro no E2E); coberta pelos testes de API.
