# 17: Avisos

**What to build:** quando chega mensagem numa conversa sem responsável, todos os atendentes recebem som e notificação do navegador; numa conversa com responsável, só ele recebe. A notificação mostra o nome do contato e uma prévia, e clicar nela abre a conversa. O título da aba mostra o total de não lidas. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 04 (Tempo real), 05 (Status e responsável)

**Status:** done

- [x] Eventos do hub trazem o necessário para decidir quem é avisado (responsável ou nenhum)
- [x] Regra: sem dono → todos; com dono → só o responsável (teste pela borda)
- [x] Pedido de permissão de notificação do navegador; som quando a aba não está em foco
- [x] Clique na notificação abre a conversa
- [x] Total de não lidas no título da aba

## Comments

2026-10-27: feito. A regra vive em `src/shared/alerts.ts` (`shouldAlert`: só mensagem do cliente; sem responsável avisa todos, com responsável só ele) e é testada pela borda em `test/avisos.test.ts` com eventos reais do WebSocket. Os eventos já traziam `conversation.assigneeId`, sem mudança no Worker. Front em `src/web/alerts.ts`: permissão e som liberados no primeiro clique/tecla; som e notificação só com a aba sem foco; clique na notificação abre `/conversas/:id`; título `(N) CRM WhatsApp` com a soma das não lidas de todas as conversas. E2E em `e2e/avisos.spec.ts` (Notification e WebAudio falsos). Não verificado: som real e notificação real do SO (só com falsos).
