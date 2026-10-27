# 19: Reconciliação

**What to build:** se o webhook perder mensagens (Worker fora do ar, erro de processamento, fila cheia na Uazapi), elas aparecem no CRM mesmo assim alguns minutos depois, sem duplicar nada. Mídias que ficaram presas como "pendente" voltam a ser baixadas. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 08 (Mídia recebida), 18 (Conexão do número)

**Status:** ready-for-agent

- [ ] No cron, busca na Uazapi as mensagens recebidas desde o último evento processado (janela curta com margem) e ingere pelo mesmo caminho idempotente do webhook
- [ ] Consultas limitadas e indexadas, sem varrer tabelas grandes
- [ ] Mídias "pendentes" antigas são reenfileiradas
- [ ] Teste: mensagem que nunca chegou pelo webhook aparece depois do cron; mensagem que chegou não duplica
