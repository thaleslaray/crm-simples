# CRM Simples

CRM de atendimento pelo WhatsApp, com a cara do WhatsApp Web. A equipe inteira atende o mesmo número: as conversas
chegam numa caixa de entrada compartilhada, cada uma tem um responsável e um status, e nada se perde.

Roda inteiro na **sua** conta da Cloudflare e conversa com o WhatsApp pela [Uazapi](https://uazapi.com). Este guia
leva você do clone ao CRM no ar, com o seu número conectado.

---

## O que ele faz

- **Caixa de entrada compartilhada.** Toda mensagem que chega no número vira uma conversa, visível para a equipe em
  tempo real. Filtros rápidos: Tudo, Minhas, Sem dono, Não lidas.
- **Responsável e status.** O atendente assume a conversa ou o admin atribui. Status: aberta, em andamento,
  aguardando cliente, resolvida. Quando o cliente volta a escrever, a conversa reabre sozinha.
- **Responder como no WhatsApp.** Texto, foto, vídeo, documento, nota de voz, citação de mensagem e respostas rápidas
  (digite `/`). No computador, Enter envia e Shift+Enter quebra a linha.
- **Notas internas.** O cadeado no campo de mensagem vira o modo nota: só a equipe vê, o cliente nunca recebe.
- **Ficha do contato.** Dados, etiquetas, funis e notas de cada cliente.
- **Funis (kanban).** Arraste os contatos entre as etapas.
- **Equipe.** Convite por link, papéis de admin e atendente.
- **Tema claro e escuro**, no computador e no celular.

## O que você precisa

- Uma conta na **Cloudflare** com o plano **Workers Paid** (US$ 5/mês), por causa das filas e dos Durable Objects.
- Um servidor da **Uazapi** e o **Admin Token** dele (o `admintoken`, que lista e cria instâncias).
- Uma conta no **GitHub**, onde fica o seu repositório do CRM.
- **Node 22** ou mais novo e o **pnpm** (`corepack enable` instala a versão certa).
- **Git** e o **GitHub CLI** (`gh`).

---

## Instalar na sua Cloudflare

A instalação deixa você com um repositório **seu** no GitHub ligado à **sua** conta da Cloudflare: cada push no `main`
publica o CRM sozinho.

### Jeito mais fácil: pelo botão

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/thaleslaray/crm-simples)

Sem terminal. Clique no botão e siga:

1. **Entre na Cloudflare.** Se você tem mais de uma conta, escolha em qual instalar.
2. **Conecte o seu GitHub.** Na primeira vez aparece "Connect a Git account to continue". Clique em
   **New GitHub connection**: abre uma página do GitHub, clique no botão verde (**Install** ou **Authorize**). Se ela
   perguntar quais repositórios, escolha **All repositories** (o botão precisa disso para criar o repositório novo).
   Volte para a tela da Cloudflare: o seu usuário do GitHub aparece em "Git account".
3. **Confira o nome.** "Project name" vira o nome do repositório no seu GitHub e do CRM na Cloudflare. Troque se já
   tiver um repositório com esse nome.
4. **Digite o código de instalação** no campo `SETUP_CODE`: uma frase só sua, que você usa uma vez para criar o
   administrador. Os segredos do login e do webhook o próprio CRM gera sozinho (veja "Segredos gerados pelo CRM",
   abaixo). O resto da tela (banco, mídia, fila e comandos) já vem preenchido: não mexa.
5. Clique em **Deploy**. O primeiro build leva de 1 a 3 minutos.
6. Abra o endereço que a Cloudflare mostra (`https://<nome>.<subdominio>.workers.dev`). O CRM abre na tela de
   **Primeiro acesso**: digite o código de instalação, o seu nome, e-mail e uma senha de 12 caracteres ou mais. Você
   já entra na caixa de entrada.

Depois do primeiro admin a tela fecha para sempre; o `SETUP_CODE` só vale enquanto não existe nenhum usuário. Cada push
no repositório criado publica o CRM de novo.

### Jeito fácil: com o Claude Code

```bash
git clone https://github.com/thaleslaray/crm-simples.git
```

```bash
cd crm-simples && claude
```

Dentro do Claude Code, digite:

```text
/instalar
```

Ele cria o seu repositório no GitHub, te guia no único passo que é no painel da Cloudflare, grava os segredos e te
entrega o comando para criar o seu admin. No fim, mostra o endereço do seu CRM.

### Jeito manual

Precisa também do [GitHub CLI](https://cli.github.com) (`gh`). Os comandos rodam na pasta do projeto, um bloco por vez.

**1. Baixar o projeto**

```bash
git clone https://github.com/thaleslaray/crm-simples.git
```

```bash
cd crm-simples && pnpm install
```

**2. Criar o seu repositório no GitHub**

O repositório original vira `upstream` (de onde você puxa atualizações) e o seu vira `origin`. Troque `meu-crm` pelo
nome que quiser.

```bash
git remote rename origin upstream
```

```bash
gh repo create meu-crm --private --source . --remote origin --push
```

**3. Ligar o repositório à Cloudflare**

No painel da Cloudflare: Workers & Pages › **Create** › **Import a repository** › **Continue with GitHub**. Na primeira
vez, o GitHub pede para instalar o app da Cloudflare: dê acesso ao repositório do passo 2. Escolha o repositório e
preencha:

- **Project name:** `crm-simples` (tem que ser igual ao `name` do `wrangler.jsonc`)
- **Build command:** `pnpm run build`
- **Deploy command:** `pnpm run deploy`

Clique em **Deploy**. O primeiro build cria sozinho o banco (D1), o armazenamento de mídia (R2) e as filas, com os
nomes do `wrangler.jsonc`, e mostra o endereço do seu CRM, algo como `https://crm-simples.SEU-SUBDOMINIO.workers.dev`.

**4. Gravar os segredos**

Entre na Cloudflare pelo terminal (abre o navegador para autorizar):

```bash
pnpm exec wrangler login
```

Se for criar o admin pela tela de primeiro acesso (passo 5), grave o código de instalação (o comando pergunta o valor;
escolha uma frase só sua):

```bash
pnpm exec wrangler secret put SETUP_CODE --name crm-simples
```

Os segredos do login e do webhook não precisam de comando: o CRM gera sozinho (veja "Segredos gerados pelo CRM").

**5. Criar o seu usuário admin**

Não existe cadastro aberto. Com o `SETUP_CODE` do passo 4, abra o endereço do passo 3: o CRM mostra a tela de
**Primeiro acesso** e você cria o admin ali. Sem `SETUP_CODE`, ou se preferir o terminal, o primeiro admin nasce por
este comando (troque o e-mail, o nome e a senha, de no mínimo 12 caracteres):

```bash
pnpm bootstrap:admin --remote --email voce@empresa.com --name "Seu Nome" --password 'uma-senha-forte-de-verdade'
```

Pronto: abra o endereço do passo 3 e entre.

Se o `SETUP_CODE` ficou gravado e você já criou o admin, ele não faz mais nada (a tela só abre sem usuários).

Opcional: apagar fotos, vídeos e áudios com mais de 1 ano (a conversa passa a mostrar "mídia expirada").

```bash
pnpm exec wrangler r2 bucket lifecycle add crm-simples-media expire-365d --expire-days 365
```

---

## Depois de instalar

1. **Conecte o WhatsApp:** Configurações › Conexão do número.
   - Informe o **endereço do servidor da Uazapi** (ex.: `https://seu-subdominio.uazapi.com`) e o **Admin Token**.
     O CRM confere com a Uazapi antes de salvar.
   - Aparecem as instâncias do seu servidor. Clique em **"Usar esta"** na que o CRM vai usar, ou crie uma nova pelo
     nome.
   - Clique em **Conectar número** e leia o QR code no celular (WhatsApp › Aparelhos conectados). O webhook é
     cadastrado sozinho.
2. **Dê nome à empresa:** Configurações › Empresa. O nome aparece no topo da lista, no login e na aba do navegador.
3. **Monte a casa:** etiquetas, respostas rápidas e funis, em Configurações.
4. **Chame a equipe:** Configurações › Equipe › Gerar link de convite. Mande o link para a pessoa; ela cria a própria
   senha. Esqueceu a senha? Na mesma tela, "Link de nova senha". O CRM não manda e-mail.

## Atualizar

Cada push no `main` do seu repositório publica sozinho e aplica as migrações novas do banco. Para trazer as novidades
do projeto original:

```bash
git pull upstream main
```

```bash
git push
```

---

## Rodar no seu computador

```bash
cp .dev.vars.example .dev.vars
```

```bash
pnpm db:migrate:local
```

```bash
pnpm bootstrap:admin --local --email voce@exemplo.com --name "Seu Nome" --password 'uma-senha-forte-de-verdade'
```

```bash
pnpm dev
```

Abra http://localhost:5173. O `.dev.vars` fica fora do git.

## Testes

```bash
pnpm check
```

Tipos, regras dos testes e testes de borda (roda sozinho antes de cada commit).

```bash
pnpm test:e2e
```

Navegador de verdade (Playwright), no computador e no celular, com uma Uazapi falsa. Na primeira vez:
`pnpm exec playwright install chromium`. Detalhes em [`docs/agents/testing.md`](docs/agents/testing.md).

---

## Como funciona por dentro

| Peça da Cloudflare | Para quê |
| --- | --- |
| Worker | API em `/api/*` e o site (React + Vite), no mesmo endereço |
| D1 | Conversas, contatos, equipe e configurações |
| R2 | Fotos, vídeos e áudios das conversas |
| Filas | Baixar a mídia que chega, com nova tentativa |
| Durable Object | Avisar as telas abertas em tempo real (WebSocket) |
| Cron (a cada 5 min) | Conferir a conexão do número e buscar mensagens que escaparam |

- **Login:** Better Auth, com e-mail e senha. Usuário só nasce pelo comando de admin ou por convite.
- **Banco:** Drizzle. Mudou `src/worker/db/schema.ts`? `pnpm db:generate` cria a migração em `migrations/`.

| Pasta | O que tem |
| --- | --- |
| `src/worker/` | API, webhook da Uazapi, fila, rotina, login |
| `src/worker/uazapi/` | Cliente da Uazapi e os dados de conexão salvos pela tela |
| `src/web/` | Site: páginas em `pages/`, componentes em `components/` |
| `migrations/` | Migrações do banco |
| `test/` | Testes de borda, com uma Uazapi falsa |
| `e2e/` | Testes no navegador |
| `.scratch/` | Specs e tickets de cada fase do projeto |

### Segurança

- Toda rota que muda algo confere a sessão no banco: rebaixar ou remover alguém vale na hora. Telas só de leitura
  aceitam a sessão em cache por até 60 segundos.
- O Admin Token e o token da instância da Uazapi ficam cifrados no banco (AES-GCM) e nunca voltam ao navegador; a
  tela mostra só os 4 últimos caracteres.
- O webhook só aceita chamadas com o segredo no endereço e o token da instância em uso.
- Os segredos ficam na Cloudflare ou no banco do CRM, nunca no repositório.

### Segredos gerados pelo CRM

O CRM precisa de dois segredos: `BETTER_AUTH_SECRET` (protege o login e cifra os tokens da Uazapi) e
`WEBHOOK_URL_SECRET` (entra no endereço do webhook cadastrado na Uazapi). Você não precisa criá-los: na primeira vez
que precisa, o CRM gera os dois (32 bytes aleatórios cada) e guarda na tabela `instance_secret` do banco D1.

- Se existir segredo da Cloudflare com o mesmo nome (`wrangler secret put BETTER_AUTH_SECRET` ou
  `WEBHOOK_URL_SECRET`), ele vence e o banco nem é consultado para aquele valor. Quem já tinha os dois como segredos
  não muda nada.
- **Segurança:** quando gerados, os dois moram no mesmo banco dos dados. Quem quiser separá-los grava os dois como
  segredos da Cloudflare, que vencem o banco.
- **Se alguém apagar a tabela `instance_secret`**, o CRM gera valores novos: as sessões caem (todo mundo entra de
  novo), os tokens da Uazapi guardados deixam de abrir e precisam ser informados outra vez na tela de Conexão, e o
  endereço do webhook muda, então a Uazapi precisa ser informada de novo (Conectar) e o número reconectado.

### Uazapi: de onde vêm os dados

O CRM usa, nesta ordem: a instância escolhida em Configurações › Conexão do número; o token de instância salvo pela
versão anterior dessa tela; e os segredos opcionais `UAZAPI_BASE_URL` e `UAZAPI_INSTANCE_TOKEN` (usados pelos
testes). `DELETE /api/admin/uazapi` (só admin) apaga o que foi salvo pela tela.

## Para quem vai mexer no código

- [`AGENTS.md`](AGENTS.md): como o projeto organiza tickets, testes e revisão.
- [`CODING_STANDARDS.md`](CODING_STANDARDS.md): padrões de código e de testes.
- [`.scratch/crm-whatsapp-v1/spec.md`](.scratch/crm-whatsapp-v1/spec.md): regras de negócio da v1.
- [`.scratch/design-whatsapp/spec.md`](.scratch/design-whatsapp/spec.md): o visual estilo WhatsApp.
- O tipo `Env` é escrito à mão em `src/worker/env.d.ts`: atualize ao criar binding ou segredo.
