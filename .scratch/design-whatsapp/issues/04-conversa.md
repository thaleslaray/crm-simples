# 04: Conversa (cabeçalho e balões)

**What to build:** o chat no visual do WhatsApp. O cabeçalho tem foto, nome, status e responsável; clicar no nome abre a ficha. No lugar do "Adicionar à lista" fica um botão de ação ("Assumir" ou "Resolver"); ao lado, a lupa e o ⋮ (Ver ficha, Transferir e, para o admin, Atribuir a…). As mensagens aparecem em balões brancos e verdes, com o nome do atendente no topo do verde. As notas ficam em balões amarelos centralizados. Eventos e datas aparecem como pílulas. O fundo é bege, com o padrão próprio. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 16–23.

**Blocked by:** 01 (Tokens, tema e casca de navegação)

**Status:** ready-for-agent

- [ ] `ChatHeader`: foto, nome (clique abre a ficha), pílula de status e "com Fulano"/"sem dono"; botão voltar no celular
- [ ] `ConversationAction`: "Assumir" (contorno verde) em aberta sem dono; "Resolver" em andamento/aguardando; nada em resolvida
- [ ] Lupa (busca na conversa, como hoje) e ⋮ com Ver ficha, Transferir e Atribuir a… (só admin); sem vídeo nem chamada
- [ ] `MessageBubble`: recebido branco à esquerda, enviado verde à direita, rabicho no primeiro da sequência, hora e ticks, citação, mídia e voz como hoje
- [ ] Nome do autor (cor estável por membro) no topo do balão verde, só no primeiro de uma sequência do mesmo autor
- [ ] `NoteBubble`: amarelo, centralizado, ~70% da largura, 🔒, autor, "nota interna, o cliente não vê" e hora
- [ ] `EventPill` para eventos e separadores de data ("Hoje", "Ontem", data)
- [ ] Fundo bege/escuro com o SVG próprio em ladrilho
- [ ] E2E: o botão muda com o status; o nome do autor aparece só no primeiro da sequência; a nota é distinta da mensagem
- [ ] Prints em desktop e celular, nos temas claro e escuro

## Comments
