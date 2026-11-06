# 02: Negócio vira o cartão do funil

**What to build:** tabela `deal` substitui `funnel_card` (apagada: começar do zero). O quadro lista negócios abertos; o cartão mostra cliente, produto e valor; "+ Negócio" (escolhe contato, produto e origem, ambos opcionais) no lugar de "Adicionar contato"; filtro por produto; arrastar e mover continuam. Ficha do contato troca o bloco "Funis" por "Negócios" (abertos e fechados). Spec: histórias 3–8 e 14.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Migração: cria `deal` (campos da spec), apaga `funnel_card`
- [ ] API do quadro devolve negócios (com produto, valor, origem, dados do contato e da conversa como hoje); criar, mover, editar produto/valor/origem, remover
- [ ] Valor pré-preenchido com o preço do produto, editável
- [ ] Origem manual: campanhas ativas + Indicação, Orgânico, Cliente antigo, Outro, ou vazia
- [ ] Filtro por produto no quadro; responsável = assignee da conversa
- [ ] Ficha: bloco "Negócios"
- [ ] Testes de borda + E2E (dois negócios para o mesmo contato; arrastar)

## Comments
