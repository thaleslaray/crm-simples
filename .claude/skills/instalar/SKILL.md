---
name: instalar
description: Instala o CRM Simples na conta Cloudflare do usuário pelo GitHub, do clone ao CRM no ar com o admin criado e publicando a cada push. Use quando pedirem para instalar, publicar, fazer deploy ou subir o CRM na Cloudflare pela primeira vez.
---

# Instalar o CRM Simples na Cloudflare, pelo GitHub

O usuário termina com: um repositório **dele** no GitHub, ligado à **conta Cloudflare dele**, que publica o CRM a cada
push no `main`. Fale em português, explique cada passo em uma frase antes de rodar e mostre o resultado. Rode os
comandos na raiz do projeto.

O `wrangler.jsonc` não tem IDs de propósito: o primeiro build na Cloudflare cria o banco D1, o bucket R2 e as filas
com os nomes do arquivo. O comando de deploy é `pnpm run deploy:cloudflare` (`scripts/deploy-cloudflare.sh`), que
acerta a ordem das migrações na primeira vez e nas seguintes.

## 1. Conferir o computador

```bash
node --version && pnpm --version && git --version && gh --version && openssl version
```

Node 22 ou mais novo. Sem pnpm, `corepack enable`. Sem `gh`, oriente a instalar o GitHub CLI (https://cli.github.com).
Depois:

```bash
pnpm install
```

**Pronto quando** os cinco comandos respondem e o `pnpm install` termina sem erro.

## 2. Criar o repositório do usuário no GitHub

```bash
gh auth status
```

Sem login, peça ao usuário para rodar `! gh auth login`. Pergunte o nome do repositório (padrão: `crm-simples`) e se é
privado (padrão: sim). Se o `origin` atual aponta para o repositório de onde ele clonou, guarde-o como `upstream`,
para puxar atualizações depois:

```bash
git remote rename origin upstream
```

```bash
gh repo create <nome> --private --source . --remote origin --push
```

**Pronto quando** `git remote -v` mostra o `origin` no GitHub do usuário e o `main` foi enviado.

## 3. Ligar o repositório à Cloudflare

Este passo é no painel da Cloudflare, no navegador do usuário: o Wrangler não liga repositório. Passe estes campos
exatos e espere ele confirmar:

1. https://dash.cloudflare.com › Workers & Pages › **Create** › **Import a repository** › **Continue with GitHub**.
   Na primeira vez, o GitHub pede para instalar o app da Cloudflare: dê acesso ao repositório do passo 2.
2. Escolha o repositório.
3. Preencha:
   - **Project name:** `crm-simples` (tem que ser igual ao `name` do `wrangler.jsonc`)
   - **Build command:** `pnpm run build`
   - **Deploy command:** `pnpm run deploy:cloudflare`
4. **Deploy**.

O primeiro build leva de 1 a 3 minutos e cria banco, mídia e filas. A conta precisa do plano **Workers Paid** (filas e
Durable Objects); se o build falhar por plano, mande o usuário para Workers & Pages › Plans. Se falhar por outro
motivo, peça o trecho do log do build e resolva antes de seguir.

**Pronto quando** o build aparece como concluído e o usuário te passa o endereço do Worker
(`https://crm-simples.<subdominio>.workers.dev`).

## 4. Entrar na Cloudflare pelo terminal

Os segredos e o admin são gravados pelo Wrangler.

```bash
pnpm exec wrangler whoami
```

Sem login, peça `! pnpm exec wrangler login`. Com mais de uma conta, pergunte qual é a do passo 3 e use
`CLOUDFLARE_ACCOUNT_ID=<id>` na frente dos comandos `wrangler` daqui em diante.

**Pronto quando** o `whoami` mostra a conta onde o build rodou.

## 5. Gravar os segredos

Gere e grave direto, sem mostrar o valor:

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET --name crm-simples
```

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put WEBHOOK_URL_SECRET --name crm-simples
```

Avise: o `BETTER_AUTH_SECRET` protege o login e cifra os tokens da Uazapi; trocar depois desloga todo mundo e obriga a
informar a Uazapi de novo.

**Pronto quando** `pnpm exec wrangler secret list --name crm-simples` mostra os dois nomes.

## 6. Criar o admin

A senha é do usuário: ele mesmo roda o comando, para a senha não passar pela conversa. Pergunte o e-mail e o nome e
entregue o comando pronto para ele rodar com `!` (senha de 12 caracteres ou mais):

```bash
! pnpm bootstrap:admin --remote --email <email> --name "<nome>" --password '<senha>'
```

**Pronto quando** a saída termina com "Admin <email> criado (remoto)".

## 7. Conferir no ar e entregar

```bash
curl -s <endereço>/api/health
```

Deve responder `{"ok":true}`. Entregue ao usuário:

- o endereço do CRM e o próximo passo no site (README, seção "Depois de instalar"): entrar, conectar o WhatsApp em
  Configurações › Conexão do número com o endereço e o Admin Token da Uazapi, escolher a instância e ler o QR code;
- como atualizar: cada push no `main` do repositório dele publica sozinho; para trazer novidades do projeto original,
  `git pull upstream main` e `git push`.

**Pronto quando** o usuário tem o endereço, entrou com o admin e sabe como atualizar.
