# 02: Nome da empresa

**What to build:** o admin define o nome da empresa em Configurações › Empresa. O nome aparece no topo da lista de conversas, no login, no estado vazio e na aba do navegador ("(3) Nome da empresa"), no lugar de "CRM WhatsApp". Quem estiver com o CRM aberto vê a troca na hora. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). História 4.

**Blocked by:** 01 (Tokens, tema e casca de navegação)

**Status:** ready-for-agent

- [ ] Tabela `workspace_setting` (linha única, `companyName`, padrão "Atendimento"), com migração gerada só por `ADD`/`CREATE`
- [ ] `GET /api/workspace` público; `PATCH /api/workspace` só para o admin, relendo o papel do D1
- [ ] A mudança publica um evento no hub, e os clientes trocam o título sem recarregar
- [ ] Tela `/empresa` (só admin) com o campo e o botão salvar
- [ ] O nome aparece no cabeçalho da lista, no login, no estado vazio e no título da aba
- [ ] Teste de borda: atendente recebe 403; admin rebaixado recebe 403 mesmo com cookie válido; o nome vazio é recusado
- [ ] E2E: o admin troca o nome e o título muda numa segunda aba

## Comments
