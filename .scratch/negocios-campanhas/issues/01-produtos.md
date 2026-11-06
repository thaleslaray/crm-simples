# 01: Produtos

**What to build:** tela de Produtos em Configurações (só admin): criar, editar nome e preço, arquivar. Rotas `GET/POST/PATCH /api/products` (GET para qualquer membro, que precisa da lista; escrita só admin). Tabela `product` (migração 0020). Spec: `.scratch/negocios-campanhas/spec.md`, histórias 1–2.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] Migração `product` (id, name, priceCents, archivedAt, createdAt; nome único sem caixa)
- [ ] Rotas com validação (nome 1–80, preço ≥ 0 em centavos) e 403 para atendente na escrita
- [ ] Tela Produtos no padrão de Etiquetas, valor em R$ com máscara
- [ ] Arquivar tira da lista de escolha, mantém nos negócios antigos
- [ ] Testes de borda + E2E de criar e arquivar

## Comments

### 2026-11-06
Feito. Tabela `product` (migração `0020_produtos`), rotas `GET/POST/PATCH /api/products` (`src/worker/products.ts`), tela Produtos em Configurações (só admin) com máscara de R$, evento `products.changed`. Testes de borda em `test/produtos.test.ts` (8) e E2E em `e2e/produtos.spec.ts`. Decisões para os próximos tickets: arquivar é `PATCH {archived: true|false}`; `GET /api/products` devolve só os ativos, `?todos=1` inclui arquivados (para mostrar o nome em negócios antigos). Nome é único mesmo entre arquivados.
