# 02: Receber mensagem de texto

**What to build:** quando um cliente manda uma mensagem de texto para o número, ela aparece no CRM: a conversa surge na caixa de entrada (nome ou telefone, prévia, horário) e, ao abri-la, o atendente vê o histórico de texto em ordem, carregando as mais antigas ao rolar para cima. O contato é criado sozinho com o nome do WhatsApp. Mensagens de grupo e `fromMe` não aparecem. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 01 (Esqueleto e login)

**Status:** ready-for-agent

- [ ] Rota de webhook valida o `token` do corpo contra o secret da instância **e** o segredo na URL; chamada inválida é recusada
- [ ] O evento cru é gravado e a rota responde 200 imediatamente; o payload completo nunca é logado
- [ ] Processamento idempotente por `message.id` (guardando também `messageid`): o mesmo evento duas vezes gera uma mensagem só
- [ ] Mensagens com `isGroup` e `fromMe` são descartadas
- [ ] Contato criado pelo telefone, guardando JID por número e por LID quando conhecidos, sem duplicar a mesma pessoa
- [ ] Uma conversa por contato, criada como `aberta` sem responsável
- [ ] Caixa de entrada ordenada pela mensagem mais recente; tela da conversa com histórico paginado
- [ ] Parser de mídia **não** é escopo aqui, mas mensagens de mídia não quebram a ingestão (ficam como "tipo não suportado ainda")
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
