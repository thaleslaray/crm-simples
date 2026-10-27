# 11: Ficha do contato e notas internas

**What to build:** ao lado da conversa (ou numa aba, no celular), o atendente vê a ficha do contato: foto, telefone (não editável), nome, e-mail, empresa e observação editáveis, e o histórico de conversas do contato. Dentro da conversa, ele escreve notas internas, que aparecem na linha do tempo com visual diferente, autor e horário, nunca vão para o cliente e ficam reunidas na ficha. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 05 (Status e responsável)

**Status:** ready-for-agent

- [ ] Foto via avatar da Uazapi, renovada quando a URL temporária expirar
- [ ] Campos editáveis fixos: nome, e-mail, empresa, observação; telefone somente leitura
- [ ] Histórico de conversas do contato com status e responsáveis
- [ ] Notas internas na linha do tempo, visualmente distintas, com autor e horário
- [ ] Teste garante que nota interna nunca gera chamada à Uazapi
- [ ] Ficha agrega as notas de todas as conversas do contato
- [ ] Notas e edições publicadas no hub
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
