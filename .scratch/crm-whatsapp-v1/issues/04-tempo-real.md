# 04: Tempo real

**What to build:** com duas pessoas logadas, uma mensagem que chega aparece para as duas na caixa de entrada e na conversa aberta, sem recarregar. Se a internet cair e voltar, o app se reconecta e se atualiza com o que perdeu. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** ready-for-agent

- [ ] Um Durable Object único ("hub da caixa de entrada") mantém os WebSockets com Hibernation
- [ ] Sessão validada no Worker antes do upgrade; sem sessão válida, o upgrade é recusado
- [ ] Mensagem recebida e mensagem enviada publicam eventos no hub, que faz broadcast
- [ ] O hub não guarda estado de negócio; ao reconectar, o cliente busca pela API o que mudou desde o último evento visto
- [ ] E2E com duas sessões vendo a mesma mensagem chegar
