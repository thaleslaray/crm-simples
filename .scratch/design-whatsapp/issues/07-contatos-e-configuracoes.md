# 07: Contatos e Configurações em duas colunas

**What to build:** Contatos e Configurações seguem o molde das Configurações do WhatsApp Web: lista à esquerda e detalhe à direita. Em Contatos, a lista tem busca e chips de etiqueta, e à direita fica a ficha do contato com "Abrir conversa". Em Configurações, a esquerda tem o cartão do membro e os itens (só os que o papel permite); à direita fica a tela do item. No celular, a lista e o detalhe são telas separadas, com botão de voltar. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 30–32.

**Blocked by:** 01 (Tokens, tema e casca de navegação), 06 (Ficha do contato)

**Status:** ready-for-agent

- [ ] `TwoColumnPage` (lista | detalhe; no celular, uma tela por vez)
- [ ] Contatos: busca, chips de etiqueta, linhas com nome, telefone e etiquetas; ficha à direita com "Abrir conversa"
- [ ] Configurações: cartão (nome, papel, e-mail) e os itens Respostas rápidas, Etiquetas, Funis e etapas, Equipe, Conexão do número, Empresa, Perfil e Sair; o atendente vê só Respostas rápidas, Perfil e Sair
- [ ] As rotas atuais (`/respostas-rapidas`, `/etiquetas`, `/funis/gerenciar`, `/equipe`, `/conexao`, `/perfil`, `/empresa`) abrem com a lista de Configurações à esquerda e o item marcado
- [ ] As telas de cada item usam os tokens (cartões brancos sobre o fundo da barra), com o comportamento de hoje
- [ ] E2E: o atendente não vê itens de admin; abrir um contato e "Abrir conversa"; navegação lista → detalhe → voltar no celular
- [ ] Prints em desktop e celular, nos temas claro e escuro

## Comments
