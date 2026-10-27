# 17: Avisos

**What to build:** quando chega mensagem numa conversa sem responsável, todos os atendentes recebem som e notificação do navegador; numa conversa com responsável, só ele recebe. A notificação mostra o nome do contato e uma prévia, e clicar nela abre a conversa. O título da aba mostra o total de não lidas. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 04 (Tempo real), 05 (Status e responsável)

**Status:** ready-for-agent

- [ ] Eventos do hub trazem o necessário para decidir quem é avisado (responsável ou nenhum)
- [ ] Regra: sem dono → todos; com dono → só o responsável (teste pela borda)
- [ ] Pedido de permissão de notificação do navegador; som quando a aba não está em foco
- [ ] Clique na notificação abre a conversa
- [ ] Total de não lidas no título da aba
