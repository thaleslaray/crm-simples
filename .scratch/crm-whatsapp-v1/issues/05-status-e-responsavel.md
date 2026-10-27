# 05: Status e responsável

**What to build:** o atendente assume uma conversa aberta e ela passa a "em andamento" com ele como responsável; pode transferi-la a um colega e marcá-la como resolvida. O admin atribui ou transfere qualquer conversa. Uma conversa resolvida volta para "em andamento" com o mesmo responsável quando o cliente escreve de novo. Cada mudança aparece na linha do tempo com autor e horário, e a caixa ganha filtros por status, "minhas" e responsável. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto), 04 (Tempo real)

**Status:** ready-for-agent

- [ ] Transições: `aberta` → `em_andamento` (assumir, atribuir ou primeira resposta enviada); transferir; `em_andamento` → `resolvida`; `resolvida` → `em_andamento` com o mesmo responsável quando o cliente escreve
- [ ] Assumir é condicional: com dois atendentes assumindo ao mesmo tempo, só um vence e o outro recebe erro claro
- [ ] Atendente só transfere conversa da qual é responsável; admin atribui e transfere qualquer uma
- [ ] Eventos de sistema (quem e quando) na linha do tempo
- [ ] Filtros da caixa: status, "minhas", responsável
- [ ] Mudanças publicadas no hub e refletidas em tempo real
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
