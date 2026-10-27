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
