# 18: Conexão do número

**What to build:** o admin abre a tela de conexão, vê se o número está conectado, conectando ou desconectado e, se desconectado, escaneia o QR code (que se atualiza sozinho) para reconectar. Quando o número cai, todos os membros veem uma faixa vermelha no topo de todas as telas, que some quando ele volta. Um cron confere o status a cada 5 minutos, porque nem toda queda gera aviso. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 04 (Tempo real)

**Status:** ready-for-agent

- [ ] Tela de conexão só para admin, com status e QR code atualizado enquanto `connecting`
- [ ] Pareamento com `history_days: 0`
- [ ] Configuração do webhook na Uazapi (eventos `messages`, `messages_update`, `connection`; `excludeMessages` com grupos e `fromMe`; `addUrlEvents` e `addUrlTypesMessages` desligados)
- [ ] Evento `connection` e Cron Trigger de 5 minutos atualizam o estado no D1 e publicam no hub; `TemporaryBan` é exibido como tal
- [ ] Faixa vermelha para todos quando não estiver `connected`
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-27: feito. Rotas em `src/worker/connection.ts`: `GET /api/connection` (qualquer membro, estado do D1), `GET /api/connection/status` (admin; consulta a Uazapi e devolve o QR atual) e `POST /api/connection/connect` (admin; cadastra o webhook com `messages`/`messages_update`/`connection`, `excludeMessages: ["isGroupYes","fromMeYes"]`, `addUrlEvents`/`addUrlTypesMessages` falsos, e pareia com `history_days: 0`). Estado em `connection_state` (uma linha; sem linha = `unknown`, sem faixa). O evento `connection` do webhook e o cron de 5 min gravam o estado e publicam `connection.changed` no hub só quando algo muda; `TemporaryBan` vira `temporaryBan: true` e é preservado se o cron confirmar que segue desconectado. Se a Uazapi não responde ao cron, o estado fica como estava. Front: faixa vermelha em todas as telas logadas (`ConnectionProvider`), tela `/conexao` só para admin com QR atualizado a cada 3 s enquanto `connecting`. Os campos do payload Uazapi (`/instance/connect`, `/webhook`, `instance.qrcode`, `lastDisconnectReason`) foram testados só contra a Uazapi falsa: conferir com a instância real. `vitest.config.ts` passou a rodar arquivos em série (a Uazapi falsa é global e o reset de um arquivo atropelava o outro). Para o ticket 19: o cron em `src/worker/scheduled.ts` já chama `refreshConnection`; a reconciliação entra depois dele.
