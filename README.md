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
- **Node 22** ou mais novo e o **pnpm** (`corepack enable` instala a versão certa).
- **Git**.

---

## Instalar na sua Cloudflare

Os comandos abaixo rodam na pasta do projeto. Cada bloco é um passo.

### 1. Baixar o projeto

```bash
git clone https://github.com/thaleslaray/crm-simples.git
```

```bash
cd crm-simples && pnpm install
```

### 2. Entrar na Cloudflare

```bash
pnpm exec wrangler login
```

Abre o navegador para você autorizar. Se você tem mais de uma conta, o Wrangler pergunta qual usar nos próximos passos.

### 3. Criar o banco, o armazenamento de mídia e as filas

```bash
pnpm exec wrangler d1 create crm-simples
```

Esse comando mostra um `database_id`. Guarde: ele vai no passo 4.

```bash
pnpm exec wrangler r2 bucket create crm-simples-media
```

```bash
pnpm exec wrangler queues create crm-simples-media
```

```bash
pnpm exec wrangler queues create crm-simples-media-dlq
```

Opcional: apagar fotos, vídeos e áudios com mais de 1 ano (a conversa passa a mostrar "mídia expirada").

```bash
pnpm exec wrangler r2 bucket lifecycle add crm-simples-media expire-365d --expire-days 365
```

### 4. Apontar o projeto para a sua conta

Abra o arquivo `wrangler.jsonc` e troque duas coisas:

- **`account_id`**: apague essa linha, ou ponha o ID da sua conta (aparece no painel da Cloudflare, na barra lateral
  de Workers & Pages).
- **`database_id`**: ponha o ID que o passo 3 mostrou.

Os nomes (`crm-simples`, `crm-simples-media` e as filas) já batem com os que você criou. Se escolheu outros nomes,
troque também no `wrangler.jsonc`.

### 5. Publicar

```bash
pnpm build
```

```bash
pnpm exec wrangler d1 migrations apply DB --remote
```

```bash
pnpm exec wrangler deploy
```

No fim, o Wrangler mostra o endereço do seu CRM, algo como `https://crm-simples.SEU-SUBDOMINIO.workers.dev`.

### 6. Gravar os dois segredos

São valores aleatórios que só o seu CRM conhece. Os comandos geram e gravam direto, sem mostrar na tela.

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put WEBHOOK_URL_SECRET
```

- `BETTER_AUTH_SECRET` protege o login e cifra os tokens da Uazapi no banco. **Não troque depois:** trocar desloga
  todo mundo e obriga a informar a Uazapi de novo.
- `WEBHOOK_URL_SECRET` entra no endereço que o CRM cadastra na Uazapi para receber as mensagens.

### 7. Criar o seu usuário admin

Não existe tela de cadastro aberta: o primeiro admin nasce por este comando. Troque o e-mail, o nome e a senha.

```bash
pnpm bootstrap:admin --remote --email voce@empresa.com --name "Seu Nome" --password 'uma-senha-forte'
```

Pronto: abra o endereço do passo 5 e entre.

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

## Atualizar sozinho a cada push (opcional)

Se o seu código está num repositório seu no GitHub, a Cloudflare pode publicar a cada push no `main`:

1. No painel: Workers & Pages › **Create** › **Import a repository** (Continue with GitHub) e escolha o repositório.
2. Preencha:
   - **Project name:** `crm-simples` (o mesmo `name` do `wrangler.jsonc`)
   - **Build command:** `pnpm run build`
   - **Deploy command:** `pnpm exec wrangler d1 migrations apply DB --remote && pnpm exec wrangler deploy`
3. Clique em **Deploy**. Daí em diante, cada push no `main` publica sozinho e aplica as migrações novas do banco.

Os segredos do passo 6 continuam valendo; não precisa gravar de novo.

## Atualizar à mão

Puxou uma versão nova do código? Repita o passo 5 (build, migrações e deploy).

---

## Rodar no seu computador

```bash
cp .dev.vars.example .dev.vars
```

```bash
pnpm db:migrate:local
```

```bash
pnpm bootstrap:admin --local --email voce@exemplo.com --name "Seu Nome" --password 'uma-senha-forte'
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
- Os segredos ficam na Cloudflare, nunca no repositório.

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
