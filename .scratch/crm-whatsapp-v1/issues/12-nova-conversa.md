# 12: Nova conversa

**What to build:** o atendente clica em "Nova conversa", escolhe um contato existente ou digita um número, escreve e envia a primeira mensagem. Se o número não existir no CRM, o contato é criado. Quem inicia vira o responsável. Também dá para iniciar a partir da ficha do contato. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 11 (Ficha do contato e notas internas)

**Status:** ready-for-agent

- [ ] Botão "Nova conversa" com busca de contato ou número digitado
- [ ] Número inválido é recusado antes do envio, com mensagem clara
- [ ] Número novo cria o contato; conversa criada já `em_andamento` com quem iniciou
- [ ] Ação de iniciar conversa na ficha do contato
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
