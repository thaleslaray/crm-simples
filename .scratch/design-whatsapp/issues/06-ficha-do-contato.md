# 06: Ficha do contato

**What to build:** a ficha vira o "Dados do contato" do WhatsApp. No computador, é uma terceira coluna de 400px que estreita o chat, começa fechada e é lembrada neste aparelho. No celular, é uma tela cheia com botão de voltar. O conteúdo vem em blocos: foto grande, nome e telefone; Etiquetas; Funis; Dados; Notas do contato. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 27–29.

**Blocked by:** 04 (Conversa: cabeçalho e balões)

**Status:** done

- [x] Abre pelo nome no cabeçalho ou por "Ver ficha"; fecha no X (desktop) ou no voltar (celular)
- [x] Aberta/fechada lembrada em `localStorage` `crm.fichaAberta`; continua ao trocar de conversa
- [x] Blocos: hero (foto 200px ou iniciais, nome, telefone); Etiquetas (com Editar/Adicionar); Funis (funil · etapa); Dados; Notas do contato, todos com as ações de hoje
- [x] Componente reaproveitável pela tela de Contatos (ticket 07)
- [x] E2E: abre, fecha, lembra entre conversas e após recarregar; no celular abre em tela cheia e volta ao chat
- [x] Prints em desktop e celular, nos temas claro e escuro

## Comments

### 2026-10-28
Feito. `ContactPanel` virou "Dados do contato" (hero com foto 200px, Etiquetas com Editar, Funis, Dados editáveis, Conversas, Notas do contato). Coluna de 400px no computador (cobre o lado direito entre 768 e 1099px); no celular, tela cheia sem cabeçalho do chat nem abas, com seta de voltar. Começa fechada; `crm.fichaAberta` (try/catch) vale ao trocar de conversa e após recarregar, só no computador (no celular não se lembra). E2E novo: `e2e/ficha-do-contato.spec.ts` (claro e escuro, desktop e celular). Para o ticket 07: `<ContactPanel contactId onClose? heroAction?(contact) className? />`; `StartConversationButton` exportado; "Abrir conversa" entra por `heroAction`. Sem `onClose`, não há X.
