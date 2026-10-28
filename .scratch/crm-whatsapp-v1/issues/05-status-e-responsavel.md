# 05: Status e responsável

**What to build:** o atendente assume uma conversa aberta e ela passa a "em andamento" com ele como responsável; quando ele responde ao cliente, ela passa sozinha a "aguardando cliente" e volta a "em andamento" quando o cliente escreve. Ele pode transferi-la a um colega e marcá-la como resolvida. O admin atribui ou transfere qualquer conversa. Uma conversa resolvida ou aguardando cliente volta para "em andamento" com o mesmo responsável quando o cliente escreve de novo. Cada mudança aparece na linha do tempo com autor e horário, e a caixa ganha filtros por status, "minhas" e responsável. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto), 04 (Tempo real)

**Status:** ready-for-agent

- [ ] Novo status `aguardando_cliente` (rótulo "Aguardando cliente") em `CONVERSATION_STATUSES`
- [ ] Transições: `aberta` → `em_andamento` (assumir ou atribuir); `aberta` → `aguardando_cliente` na primeira resposta enviada, que também torna o autor responsável; `em_andamento` → `aguardando_cliente` em qualquer envio ao cliente (texto, mídia, nota de voz, resposta rápida, citação), nunca em nota interna nem em envio que falhou; transferir mantém o status; `em_andamento` ou `aguardando_cliente` → `resolvida`; `resolvida` ou `aguardando_cliente` → `em_andamento` com o mesmo responsável quando o cliente escreve (sem responsável existente → `aberta` sem dono)
- [ ] Assumir é condicional: com dois atendentes assumindo ao mesmo tempo, só um vence e o outro recebe erro claro
- [ ] Atendente só transfere conversa da qual é responsável; admin atribui e transfere qualquer uma
- [ ] Eventos de sistema (quem e quando) na linha do tempo; o vaivém automático `em_andamento` ↔ `aguardando_cliente` não gera evento
- [ ] Filtros da caixa: status (incluindo "Aguardando cliente"), "minhas", responsável
- [ ] Mudanças publicadas no hub e refletidas em tempo real
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
