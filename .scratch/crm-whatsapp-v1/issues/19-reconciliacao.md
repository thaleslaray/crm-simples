# 19: Reconciliação

**What to build:** se o webhook perder mensagens (Worker fora do ar, erro de processamento, fila cheia na Uazapi), elas aparecem no CRM mesmo assim alguns minutos depois, sem duplicar nada. Mídias que ficaram presas como "pendente" voltam a ser baixadas. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 08 (Mídia recebida), 18 (Conexão do número)

**Status:** done

- [x] No cron, busca na Uazapi as mensagens recebidas desde o último evento processado (janela curta com margem) e ingere pelo mesmo caminho idempotente do webhook
- [x] Consultas limitadas e indexadas, sem varrer tabelas grandes
- [x] Mídias "pendentes" antigas são reenfileiradas
- [x] Teste: mensagem que nunca chegou pelo webhook aparece depois do cron; mensagem que chegou não duplica

## Comments

2026-10-27: Implementado em `src/worker/reconcile.ts`, chamado pelo cron depois de `refreshConnection`. Janela = desde a ultima conferencia bem-sucedida (tabela `reconciliation_state`) menos 10 min de margem; 1 h na primeira vez, teto de 24 h; ate 5 paginas de 100 em `POST /message/find`. Ingere por `ingestMessage` (idempotente) e publica `message.created`. Falha de ingestao nao avanca a marca. Midia `pending` com mais de 10 min e reenfileirada (50 por ciclo, indice parcial `message_media_pending_idx`). Pendente para validacao real: formato e ordem (mais recentes primeiro) da resposta de `/message/find` e do campo `hasMore` nao foram confirmados na Uazapi real; o cliente assume o formato do evento `messages`.
