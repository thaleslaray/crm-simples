# 16: Busca

**What to build:** o atendente busca por nome ou telefone do contato e também por um trecho do texto das mensagens. Os resultados de mensagem mostram o trecho encontrado e, ao clicar, abrem a conversa posicionada nessa mensagem. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** ready-for-agent

- [ ] Índice FTS5 sobre texto e legendas das mensagens, mantido a cada mensagem nova
- [ ] Busca por nome e telefone do contato
- [ ] Resultado de mensagem leva à conversa posicionada na mensagem (carregando o trecho do histórico ao redor)
- [ ] Busca rápida com milhares de mensagens (teste com volume)
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
