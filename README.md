# CRM Simples

CRM de atendimento pelo WhatsApp, com a cara do WhatsApp Web. A equipe inteira atende o mesmo número: as conversas
chegam numa caixa de entrada compartilhada, cada uma tem um responsável e um status, e nada se perde.

**No ar:** https://crm-simples.thales2581.workers.dev

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

## Primeiros passos (no site no ar)

1. **Entre** com o seu admin.
2. **Conecte o WhatsApp:** Configurações › Conexão do número.
   - Informe o **endereço do servidor da Uazapi** e o **Admin Token** (o `admintoken` do servidor, não o token de uma
     instância).
   - Escolha a instância que o CRM vai usar ("Usar esta") ou crie uma nova pelo nome.
   - Clique em **Conectar número** e leia o QR code no celular (WhatsApp › Aparelhos conectados).
3. **Dê nome à empresa:** Configurações › Empresa. O nome aparece no topo da lista, no login e na aba do navegador.
4. **Monte a casa:** etiquetas, respostas rápidas e funis, em Configurações.
5. **Chame a equipe:** Configurações › Equipe › Gerar link de convite. Mande o link para a pessoa; ela cria a própria
   senha.

Esqueceu a senha? O admin gera um "Link de nova senha" em Configurações › Equipe. O CRM não manda e-mail.

---

## Rodar no seu computador

Precisa de Node 22+ e pnpm 11.

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm bootstrap:admin --local --email voce@exemplo.com --name "Seu Nome" --password 'uma-senha-forte'
pnpm dev
```

Abra http://localhost:5173. O `.dev.vars` fica fora do git.

Para testar com clientes falsos, sem WhatsApp de verdade, existe um ambiente de teste em `.wrangler/demo/` (CRM na
porta 5190 e uma Uazapi falsa na 4020). Os comandos para simular cliente e queda do número estão em
[`.scratch/design-whatsapp/jornada-de-teste.md`](.scratch/design-whatsapp/jornada-de-teste.md).

## Testes

```bash
pnpm check       # tipos + regras dos testes + testes de borda (roda sozinho antes de cada commit)
pnpm test:e2e    # navegador de verdade (Playwright), no computador e no celular
```

Na primeira vez com o Playwright: `pnpm exec playwright install chromium`. Detalhes e pegadinhas em
[`docs/agents/testing.md`](docs/agents/testing.md).

## Publicar

**Cada push no `main` publica sozinho.** A Cloudflare (Workers Builds) baixa o código do GitHub, roda `pnpm build`,
aplica as migrações do banco e publica o Worker. O andamento aparece no painel da Cloudflare, em Workers › crm-simples ›
Deployments.

O que existe na conta Cloudflare "Thales Laray" (já apontado em [`wrangler.jsonc`](wrangler.jsonc)):

| Recurso | Nome | Para quê |
| --- | --- | --- |
| Worker | `crm-simples` | API e site, no mesmo endereço |
| Banco D1 | `crm-simples` | Conversas, contatos, equipe, configurações |
| Bucket R2 | `crm-simples-media` | Fotos, vídeos e áudios (apagados depois de 365 dias) |
| Filas | `crm-simples-media`, `crm-simples-media-dlq` | Baixar a mídia que chega, com nova tentativa |

**Segredos** (gravados na Cloudflare, nunca no repositório):

- `BETTER_AUTH_SECRET`: protege o login e a cifra dos tokens da Uazapi. **Não troque:** trocar desloga todo mundo e
  obriga a informar a Uazapi de novo.
- `WEBHOOK_URL_SECRET`: entra no endereço do webhook que o CRM cadastra na Uazapi.

Para trocar um segredo: `pnpm exec wrangler secret put <NOME> --name crm-simples`.

**Criar um admin no site no ar** (pede `pnpm exec wrangler login` na primeira vez):

```bash
pnpm bootstrap:admin --remote --email voce@exemplo.com --name "Seu Nome" --password 'uma-senha-forte'
```

---

## Como funciona por dentro

- **Um Worker da Cloudflare** (Hono) responde a API em `/api/*` e entrega o site (React + Vite) no mesmo endereço.
- **Banco:** D1 com Drizzle. Mudou `src/worker/db/schema.ts`? Rode `pnpm db:generate` para criar a migração em
  `migrations/`.
- **Tempo real:** um Durable Object (`InboxHub`) avisa as telas abertas por WebSocket.
- **Mídia:** a fila baixa os arquivos da Uazapi e guarda no R2.
- **Rotina a cada 5 minutos:** confere a conexão do número e busca mensagens que possam ter escapado.
- **Login:** Better Auth, com e-mail e senha. Não existe cadastro aberto: usuário só nasce pelo comando de admin ou por
  convite.

| Pasta | O que tem |
| --- | --- |
| `src/worker/` | API, webhook da Uazapi, fila, rotina, login |
| `src/worker/uazapi/` | Cliente da Uazapi e os dados de conexão salvos pela tela |
| `src/web/` | Site (React): páginas em `pages/`, componentes em `components/` |
| `migrations/` | Migrações do banco |
| `test/` | Testes de borda, com uma Uazapi falsa |
| `e2e/` | Testes no navegador |
| `.scratch/` | Specs e tickets de cada fase do projeto |

### Segurança

- Toda rota que muda algo confere a sessão no banco, então rebaixar ou remover alguém vale na hora. Telas só de
  leitura aceitam a sessão em cache por até 60 segundos.
- Admin token e token da instância da Uazapi ficam cifrados no banco (AES-GCM) e nunca voltam ao navegador. A tela
  mostra só os 4 últimos caracteres.
- O webhook só aceita chamadas com o segredo no endereço e o token da instância em uso.

### Uazapi: de onde vêm os dados

O CRM usa, nesta ordem:

1. a instância escolhida em Configurações › Conexão do número;
2. o token de instância salvo pela versão anterior dessa tela;
3. os segredos opcionais `UAZAPI_BASE_URL` e `UAZAPI_INSTANCE_TOKEN`, usados pelos testes.

`DELETE /api/admin/uazapi` (só admin) apaga o que foi salvo pela tela.

## Para quem vai mexer no código

- [`AGENTS.md`](AGENTS.md): como o projeto organiza tickets, testes e revisão.
- [`CODING_STANDARDS.md`](CODING_STANDARDS.md): padrões de código e de testes.
- [`.scratch/crm-whatsapp-v1/spec.md`](.scratch/crm-whatsapp-v1/spec.md): regras de negócio da v1.
- [`.scratch/design-whatsapp/spec.md`](.scratch/design-whatsapp/spec.md): o visual estilo WhatsApp.
- O tipo `Env` é escrito à mão em `src/worker/env.d.ts`: atualize ao criar binding ou segredo.
