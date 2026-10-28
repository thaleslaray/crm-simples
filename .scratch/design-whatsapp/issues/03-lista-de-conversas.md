# 03: Lista de conversas

**What to build:** a coluna da caixa de entrada no visual do WhatsApp. No cabeçalho, o nome, o menu ⋮ (Perfil e Sair) e o botão "+" redondo, que abre a nova conversa. Abaixo, a busca e os chips: Tudo, Minhas, Sem dono (com contagem), Não lidas (com contagem) e ▾, que abre os outros filtros. Cada linha tem uma terceira linha com o status, o responsável e as etiquetas. O estado vazio fica à direita. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 10–15, 34.

**Blocked by:** 01 (Tokens, tema e casca de navegação)

**Status:** done

- [x] Cabeçalho: título (nome da empresa quando o 02 estiver pronto; até lá, o texto atual), ⋮ com Perfil e Sair, botão "+" que abre a nova conversa
- [x] Busca arredondada com o comportamento atual (nome, telefone e texto)
- [x] Chips: Tudo · Minhas · Sem dono · Não lidas · ▾. "Sem dono" = `assignee=none`, sem as resolvidas. "Não lidas" é filtrada no cliente. Mostram a contagem
- [x] ▾ abre: Em andamento, Aguardando cliente, Resolvidas; responsável; etiqueta. Um filtro ativo aparece no chip
- [x] Linha: foto/iniciais, nome, hora (verde se não lida), prévia com ticks e "Colega: " quando de outro atendente, contador verde
- [x] Terceira linha: `StatusPill` com as cores da spec · responsável ou "sem dono" em itálico · até 2 `LabelTag` + "+N", cortada com esmaecimento
- [x] Estado vazio à direita (nome e dica da história 34)
- [x] E2E: cada chip filtra; contagens batem; terceira linha mostra status, responsável e etiquetas; "+" abre a nova conversa
- [x] Prints em desktop e celular, nos temas claro e escuro

## Comments

# 2026-10-28: ticket 03 feito

- Worker: `lastMessage` agora traz `direction`, `status` (entrega), `authorId` e `authorName` (teste de borda em `test/conversations.test.ts`, red -> green). Limite: a lista só atualiza os ticks quando chega `message.created`/`conversation.updated` ou ao refazer a busca; ticks azuis em tempo real ficam para depois.
- Componentes novos em `src/web/pills.tsx`: `StatusPill` e `LabelTag` (usar nos funis, contatos e cabeçalho da conversa).
- Cabeçalho: título provisório "Caixa de entrada" (o ticket 02 troca pelo nome da empresa), menu ⋮ com Perfil, Sair e, provisoriamente, os atalhos de admin (Etiquetas, Respostas rápidas, Equipe, Conexão) até o ticket 07. Para abrir esse menu nos E2E: `openUserMenu(page)` em `e2e/fixtures.ts`.
- Chips: contagens vêm de uma busca sem filtro (`useAllConversations` em `InboxPage.tsx`). "Sem dono" exclui resolvidas; "Não lidas" filtra no cliente. O ▾ escolhe status, responsável e etiqueta e aparece no chip.
- Tokens criados: `--shadow`, `--menu-shadow`, `--fab-bg/fg`, `--filter-on-bg/fg`. Foto do contato ainda não aparece na lista (só iniciais/ícone).
- E2E: `e2e/lista.spec.ts`; `status`, `etiquetas` e os que usavam o cabeçalho antigo foram ajustados.
