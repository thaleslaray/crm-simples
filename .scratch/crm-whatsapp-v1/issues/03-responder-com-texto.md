# 03: Responder com texto

**What to build:** o atendente escreve e envia uma resposta de texto na conversa e o cliente a recebe no WhatsApp com o nome do atendente no início (`*Ana:*`). Se a Uazapi recusar, a mensagem aparece como "falhou" com botão de reenviar; se o envio der timeout, aparece como "incerto" e não é reenviada sozinha. O atendente pode desligar a assinatura no perfil. O rascunho de cada conversa é preservado ao trocar de conversa. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** ready-for-agent

- [ ] Cliente Uazapi injetável com envio de texto, backoff com jitter em `429` respeitando `Retry-After`
- [ ] Mensagem gravada como "enviando", atualizada com o id retornado pela Uazapi
- [ ] Recusa → "falhou" com reenvio manual; timeout → "incerto", nunca reenviada automaticamente
- [ ] Prefixo `*Nome:*` + quebra de linha quando a assinatura do atendente estiver ligada (padrão ligada); preferência editável no perfil
- [ ] Rascunho por conversa preservado ao navegar
- [ ] Testes cobrem assinatura ligada/desligada, recusa, timeout e ausência de reenvio automático
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
