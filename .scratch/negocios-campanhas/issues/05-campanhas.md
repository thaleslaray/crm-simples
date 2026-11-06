# 05: Campanhas e link do WhatsApp

**What to build:** tela Campanhas em Configurações (só admin): nome, produto e canal (Meta, Google, Instagram, TikTok, Outro). O CRM gera o código (3 letras do produto + `-` + letra do canal + 2 dígitos, único) e a mensagem padrão "Oi! Quero saber do <produto> #<código>", editável. Mostra o link `https://wa.me/<número>?text=<mensagem>` com copiar e QR code. Arquivar. Aviso "Crie um funil antes" se não houver funil com etapa. Spec: histórias 15–17.

**Blocked by:** 01

**Status:** done

- [x] Migração `campaign`
- [x] Gerador de código (testes de colisão e acentos)
- [x] Número do link: descobrir de onde vem o número conectado (status da instância Uazapi); se não houver, mostrar o aviso de conectar o número
- [x] QR code gerado no navegador, sem serviço externo
- [x] Testes de borda + E2E (criar campanha, copiar link)

## Comments

### 2026-11-06
Feito. Migração `0022_campanhas`: cria `campaign` e acrescenta `connection_state.phone`.

Decisões para os tickets 06–07:
- **Sem FK em `deal.originCampaignId`**: no SQLite/D1 acrescentar FK exige recriar a tabela `deal` (com negócios, índices e FKs dela), risco alto para pouco ganho. Campanhas nunca são apagadas (só arquivadas), então a FK não protege nada; a rota valida a campanha e o `LEFT JOIN` traz o nome (inclusive de arquivada).
- Rotas em `src/worker/campaigns.ts`: `GET /api/campaigns` (qualquer membro; só ativas, `?todos=1` inclui arquivadas) devolve `{campaigns, whatsappNumber, hasFunnel}`; cada campanha traz `id, name, productId, productName, channel, code, message, archivedAt, link` (`link` null sem número). `POST` (admin) `{name 1–80, productId ativo, channel, message?}` → 201; 404 produto inexistente/arquivado; 400 inválido ou mensagem sem `#<código>`; 409 `codigos_esgotados` (passou de 99). `PATCH /:id` (admin) `{name?, message?, archived?}`; produto e canal não mudam (o código depende deles). Publica `campaigns.changed`.
- Código: `src/worker/campaign-code.ts` (`codePrefix`, `nextCode`): 3 letras A–Z do produto sem acento (completa com X) + `-` + M/G/I/T/O + 2 dígitos = maior número já usado no prefixo + 1 (conta arquivadas; nunca reaproveita). Índice único `campaign_code_idx`; o POST tenta de novo se dois admins colidirem.
- **Ticket 06 (ingest)**: detectar `#<código>` sem diferenciar maiúsculas; a validação de mensagem usa a mesma regra (`#` + código). Procure só campanhas com `archivedAt` nulo. Ao criar o negócio automático, grave `originKind: "campanha"` + `originCampaignId`; `productId` da campanha dá produto e preço. "Funil principal com etapa" = a tela já avisa com `hasFunnel`.
- **Número do link**: vem de `instance.owner` do `GET /instance/status` da Uazapi (já era chamado). `getInstanceStatus()` agora devolve `owner`; `refreshConnection` guarda só os dígitos em `connection_state.phone` (resposta sem dono não apaga). `GET /api/campaigns` sem número guardado pergunta à instância uma vez. Formato do `owner` não validado com a Uazapi real (aceita `5511...`, `+55 (11)...` e `...@s.whatsapp.net`; ignora com menos de 8 dígitos). Sem número: tela mostra "Conecte o número do WhatsApp para gerar o link." e não mostra link.
- Origem manual do negócio: `originKind: "campanha"` + `originCampaignId` de campanha ativa (400 se faltar, não existir ou estiver arquivada; id com outra origem também é 400). Trocar para outra origem limpa o vínculo. Reenviar a mesma campanha já arquivada num negócio que já a tem é aceito. `CardView` ganhou `originCampaignId` e `originCampaignName`; `ContactDealView` ganhou `originCampaignName`. Front: `DealFields` lista campanhas ativas (valor `campanha:<id>`), cartão e ficha mostram "Campanha: <nome>".
- **QR code**: dependência nova `uqr` (zero dependências, uns 4 KB, só gera o SVG; nada sai para serviço externo). O QR é um `<img>` com data URL do SVG.
- Tela `src/web/pages/CampaignsPage.tsx` (Configurações, só admin, rota `/campanhas`): copiar link, ver QR, editar mensagem, arquivar, avisos "Crie um funil antes" e de número. Testes: `test/campanhas-codigo.test.ts` (5), `test/campanhas.test.ts` (18), E2E `e2e/campanhas.spec.ts`; a Uazapi falsa do E2E agora informa `owner`.
