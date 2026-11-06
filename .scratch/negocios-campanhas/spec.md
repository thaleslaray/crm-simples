# Spec: negócios, produtos e campanhas

## Problem Statement

O dono vende vários produtos pelo WhatsApp com várias campanhas pagas ao mesmo tempo e não sabe qual campanha vende nem quanto cada uma faturou. Hoje o cartão do funil **é o contato** (um por funil, sem produto, valor nem origem), então a mesma pessoa não pode estar em dois negócios e nada liga a venda à campanha.

## Solution

Separar a **pessoa** (contato, como hoje) do **negócio** (um interesse num produto). O negócio tem produto, valor, etapa, origem e situação (aberto, ganho, perdido) e passa a ser o cartão do funil. O admin cadastra **produtos** e **campanhas**; cada campanha gera um código e um link de WhatsApp com o código na mensagem. Quando o cliente manda o código, o CRM cria o negócio sozinho, já com produto e campanha. Um **relatório** mostra, por campanha, quantos negócios nasceram, fecharam e quanto faturaram.

Base da decisão: pesquisa de 265 fontes (manuais de 10 CRMs, especialistas, abandono de CRM) em `/Users/thaleslaray/pesquisas/pesquisa-crm-simples-produtos-campanhas-decisao-2026-11-06.md`. Meta: o mais simples que funciona.

## User Stories

### Produtos
1. Como admin, quero cadastrar produtos com nome e preço, para que o negócio já nasça com o valor certo.
2. Como admin, quero arquivar um produto sem perder os negócios antigos dele.

### Negócio
3. Como atendente, quero que cada cartão do funil seja um negócio (cliente + produto + valor), para que a mesma pessoa possa estar em mais de um negócio.
4. Como atendente, quero criar um negócio com 1 clique ("+ Negócio") no quadro e na conversa, escolhendo produto e origem, ambos opcionais.
5. Como atendente, quero que o valor venha preenchido com o preço do produto e que eu possa mudar quando quiser.
6. Como atendente, quero escolher a origem de um negócio manual numa lista (campanhas cadastradas + Indicação, Orgânico, Cliente antigo, Outro) ou deixar em branco.
7. Como atendente, quero ver no cartão o produto e o valor, e filtrar o quadro por produto.
8. Como atendente, quero que o responsável do negócio seja quem atende a conversa do cliente, sem campo à parte.

### Fechar
9. Como atendente, quero botões **Ganhou** e **Perdeu** no cartão e na conversa.
10. Como atendente, ao clicar Ganhou quero confirmar o valor; ao clicar Perdeu quero escolher o motivo (Preço, Sem resposta, Comprou de outro, Sem interesse agora, Sem perfil, Outro) com observação opcional.
11. Como atendente, quero que o negócio fechado saia do quadro e que eu possa ver os fechados por um filtro.
12. Como admin, quero reabrir um negócio fechado por engano.

### Na conversa
13. Como atendente, quero uma faixa discreta abaixo do cabeçalho da conversa com o negócio aberto ("Curso · R$ 997 · Qualificação") e os botões Ganhou/Perdeu; sem negócio aberto, "+ Negócio".
14. Como atendente, quero que a ficha do contato liste todos os negócios dele, abertos e fechados.

### Campanhas
15. Como admin, quero criar uma campanha com nome, produto e canal (Meta, Google, Instagram, TikTok, Outro).
16. Como admin, quero que o CRM gere o código (ex.: `CUR-M01`) e o link do WhatsApp com uma mensagem editável que termina no código, com botões de copiar link e ver QR code.
17. Como admin, quero arquivar uma campanha sem perder o histórico.

### Automático
18. Como dono, quero que uma mensagem do cliente com código de campanha crie o negócio sozinho, no funil principal, na 1ª etapa, com produto, valor e campanha.
19. Como dono, quero que, se o cliente já tem negócio **aberto do mesmo produto**, o CRM não crie outro e só registre na conversa "voltou pela campanha X"; se for outro produto, ou o anterior já estiver fechado, crie um negócio novo.
20. Como atendente, quero que mensagens sem código não criem negócio.

### Relatório
21. Como admin, quero escolher o período (este mês, mês passado, personalizado) e ver uma linha por campanha com negócios criados, ganhos, perdidos, faturado e conversão, mais o total, uma linha "Sem origem" e filtro por produto.

## Implementation Decisions

### Dados
- **`product`**: id, name, priceCents (int), archivedAt, createdAt. Nome único sem diferenciar maiúsculas.
- **`campaign`**: id, name, productId (FK product), channel (`meta|google|instagram|tiktok|outro`), code (único), message (texto pré-preenchido), archivedAt, createdAt.
- **`deal`** substitui `funnel_card`: id, contactId (FK, cascade), funnelId, stageId (FK, cascade), position, productId (null, FK set null), valueCents (null), status (`aberto|ganho|perdido`), lostReason (`preco|sem_resposta|comprou_de_outro|sem_interesse|sem_perfil|outro`, null), lostNote (null), originCampaignId (null, FK set null), originKind (`campanha|indicacao|organico|cliente_antigo|outro`, null = sem origem), sourceMessageId (null, único — idempotência da criação automática), createdAt, closedAt, closedById.
- **Migração:** `funnel_card` é apagada (decisão: começar do zero). Funis e etapas ficam.
- Primeira origem do contato = origem do negócio mais antigo dele (derivada; sem coluna).
- Dinheiro sempre em centavos; exibição `R$ 1.234,56`.

### Regras
- **Funil principal** = o primeiro funil (ordem de criação). Sem funil com etapa, a criação automática não acontece e a tela de Campanhas avisa "Crie um funil antes".
- **Código:** 3 letras do produto (maiúsculas, sem acento) + `-` + letra do canal (`M G I T O`) + 2 dígitos sequenciais, único. Detecção: `#` seguido do código, em qualquer mensagem recebida (texto ou legenda), sem diferenciar maiúsculas; só campanhas não arquivadas.
- **Criação automática** roda no ingest depois da mensagem inserida com sucesso e é idempotente por `sourceMessageId` (reconcile reprocessa mensagens).
- **Retorno:** negócio aberto do mesmo produto → não cria, grava um evento na conversa "voltou pela campanha X"; senão → cria.
- **Fechar:** Ganhou exige valor (pré-preenchido); Perdeu exige motivo. Fechado sai do quadro; filtro "Abertos / Ganhos / Perdidos". Reabrir: só admin, volta à etapa em que estava.
- **Permissões:** produtos, campanhas e relatório só admin (relê papel no D1, como as outras rotas de admin). Negócios: qualquer membro.
- **Tempo real:** mudanças de negócio publicam o evento de funil existente (`funnel.changed`) e um evento para a conversa do contato atualizar a faixa.

### Telas
- Configurações ganha **Produtos** e **Campanhas** (padrão das telas de Etiquetas/Respostas rápidas).
- Quadro do funil: cartão mostra produto e valor; filtros por produto e situação; "+ Negócio" no lugar de "Adicionar contato".
- Conversa: faixa do negócio abaixo do `ChatHeader`.
- Ficha: bloco "Negócios" no lugar do bloco "Funis".
- Relatório: nova tela (admin), entrada em Configurações ou na barra de ícones.

## Testing Decisions
- Testes de borda do Worker para cada rota nova (produtos, campanhas, negócios, relatório), incluindo 403 para atendente nas rotas de admin.
- Ingest: mensagem com código cria negócio; a mesma mensagem reprocessada não duplica; retorno com negócio aberto do mesmo produto não cria; produto diferente cria; campanha arquivada é ignorada; sem funil não cria.
- E2E: criar produto e campanha, copiar link; simular mensagem com código pela Uazapi falsa e ver o cartão nascer; Ganhou/Perdeu; relatório com números.
- Cada ticket com TDD (red → green).

## Out of Scope
Vários números; funil por produto; gasto e retorno por campanha; devolver vendas à Meta/Google; próxima data no negócio; motivos de perda editáveis; vários produtos por negócio; UTM; pontuação de lead.

## Further Notes
- Decisões tomadas em entrevista em 2026-11-06.
- A branch `claude/funil-visual-14a259` (polimento visual do funil e do app) mexe em `FunnelsPage.tsx` e deve entrar no `main` antes destes tickets para evitar conflito.
