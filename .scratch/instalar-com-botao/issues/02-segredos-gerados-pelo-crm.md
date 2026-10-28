# 02: Segredos gerados pelo próprio CRM

**What to build:** o CRM gera sozinho, na primeira vez que precisa, o segredo do login (`BETTER_AUTH_SECRET`) e o
segredo do webhook (`WEBHOOK_URL_SECRET`), e guarda no banco. Quem instala pelo botão "Deploy to Cloudflare" passa a
preencher **só o código de instalação** (`SETUP_CODE`). Se os segredos existirem na Cloudflare (como no CRM do Thales),
continuam valendo e o banco não é usado para eles.

Pedido do Thales em 2026-10-28: "quero que você coloque pra gerar, não quero me preocupar com isso".

**Blocked by:** 01 (done)

**Status:** done

## Decisões

- **Prioridade:** variável de ambiente (segredo da Cloudflare) → valor guardado no banco → gerar, gravar e usar.
  O CRM do Thales tem os dois segredos no ambiente: nada muda para ele (sessões, tokens cifrados e o webhook
  cadastrado na Uazapi continuam válidos).
- **Onde guarda:** tabela de linha única (ex.: `instance_secret`: `id`, `auth_secret`, `webhook_secret`, `created_at`),
  migração só com `CREATE`. Valores com 32 bytes de `crypto.getRandomValues`, em base64url.
- **Sem corrida:** duas requisições na primeira vez não podem gerar valores diferentes. Grave com
  `INSERT ... ON CONFLICT DO NOTHING` e **releia** a linha depois, usando sempre o que ficou gravado.
- **Cache:** os valores nunca mudam depois de criados; guardar em memória do isolate depois da primeira leitura é
  aceitável (evita uma ida ao D1 por requisição). Só cachear o valor lido do banco, nunca um valor que não foi gravado.
- **Um lugar só:** um módulo (ex.: `src/worker/instance-secrets.ts`) com `getAuthSecret(env)` e
  `getWebhookSecret(env)`. Todos os usos passam por ele: `auth.ts` (`createAuth` vira assíncrona se precisar; ajuste os
  chamadores), `signed-files.ts`, `uazapi/config.ts` (cifra dos tokens), `connection.ts` e `uazapi/admin.ts` (URL do
  webhook), `webhook.ts` (validação).
- **Tipos:** `BETTER_AUTH_SECRET` e `WEBHOOK_URL_SECRET` passam a ser opcionais em `env.d.ts`.
- **Botão:** o `.dev.vars.example` fica só com `SETUP_CODE` (e um comentário dizendo que os outros dois são gerados
  sozinhos e podem ser definidos à mão, se quiser). O bloco `cloudflare.bindings` do `package.json` fica só com a
  descrição do `SETUP_CODE`.
- **Documentação:** README (botão, `/instalar` e manual) e `.claude/skills/instalar/SKILL.md` perdem o passo de gerar
  e gravar os dois segredos. Explicar em uma linha onde eles ficam e o que acontece se alguém apagar a tabela
  (sessões caem, a Uazapi precisa ser informada de novo e o número reconectado, porque o endereço do webhook muda).
- **Segurança, registrar no README:** os dois segredos passam a morar no mesmo banco dos dados. Quem quiser separá-los
  grava os dois como segredos da Cloudflare, que vencem o banco.

## Checklist

- [x] Tabela e migração; módulo único com prioridade ambiente → banco → gerar
- [x] Testes de borda: sem variáveis de ambiente gera e reaproveita o mesmo valor entre requisições; duas
      requisições simultâneas na primeira vez ficam com o mesmo valor; com variável de ambiente, o banco não é usado
      nem escrito; login, link assinado de mídia, cifra da Uazapi e webhook funcionam nos dois modos
- [x] Todos os usos dos dois segredos passam pelo módulo (nenhum `env.BETTER_AUTH_SECRET`/`env.WEBHOOK_URL_SECRET`
      fora dele)
- [x] `.dev.vars.example`, `package.json` (`cloudflare.bindings`), README e `/instalar` atualizados
- [x] `pnpm check` verde e suíte E2E completa verde

## Comments

2026-10-28: feito. Módulo `src/worker/instance-secrets.ts` (`getAuthSecret`/`getWebhookSecret`; ambiente, depois banco, depois gera com `INSERT ... ON CONFLICT DO NOTHING` e relê; cache em memória só do valor lido do banco). Tabela `instance_secret`, migração `0019_steep_payback.sql` (só `CREATE`). `createAuth` virou assíncrona; auth, signed-files, uazapi/config (cifra), connection, uazapi/admin e webhook passam pelo módulo (nenhum `env.BETTER_AUTH_SECRET`/`env.WEBHOOK_URL_SECRET` fora dele). Testes de borda em `test/segredos-gerados.test.ts` (11): o modo "gerado" roda com `withGeneratedSecrets` (zera as duas variáveis no `env` durante o teste, como `withoutUazapiEnv`). `test/setup.ts` esvazia o cache entre testes. `pnpm check` verde (347 testes) e E2E completo verde (124 passaram; em duas execuções anteriores, com a máquina sob carga alta, `uazapi-na-tela` falhou por tempo e passou sozinho e na repetição da suíte). `.dev.vars.example`, `package.json`, README e `/instalar` atualizados.
