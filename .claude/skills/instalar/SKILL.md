---
name: instalar
description: Instala o CRM Simples na conta Cloudflare do usuário, do clone ao CRM no ar com o admin criado. Use quando pedirem para instalar, publicar, fazer deploy ou subir o CRM na Cloudflare pela primeira vez.
---

# Instalar o CRM Simples na Cloudflare

Leva o usuário do repositório clonado ao CRM no ar, na conta Cloudflare **dele**. Fale em português, explique cada
passo em uma frase antes de rodar e mostre o resultado. Rode os comandos na raiz do projeto.

O `wrangler.jsonc` não tem IDs de propósito: o `wrangler deploy` cria o banco D1, o bucket R2 e as filas com os nomes
do arquivo, ou reaproveita os que já existem com esses nomes na conta. Nada de criar recursos à mão nem de escrever IDs
no arquivo.

## 1. Conferir o computador

```bash
node --version && pnpm --version && git --version && openssl version
```

Node 22 ou mais novo. Sem pnpm, rode `corepack enable` e confira de novo. Depois:

```bash
pnpm install
```

**Pronto quando** os quatro comandos respondem e o `pnpm install` termina sem erro.

## 2. Entrar na Cloudflare e escolher a conta

```bash
pnpm exec wrangler whoami
```

Sem login, peça ao usuário para rodar `! pnpm exec wrangler login` (o `!` roda no terminal dele; abre o navegador para
autorizar). Com mais de uma conta, mostre a lista e pergunte qual usar. Daí em diante, todo comando `wrangler` leva
`CLOUDFLARE_ACCOUNT_ID=<id escolhido>` na frente.

A conta precisa do plano **Workers Paid** (filas e Durable Objects). Se um passo falhar por plano, diga isso e mande o
usuário para Workers & Pages › Plans no painel.

**Pronto quando** o `whoami` mostra o e-mail do usuário e a conta escolhida.

## 3. Publicar

```bash
pnpm build
```

```bash
pnpm exec wrangler deploy
```

A saída mostra o banco, o bucket e as filas sendo criados ("Provisioning") e, no fim, o endereço do CRM
(`https://crm-simples.<subdominio>.workers.dev`). Guarde o endereço. Se já existir um Worker chamado `crm-simples` na
conta que não seja este CRM, pare e pergunte que nome usar; o nome muda no campo `name` do `wrangler.jsonc`.

```bash
pnpm exec wrangler d1 migrations apply DB --remote
```

Opcional, pergunte antes: apagar mídia com mais de 1 ano.

```bash
pnpm exec wrangler r2 bucket lifecycle add crm-simples-media expire-365d --expire-days 365
```

**Pronto quando** o deploy mostra o endereço e as migrações terminam com tudo ✅ ou "No migrations to apply".

## 4. Gravar os segredos

Gere e grave direto, sem mostrar o valor:

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put WEBHOOK_URL_SECRET
```

Avise: o `BETTER_AUTH_SECRET` protege o login e cifra os tokens da Uazapi; trocar depois desloga todo mundo e obriga a
informar a Uazapi de novo.

**Pronto quando** `pnpm exec wrangler secret list` mostra os dois nomes.

## 5. Criar o admin

A senha é do usuário: ele mesmo roda o comando, para a senha não passar pela conversa. Pergunte o e-mail e o nome, e
entregue o comando pronto para ele rodar com `!` (senha de 12 caracteres ou mais):

```bash
! pnpm bootstrap:admin --remote --email <email> --name "<nome>" --password '<senha>'
```

**Pronto quando** a saída termina com "Admin <email> criado (remoto)".

## 6. Conferir no ar

```bash
curl -s <endereço>/api/health
```

Deve responder `{"ok":true}`. Então mostre ao usuário o que fazer no site (está no README, seção "Depois de
instalar"): entrar, conectar o WhatsApp em Configurações › Conexão do número com o endereço e o Admin Token da Uazapi,
escolher a instância e ler o QR code.

## 7. Publicar a cada push (se o usuário quiser)

Pergunte se o código está num repositório dele no GitHub e se ele quer publicar a cada push. Se sim, é um passo no
painel (o Wrangler não faz): Workers & Pages › crm-simples › Settings › Builds › Connect, escolher o repositório e
preencher:

- **Build command:** `pnpm run build`
- **Deploy command:** `pnpm exec wrangler d1 migrations apply DB --remote && pnpm exec wrangler deploy`

Os segredos do passo 4 continuam valendo.

**Pronto quando** o usuário tem o endereço do CRM, entrou com o admin e sabe o próximo passo no site.
