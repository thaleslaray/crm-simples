# 06: Ficha do contato

**What to build:** a ficha vira o "Dados do contato" do WhatsApp. No computador, é uma terceira coluna de 400px que estreita o chat, começa fechada e é lembrada neste aparelho. No celular, é uma tela cheia com botão de voltar. O conteúdo vem em blocos: foto grande, nome e telefone; Etiquetas; Funis; Dados; Notas do contato. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 27–29.

**Blocked by:** 04 (Conversa: cabeçalho e balões)

**Status:** ready-for-agent

- [ ] Abre pelo nome no cabeçalho ou por "Ver ficha"; fecha no X (desktop) ou no voltar (celular)
- [ ] Aberta/fechada lembrada em `localStorage` `crm.fichaAberta`; continua ao trocar de conversa
- [ ] Blocos: hero (foto 200px ou iniciais, nome, telefone); Etiquetas (com Editar/Adicionar); Funis (funil · etapa); Dados; Notas do contato, todos com as ações de hoje
- [ ] Componente reaproveitável pela tela de Contatos (ticket 07)
- [ ] E2E: abre, fecha, lembra entre conversas e após recarregar; no celular abre em tela cheia e volta ao chat
- [ ] Prints em desktop e celular, nos temas claro e escuro

## Comments
