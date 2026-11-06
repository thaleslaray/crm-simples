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
