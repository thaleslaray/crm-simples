# 07: Contatos e Configurações em duas colunas

**What to build:** Contatos e Configurações seguem o molde das Configurações do WhatsApp Web: lista à esquerda e detalhe à direita. Em Contatos, a lista tem busca e chips de etiqueta, e à direita fica a ficha do contato com "Abrir conversa". Em Configurações, a esquerda tem o cartão do membro e os itens (só os que o papel permite); à direita fica a tela do item. No celular, a lista e o detalhe são telas separadas, com botão de voltar. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 30–32.

**Blocked by:** 01 (Tokens, tema e casca de navegação), 06 (Ficha do contato)

**Status:** done

- [x] `TwoColumnPage` (lista | detalhe; no celular, uma tela por vez)
- [x] Contatos: busca, chips de etiqueta, linhas com nome, telefone e etiquetas; ficha à direita com "Abrir conversa"
- [x] Configurações: cartão (nome, papel, e-mail) e os itens Respostas rápidas, Etiquetas, Funis e etapas, Equipe, Conexão do número, Empresa, Perfil e Sair; o atendente vê só Respostas rápidas, Perfil e Sair
- [x] As rotas atuais (`/respostas-rapidas`, `/etiquetas`, `/funis/gerenciar`, `/equipe`, `/conexao`, `/perfil`, `/empresa`) abrem com a lista de Configurações à esquerda e o item marcado
- [x] As telas de cada item usam os tokens (cartões brancos sobre o fundo da barra), com o comportamento de hoje
- [x] E2E: o atendente não vê itens de admin; abrir um contato e "Abrir conversa"; navegação lista → detalhe → voltar no celular
- [x] Prints em desktop e celular, nos temas claro e escuro

## Comments

### 2026-10-28
Feito. `TwoColumnPage` (`components/`) e `SettingsLayout` (`pages/`, layout das rotas de Configurações: `/configuracoes` mais as rotas dos itens, que abrem com a lista à esquerda e o item marcado; no celular a lista e o item são telas separadas, com seta "Voltar"). Contatos virou lista com busca e chips de etiqueta e ficha à direita (`/contatos/:contactId`, `ContactPanel` com "Abrir conversa" quando há conversa, senão "Iniciar conversa"). Barra de ícones e aba "Mais" apontam para `/configuracoes`; o avatar da barra continua em `/perfil`. As páginas dos itens perderam o cabeçalho próprio (o título vem do layout) e não têm mais o link "Voltar". O item "Empresa" (`/empresa`, só admin) está na lista; a rota vem do ticket 02 (resolver no merge). `QuickRepliesPage` segue com o comportamento de hoje para o atendente. Perfil diz "Tema e assinatura" (sem "senha"). E2E novo: `e2e/contatos-e-configuracoes.spec.ts` e helpers `e2e/atendente.ts` (cria atendente por convite via API) e `e2e/navegacao.ts` (`openSettingsItem`, `backToInbox`). Os specs antigos que usavam "Voltar" e os links do cabeçalho da caixa para chegar a Perfil, Etiquetas, Respostas rápidas e Funis e etapas passaram a usar esses helpers; `etiquetas.spec.ts` filtra contatos por chip. Para o ticket 03: ao tirar os links do cabeçalho da caixa, `equipe.spec.ts`, `conexao.spec.ts` e `casca.spec.ts` (links "Equipe"/"Conexão") ainda os usam e precisam de `openSettingsItem`.
