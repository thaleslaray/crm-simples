# 03: Lista de conversas

**What to build:** a coluna da caixa de entrada no visual do WhatsApp. No cabeçalho, o nome, o menu ⋮ (Perfil e Sair) e o botão "+" redondo, que abre a nova conversa. Abaixo, a busca e os chips: Tudo, Minhas, Sem dono (com contagem), Não lidas (com contagem) e ▾, que abre os outros filtros. Cada linha tem uma terceira linha com o status, o responsável e as etiquetas. O estado vazio fica à direita. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 10–15, 34.

**Blocked by:** 01 (Tokens, tema e casca de navegação)

**Status:** ready-for-agent

- [ ] Cabeçalho: título (nome da empresa quando o 02 estiver pronto; até lá, o texto atual), ⋮ com Perfil e Sair, botão "+" que abre a nova conversa
- [ ] Busca arredondada com o comportamento atual (nome, telefone e texto)
- [ ] Chips: Tudo · Minhas · Sem dono · Não lidas · ▾. "Sem dono" = `assignee=none`, sem as resolvidas. "Não lidas" é filtrada no cliente. Mostram a contagem
- [ ] ▾ abre: Em andamento, Aguardando cliente, Resolvidas; responsável; etiqueta. Um filtro ativo aparece no chip
- [ ] Linha: foto/iniciais, nome, hora (verde se não lida), prévia com ticks e "Colega: " quando de outro atendente, contador verde
- [ ] Terceira linha: `StatusPill` com as cores da spec · responsável ou "sem dono" em itálico · até 2 `LabelTag` + "+N", cortada com esmaecimento
- [ ] Estado vazio à direita (nome e dica da história 34)
- [ ] E2E: cada chip filtra; contagens batem; terceira linha mostra status, responsável e etiquetas; "+" abre a nova conversa
- [ ] Prints em desktop e celular, nos temas claro e escuro

## Comments
