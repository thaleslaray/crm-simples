# 01: Dados da Uazapi pela tela de Conexão do número

**What to build:** o admin informa o endereço do servidor da Uazapi e o token da instância em Configurações › Conexão do número, em vez de gravar segredos na Cloudflare. O CRM guarda esses dados no banco, cifrados, e passa a usá-los em todo lugar que hoje lê `UAZAPI_BASE_URL` e `UAZAPI_INSTANCE_TOKEN`. Depois de salvar, o "Conectar número" funciona como hoje (QR code, webhook configurado sozinho).

Pedido do Thales em 2026-10-28, depois do deploy: na tela no ar, "Conectar número" mostrava "Não foi possível iniciar a conexão" porque os segredos da Uazapi não existiam.

**Blocked by:** None

**Status:** done

## Decisões

- **Só dois campos:** "Endereço do servidor" (ex.: `https://seu-subdominio.uazapi.com`) e "Token da instância". O `UAZAPI_ADMIN_TOKEN` não é usado por nenhum código; sai do README e do `.dev.vars.example`.
- **Onde fica:** tabela de linha única (como `workspace_setting`/`connection_state`), migração só com `CREATE`/`ADD`. Upsert; ausência de linha = não configurado.
- **Cifrado no banco:** o token é guardado cifrado com AES-GCM (Web Crypto), chave derivada por HKDF do `BETTER_AUTH_SECRET` com um rótulo próprio. Trocar o `BETTER_AUTH_SECRET` invalida o token guardado: a tela volta a pedir os dados (documentar no README).
- **Nunca volta ao navegador:** a API devolve só `configured`, o endereço e os 4 últimos caracteres do token (`••••abcd`). Para trocar, o admin digita um token novo; campo vazio mantém o atual.
- **Prioridade:** dado do banco vence; sem dado no banco, usa as variáveis de ambiente (`UAZAPI_BASE_URL`/`UAZAPI_INSTANCE_TOKEN`) como hoje. Assim os testes de borda, o E2E e quem já usa segredo continuam funcionando.
- **Validação ao salvar:** endereço `https://` (aceitar `http://` só para `127.0.0.1`/`localhost`, que os testes usam); antes de gravar, chama `getInstanceStatus()` com os dados novos e recusa (`400`, mensagem clara) se a Uazapi não aceitar o token ou não responder.
- **Permissão:** `GET`/`PUT /api/admin/uazapi` (ou nome que siga as rotas existentes) só para admin, relendo o papel do D1 como as outras rotas que mudam estado. Atendente: 403.
- **Webhook:** a validação do token no webhook (`src/worker/webhook.ts`) passa a usar o mesmo token resolvido (banco ou ambiente).
- **Tela:** no cartão de Conexão do número, acima do "Conectar número": se não configurado, o formulário com os dois campos e "Salvar"; se configurado, uma linha "Servidor: … · Token ••••abcd" com "Alterar". O botão "Conectar número" só aparece com a Uazapi configurada; sem ela, a mensagem "Informe os dados da Uazapi para conectar o número." Mesmo visual dos outros cartões (tokens do design).

## Checklist

- [x] Módulo único que resolve a config da Uazapi (banco → ambiente) e todos os usos de `createUazapiClient` e do webhook passam por ele (`connection`, `conversations`, `send`, `queue`, `contacts`, `reconcile`, `webhook`)
- [x] Tabela + migração; token cifrado; teste de que o valor gravado no banco não contém o token em claro
- [x] Rotas admin com 403 para atendente e para admin rebaixado com cookie válido; validação de endereço; recusa quando a Uazapi não aceita o token
- [x] Resposta nunca inclui o token inteiro
- [x] Tela de Conexão com formulário, estado configurado e "Alterar"
- [x] E2E: admin salva os dados (Uazapi falsa), vê `••••` e consegue "Conectar número"; atendente não vê a tela
- [x] README e `.dev.vars.example` atualizados

## Comments

### 2026-10-28
Feito. Módulo `src/worker/uazapi/config.ts` (banco, depois ambiente; cifra AES-GCM com HKDF do `BETTER_AUTH_SECRET`) e `getUazapiClient`, usado por `connection`, `conversations`, `send`, `queue`, `contacts`, `reconcile`; webhook valida contra o token resolvido (sem config, recusa tudo). Rotas `GET`/`PUT /api/admin/uazapi` (admin; 403 atendente e admin rebaixado; 400 `endereco_invalido`, `token_obrigatorio`, `uazapi_recusou`). Migração `0016_minor_quentin_quire.sql` (só `CREATE`). Testes de borda em `test/uazapi-config.test.ts` (20), E2E em `e2e/uazapi-na-tela.spec.ts`; `pnpm check` e suíte E2E completa verdes. `UAZAPI_ADMIN_TOKEN` removido do README, `.dev.vars.example`, tipos, testes e E2E.
Observações: não há rota para apagar os dados salvos (só trocar); o E2E salva os mesmos valores do ambiente do E2E, então o estado compartilhado fica equivalente. Depois do deploy, o admin precisa informar os dados pela tela (os secrets `UAZAPI_*` na Cloudflare passam a ser opcionais).
