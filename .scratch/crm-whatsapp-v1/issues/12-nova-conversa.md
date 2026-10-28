# 12: Nova conversa

**What to build:** o atendente clica em "Nova conversa", escolhe um contato existente ou digita um número, escreve e envia a primeira mensagem. Se o número não existir no CRM, o contato é criado. A conversa nasce `em_andamento` com quem iniciou como responsável; o envio da primeira mensagem a leva a `aguardando_cliente` e, se a Uazapi recusar, ela fica `em_andamento`. Também dá para iniciar a partir da ficha do contato. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 11 (Ficha do contato e notas internas)

**Status:** done

- [x] Botão "Nova conversa" com busca de contato ou número digitado
- [x] Número inválido é recusado antes do envio, com mensagem clara
- [x] Número novo cria o contato; conversa criada já `em_andamento` com quem iniciou
- [x] Ação de iniciar conversa na ficha do contato
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-27: `POST /api/conversations/start` (contactId ou phone) reaproveita `sendOutgoingText`. Número normalizado em `src/shared/phone.ts` (so formato: 10 a 11 digitos ganham 55; "+" aceita internacional; nao consulta a Uazapi se o número tem WhatsApp). Conversa nova nasce `em_andamento` com o autor e, enviada, vai a `aguardando_cliente` (regra do envio); se a Uazapi recusar, fica `em_andamento`. Número que ja é contato reutiliza a conversa (uma por contato); resolvida volta a `em_andamento` com quem iniciou; conversa de outro responsável mantém o dono. Sem mudança de schema. Botao "Nova conversa" na caixa e "Iniciar conversa" na ficha; E2E em `e2e/nova-conversa.spec.ts` (desktop e celular).

2026-10-28: texto da ficha corrigido para refletir a spec (criada `em_andamento` com quem iniciou; o envio a leva a `aguardando_cliente`; recusada, fica `em_andamento`). Revisão de código: a nova conversa e a reabertura passaram a publicar `conversation.updated` com o evento; o UPDATE da reabertura é condicional a `resolvida`; reabrir conversa de outro responsável grava também a `transferida`.
