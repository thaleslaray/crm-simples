# 02: Admin token da Uazapi e escolha da instância

**What to build:** em Configurações › Conexão do número, o admin informa o endereço do servidor e o **admin token** da Uazapi. O CRM lista as instâncias desse servidor (nome, status, perfil do WhatsApp) e o admin escolhe qual usar; também pode criar uma instância nova pelo nome. A partir da escolha, o CRM usa o token daquela instância em tudo (envio, mídia, webhook, conexão por QR). Substitui o formulário de "token da instância" do ticket 01.

Pedido do Thales em 2026-10-28: "o que eu queria mesmo é poder add Admin Token e, a partir daí, selecionar qual instância utilizar".

**Blocked by:** 01 (done)

**Status:** done

## Referência da API (docs.uazapi.com, uazapiGO v2)

- Admin: header `admintoken: <admin token>`.
- `GET /instance/all` → array de `Instance`: `id`, `name`, `token`, `status` (`disconnected` | `connecting` | `connected` | `hibernated`), `profileName`, `profilePicUrl`, `owner`, `created`, `updated`, `lastDisconnect`, `lastDisconnectReason`. `401`/`403` para admin token inválido.
- `POST /instance/create` com `{ "name": "...", "systemName"?: "..." }` → `{ response, instance: Instance, name, token, status: { connected, loggedIn, jid }, info? }`. A instância nasce `disconnected`.
- O resto (status, connect, webhook, envio) segue com o header `token: <token da instância>`, como hoje.
- Documentação baixada em `/private/tmp/claude-501/-Users-thaleslaray-Projetos-projetos-crm-v3/802f8d8a-ee1f-4a59-8b6d-a854e6df598f/scratchpad/fc/` (`listAllInstances.md`, `createInstance.md`, `schemas-Instance.md`).

## Decisões

- **Guardado (cifrado, mesma cifra do ticket 01):** endereço, admin token, e da instância escolhida: `id`, `name` e token. Migração só com `ADD` na tabela `uazapi_setting` (ou `CREATE` de outra, se ficar mais limpo).
- **Nada de token volta ao navegador:** nem o admin token (só `••••` + 4 últimos), nem o token de nenhuma instância. A lista de instâncias enviada à tela tem só `id`, `name`, `status`, `profileName`, `profilePicUrl`.
- **Salvar admin token:** valida com `GET /instance/all` antes de gravar; recusa com mensagem clara (`400 uazapi_recusou`) se a Uazapi não aceitar ou não responder. Endereço com as mesmas regras do ticket 01.
- **Escolher instância:** o servidor busca de novo `GET /instance/all`, pega o token da instância escolhida pelo `id` (o navegador nunca manda token), grava e configura o webhook da instância nova (o mesmo `configureWebhook` de hoje). Trocar de instância é o mesmo fluxo.
- **Criar instância:** campo de nome + "Criar"; chama `POST /instance/create` e já seleciona a criada.
- **Prioridade da config:** instância escolhida no banco → token de instância salvo pelo ticket 01 (se ainda existir linha antiga) → variáveis de ambiente. Uma só função resolve (`src/worker/uazapi/config.ts`).
- **Rotas (admin, relendo o papel do D1):** `GET /api/admin/uazapi` (resumo), `PUT /api/admin/uazapi` (endereço + admin token), `GET /api/admin/uazapi/instances` (lista sem tokens), `POST /api/admin/uazapi/instances` (criar), `PUT /api/admin/uazapi/instance` (`{ id }`, escolher). Atendente e admin rebaixado: 403.
- **Tela, em passos no mesmo cartão:**
  1. Sem admin token: campos "Endereço do servidor" e "Admin token" + "Salvar".
  2. Com admin token: linha "Servidor … · Admin token ••••abcd · Alterar"; abaixo, a lista de instâncias (nome, pílula de status, nome do perfil/foto quando conectada), cada uma com "Usar esta"; a escolhida aparece marcada ("Em uso"). Embaixo, "Nova instância" (nome + "Criar").
  3. Com instância escolhida: o "Conectar número" de hoje (QR) vale para ela; se ela já estiver `connected`, mostra conectado.
- O formulário de "Token da instância" do ticket 01 sai da tela (a rota antiga pode sair também, se nada mais usar; os testes do 01 que dependem dela devem migrar para o fluxo novo).

## Checklist

- [x] Cliente admin da Uazapi (`listInstances`, `createInstance`) com o header `admintoken`, na mesma interface injetável do cliente atual
- [x] Migração + gravação cifrada do admin token e da instância escolhida; teste de que nenhum token aparece em claro no banco
- [x] Rotas com 403 (atendente, admin rebaixado), 400 para admin token recusado, lista sem tokens
- [x] Escolher instância grava o token certo (pego no servidor) e configura o webhook dela
- [x] Criar instância chama `/instance/create` e seleciona a nova
- [x] Resolução da config com a prioridade acima; webhook valida o token da instância escolhida
- [x] Uazapi falsa (`test/fake-uazapi/server.ts` e a do E2E) atende `/instance/all` e `/instance/create`
- [x] Tela nos três passos; E2E: salva admin token, vê a lista, escolhe uma, cria outra, conecta (QR) com a escolhida; atendente não vê
- [x] README atualizado (como obter o admin token, fluxo de escolha)

## Comments

- 2026-10-28: feito. Tabela nova `uazapi_admin` (migração 0017, só CREATE); cliente com `listInstances`/`createInstance` (header `admintoken`) na mesma interface; rotas GET/PUT/DELETE `/api/admin/uazapi`, GET/POST `/api/admin/uazapi/instances`, PUT `/api/admin/uazapi/instance`; `resolveUazapiConfig` com a prioridade pedida. A rota antiga de token de instância virou a de admin token (mesmo caminho); a linha antiga continua valendo como reserva (`saveLegacyInstanceToken`, só testes). Extra: `DELETE /api/admin/uazapi` para voltar ao "não configurado" (o E2E usa ao fim). Trocar o endereço do servidor descarta a instância escolhida. `pnpm check` e E2E verdes.
