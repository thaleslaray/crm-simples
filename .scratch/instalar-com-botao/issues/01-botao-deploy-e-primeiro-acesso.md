# 01: Botão "Deploy to Cloudflare" e tela de primeiro acesso

**What to build:** quem quer o CRM clica num botão no README, confirma na tela da Cloudflare (nome do repositório,
recursos e três segredos) e, no fim do build, abre o site e cria o próprio admin numa tela de **primeiro acesso**. Sem
terminal, sem `pnpm bootstrap:admin`. O botão cria um repositório no GitHub da pessoa e liga o Workers Builds: cada
push publica.

Pedido do Thales em 2026-10-28. Pesquisa em `/Users/thaleslaray/pesquisas/pesquisa-deploy-cloudflare-github-2026-10-28.md`;
doc oficial do botão: https://developers.cloudflare.com/workers/platform/deploy-buttons/ (atualizada 2026-10-12).

**Blocked by:** None

**Status:** done

## O que a doc do botão exige (conferido)

- Repositório **público** (o Thales torna público; não faz parte deste ticket).
- `package.json`: o botão preenche o build com o script `build` e o deploy com o script `deploy`. As migrações do D1
  vão dentro do `deploy`, pelo nome do binding (`DB`).
- Segredos: declarados em `.dev.vars.example` (dotenv). Descrição de cada um em `package.json` ›
  `cloudflare.bindings.<NOME>.description` (aceita `código`, **negrito** e links).
- Recursos: lê o `wrangler.jsonc` e cria D1, R2, Queues e Durable Objects com os nomes do arquivo.
- Não usar `preview_image_url` vazio no bloco `cloudflare` do `package.json` (quebra o botão).

## Decisões

- **Script `deploy`:** `"deploy": "bash scripts/deploy-cloudflare.sh"` (o script já existe e acerta a ordem das
  migrações na primeira vez). Manter `deploy:cloudflare` como apelido para não quebrar o deploy do Thales, que usa
  esse nome no Workers Builds dele.
- **`.dev.vars.example` com só três segredos** (os dados da Uazapi saem, eles vão pela tela do CRM):
  - `BETTER_AUTH_SECRET`: "Gere um valor aleatório com `openssl rand -base64 32`. Protege o login; não troque depois."
  - `WEBHOOK_URL_SECRET`: "Gere outro valor aleatório com `openssl rand -base64 32`."
  - `SETUP_CODE`: "Um código que só você sabe (ex.: uma frase). O CRM pede ele para criar o primeiro admin."
  Os valores de exemplo no arquivo devem servir para o desenvolvimento local (o arquivo também é o modelo do
  `.dev.vars`).
- **Bloco `cloudflare` no `package.json`:** `label` ("CRM Simples") e as três descrições acima. Sem imagem.
- **Tela de primeiro acesso:**
  - `GET /api/setup` (público): `{ needed: boolean }`. `needed` = não existe nenhum usuário **e** `SETUP_CODE` está
    configurado. Sem `SETUP_CODE`, a tela nunca abre (o caminho é o `pnpm bootstrap:admin`, como hoje).
  - `POST /api/setup` (público): `{ code, name, email, password }`. Cria o admin com a mesma função do bootstrap
    (`src/worker/db/seed-user.ts`) e já abre a sessão. Recusa com `403` se já existe algum usuário (mesmo com código
    certo), `403` se o código não bate (comparação em tempo constante), `400` para senha com menos de 12 caracteres
    ou e-mail inválido. Duas chamadas simultâneas não podem criar dois admins (a criação confere "nenhum usuário"
    dentro da mesma operação no D1, ou usa uma trava; teste isso).
  - Limite de tentativas no `POST` (o projeto já tem limite de login desde o commit 47b86f1; reaproveite o mecanismo).
  - Front: rota `/primeiro-acesso` com nome, e-mail, senha e "Código de instalação". O login (`/login`) consulta
    `GET /api/setup`; se `needed`, leva para `/primeiro-acesso`. Depois de criar, entra direto na caixa de entrada.
    Visual dos tokens do design, igual ao cartão do login.
- **README:** o botão no topo da seção de instalação ("Jeito mais fácil"), com o que acontece depois do clique
  (repositório criado, build de 1 a 3 minutos, abrir o endereço e criar o admin com o código). Mantém o jeito
  com o Claude Code e o manual; no manual e no `/instalar`, o passo do admin vira: definir `SETUP_CODE` e usar a tela,
  ou o `pnpm bootstrap:admin` como alternativa.
- **URL do botão:** `https://deploy.workers.cloudflare.com/?url=https://github.com/thaleslaray/crm-simples`.
- **Não mexer** no `wrangler.jsonc` (já está sem IDs) nem no deploy do Thales.

## Checklist

- [x] `package.json`: script `deploy`, apelido `deploy:cloudflare`, bloco `cloudflare` com `label` e descrições
- [x] `.dev.vars.example` com os três segredos e comentários
- [x] `GET`/`POST /api/setup` com os testes de borda: abre só sem usuários e com `SETUP_CODE`; código errado 403;
      já existe usuário 403; senha curta 400; duas chamadas ao mesmo tempo criam um só admin; sessão aberta depois
- [x] Tela `/primeiro-acesso` e o desvio a partir do `/login`
- [x] E2E: banco sem usuários (cuidado: o E2E compartilha um D1 com admin criado pelo bootstrap; isole este caso,
      por exemplo com um teste de borda para a regra e um E2E que só confere o desvio quando a API diz `needed`)
- [x] README e `.claude/skills/instalar/SKILL.md` atualizados
- [x] `pnpm check` verde e suíte E2E completa verde

## Comments

2026-10-28: feito. Testes de borda em test/setup-primeiro-acesso.test.ts (11 casos, inclusive a corrida e o limite de 5 por minuto), tela /primeiro-acesso e E2E em e2e/primeiro-acesso.spec.ts (o GET da API é simulado; a regra "só abre sem usuários" fica nos testes de borda para não apagar o admin do D1 compartilhado). pnpm check verde; E2E completo 124 passed, 8 skipped. Para o Thales: tornar o repositório público e testar o botão de verdade; deploy:cloudflare foi mantido como apelido.
