# Spec: design do CRM no estilo WhatsApp Web

## Problem Statement

O CRM v1 (`.scratch/crm-whatsapp-v1/spec.md`) funciona, mas cada tela tem um visual próprio, sem uma linguagem comum. Os atendentes passam o dia no WhatsApp e precisam se achar no CRM sem treino: onde está a conversa, quem é o responsável, o que ainda espera alguém assumir.

## Solution

O CRM passa a ser **quase um clone do WhatsApp Web**: mesmo esqueleto (barra de ícones, lista de conversas, chat com balões, campo de mensagem embaixo), mesma paleta clara e escura, balões verdes e brancos e fundo bege com desenhos. O que é do CRM (status, responsável, etiquetas, notas internas, funis) entra nesse esqueleto sem quebrá-lo. Nada da marca da Meta aparece: no lugar de "WhatsApp" vai o nome da empresa, os ícones são Lucide e o padrão de fundo é desenho nosso.

Referência visual aprovada: protótipo em `prototipos/whatsapp/index.html` (branch `prototipo/design-whatsapp`), com prints em `prototipos/whatsapp/prints/`. O protótipo é a referência de aparência; o comportamento continua sendo o da spec v1.

## User Stories

### Base visual

1. Como atendente, quero que o CRM tenha a cara do WhatsApp Web (cores, balões, fundo do chat, tipografia), para que eu me ache sem treino.
2. Como atendente, quero tema claro e escuro que siga o tema do meu computador ou celular, para que o CRM combine com o resto do meu sistema.
3. Como atendente, quero fixar o tema em Claro, Escuro ou Automático no Perfil, para que eu escolha quando o sistema não ajuda.
4. Como admin, quero definir o nome da empresa, para que ele apareça no topo da lista, no login e na aba do navegador no lugar de "CRM WhatsApp".

### Navegação

5. Como atendente no computador, quero uma barra fina de ícones à esquerda com Conversas (com o total de não lidas), Contatos e Funis em cima, e Configurações e minha foto embaixo, para que eu troque de seção com um clique.
6. Como atendente no celular, quero uma barra de abas embaixo com Conversas (com o total de não lidas), Contatos, Funis e Mais, para que eu navegue com o polegar.
7. Como atendente no celular, quero que a conversa e a ficha abram em tela cheia, com botão de voltar e sem a barra de abas, para que o chat use a tela toda.
8. Como membro, quero ver a faixa vermelha "WhatsApp desconectado: as mensagens não estão chegando." acima de tudo, em qualquer tela, para que eu saiba na hora que o número caiu.
9. Como admin, quero um botão "Reconectar" nessa faixa, que leva à conexão do número, para que eu resolva sem procurar.

### Lista de conversas

10. Como atendente, quero o cabeçalho da lista com o nome da empresa, um menu ⋮ (Perfil, Sair) e um botão redondo "+" que abre a nova conversa, como no WhatsApp.
11. Como atendente, quero os chips Tudo · Minhas · Sem dono · Não lidas à vista, com a contagem em "Sem dono" e "Não lidas", para que eu filtre o mais comum com um clique.
12. Como atendente, quero um chip ▾ que abre os demais filtros (status em andamento, aguardando cliente, resolvidas; responsável; etiqueta), para que os filtros raros não ocupem espaço.
13. Como atendente, quero que cada linha tenha as duas linhas do WhatsApp (nome e hora; prévia e contador de não lidas) e uma terceira linha menor com a pílula do status, o responsável (ou "sem dono") e até duas etiquetas mais "+N", para que eu decida o que abrir sem entrar na conversa.
14. Como atendente, quero que a prévia de mensagem enviada mostre os ticks e, se for de um colega, o nome dele ("Bruno: …"), como num grupo.
15. Como atendente, quero cores de status pela urgência (aberta em laranja, em andamento em azul, aguardando cliente em cinza-azulado, resolvida em cinza claro), com o verde reservado ao WhatsApp, para que o que pede ação salte aos olhos.

### Conversa

16. Como atendente, quero o cabeçalho da conversa com foto, nome, a pílula do status e o responsável, e clicar no nome abre a ficha.
17. Como atendente, quero um botão de ação com contorno no lugar do "Adicionar à lista" do WhatsApp, que muda com a conversa: "Assumir" (verde) quando está aberta sem dono e "Resolver" quando está em andamento ou aguardando cliente. Resolvida não mostra botão: ela reabre quando o cliente escreve ou quando alguém inicia conversa com o contato, como na v1.
18. Como atendente, quero ao lado do botão a lupa (buscar nesta conversa) e um ⋮ com Ver ficha do contato, Transferir e, para o admin, Atribuir a…, sem os ícones de vídeo e chamada.
19. Como atendente, quero balões brancos à esquerda para o cliente e verdes à direita para a equipe, com hora e ticks no canto, como no WhatsApp.
20. Como atendente, quero que o balão verde mostre o nome do atendente em letra pequena e colorida no topo, só no primeiro de uma sequência do mesmo autor, e sem repetir o "*Ana:*" no texto, para que eu saiba quem falou.
21. Como atendente, quero as notas internas num balão amarelo-claro centralizado e mais estreito, com 🔒, autor, "nota interna, o cliente não vê" e hora, para que nunca se confundam com mensagem enviada.
22. Como atendente, quero os eventos (assumida, transferida, resolvida, devolvida) e as datas ("Hoje", "Ontem") como pílulas centralizadas, como as datas do WhatsApp.
23. Como atendente, quero o fundo do chat bege (quase preto no escuro) com um padrão próprio e sutil de desenhos, para que pareça o WhatsApp sem copiar a arte da Meta.

### Campo de mensagem

24. Como atendente, quero um campo arredondado com "+" (anexos: fotos e vídeos, documento, câmera), um ícone de cadeado, o texto e o microfone, que vira botão de enviar quando há texto.
25. Como atendente, quero que o cadeado ligue o modo nota: o campo fica amarelo, aparece a dica "Nota interna: só a equipe vê. O cliente não recebe." e o que eu enviar vira nota.
26. Como atendente, quero que digitar "/" no começo abra as respostas rápidas logo acima do campo, filtrando enquanto digito, e que escolher uma ponha o texto no campo.

### Ficha do contato

27. Como atendente no computador, quero a ficha como terceira coluna à direita ("Dados do contato"), que estreita o chat e fecha no X, como no WhatsApp.
28. Como atendente, quero que a ficha comece fechada e que o CRM lembre, neste aparelho, se eu a deixei aberta, para que ela continue aberta ao trocar de conversa.
29. Como atendente, quero a ficha em blocos: foto grande, nome e telefone; Etiquetas; Funis (funil · etapa); Dados; Notas do contato.

### Outras telas

30. Como atendente, quero Contatos no molde de duas colunas: lista com busca e chips de etiqueta à esquerda, ficha do contato selecionado à direita com "Abrir conversa".
31. Como atendente, quero Configurações no mesmo molde: à esquerda meu cartão (nome, papel, e-mail) e os itens Respostas rápidas, Etiquetas, Funis e etapas, Equipe, Conexão do número, Empresa, Perfil e Sair; à direita o item aberto.
32. Como atendente, quero ver em Configurações só os itens que posso usar (Respostas rápidas, Perfil, Sair), para que o menu não me ofereça o que é do admin.
33. Como atendente, quero Funis em largura total: título, chips para trocar de funil, colunas por etapa e cards no estilo dos balões (foto, nome, hora, prévia, status e etiquetas).
34. Como atendente, quero que sem conversa aberta o lado direito mostre o nome da empresa e a dica "Escolha uma conversa à esquerda. As que estão sem dono esperam alguém assumir."

## Implementation Decisions

### Tokens

- Cores como variáveis CSS em `:root`, com um segundo conjunto em `:root[data-theme="dark"]`. O `data-theme` é resolvido no carregamento: preferência salva (`auto` | `light` | `dark`) ou, em `auto`, `prefers-color-scheme`, reagindo quando o sistema muda. Valores de partida: os do protótipo.
  - Claro: painel `#ffffff`, barra de ícones `#f7f5f3`, chat `#efeae2`, balão recebido `#ffffff`, enviado `#d9fdd3`, nota `#fff6c2` com borda `#f0dc7a`, texto `#111b21`, texto secundário `#667781`, divisória `#e9edef`, verde `#25d366`/`#1daa61`, verde de texto `#008069`, tick lido `#53bdeb`, faixa de desconexão `#ea0038`.
  - Escuro: painel `#111b21`, barra `#202c33`, chat `#0b141a`, recebido `#202c33`, enviado `#005c4b`, nota `#3d3514`, texto `#e9edef`, secundário `#8696a0`, divisória `#222d34`.
  - Status (fundo/texto, claro): aberta `#ffe9d6`/`#b54708`; em andamento `#dcecff`/`#1d5fbf`; aguardando cliente `#e3e9ef`/`#4a5d70`; resolvida `#f0f2f5`/`#8696a0`. No escuro, os pares do protótipo.
- Fonte: pilha do sistema (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`). Nenhuma fonte baixada.
- Ícones: `lucide-react`, traço 1.75. Nenhum ícone ou arte do WhatsApp.
- Cor do autor no balão: cada membro ganha uma cor estável derivada do id (paleta fixa de ~8 cores legíveis nos dois temas). Avatar sem foto: iniciais sobre cor derivada do id do contato.
- Padrão de fundo do chat: um SVG próprio (balão, etiqueta, funil, envelope, estrela, coração, check) aplicado como `background-image` em ladrilho, com o traço numa cor por tema, um pouco mais escura que o fundo.

### Layout

- Desktop (≥768px): grid `64px | lista (mín. 340px, ~30%) | chat | ficha 400px (opcional)`. Funis: `64px | conteúdo`.
- Celular (<768px): uma coluna. Lista e abas; chat e ficha em tela cheia sem abas. A barra de ícones some.
- A faixa de desconexão fica acima do grid e não é coberta por nada.
- Mapeamento das rotas atuais: `/` e `/conversas/:id` (Conversas); `/contatos` (Contatos); `/funis`, `/funis/:id` (Funis); Configurações agrupa `/respostas-rapidas`, `/etiquetas`, `/funis/gerenciar`, `/equipe`, `/conexao`, `/perfil` e a nova `/empresa`. As URLs atuais continuam valendo; a lista de Configurações aparece à esquerda em todas elas.

### Dados novos

- **Nome da empresa:** tabela `workspace_setting` (linha única) com `companyName`, padrão "Atendimento". `GET /api/workspace` (público, porque o login mostra o nome) e `PATCH /api/workspace` (só admin, relê o papel do D1 como as outras rotas que mudam estado). Mudança publica um evento no hub para os clientes abertos trocarem o título.
- **Tema e ficha aberta:** preferência do aparelho, em `localStorage` (`crm.theme`, `crm.fichaAberta`), lida com try/catch. Não vai para o servidor.
- **Filtro "Não lidas":** feito no cliente sobre a lista já carregada (a contagem de não lidas já vem por conversa). "Sem dono" usa `assignee=none` e exclui resolvidas.
- **Autor no balão:** a API de mensagens já devolve `sentById`; o cliente resolve o nome pela lista de membros. O texto gravado não tem o prefixo "*Nome:*" (ele só é posto no envio), então nada a remover.

### Componentes

- `AppShell` (faixa de desconexão, barra de ícones ou abas, área de conteúdo), `ConversationList` (cabeçalho, busca, chips, linhas), `ConversationRow`, `StatusPill`, `LabelTag`, `ChatHeader` (com `ConversationAction`), `MessageBubble`, `NoteBubble`, `EventPill`, `Composer` (anexos, modo nota, respostas rápidas, voz), `ContactPanel` (ficha), `TwoColumnPage` (molde de Contatos e Configurações), `FunnelBoard`.
- O comportamento das telas da v1 não muda: assumir, resolver, transferir, enviar, citar, mídia, voz, busca, avisos e tempo real seguem como estão. A mudança é de apresentação e de onde cada controle fica.

## Testing Decisions

- Os E2E existentes (`e2e/`) continuam valendo como rede de segurança do comportamento; ajuste só os seletores que mudarem, preferindo papel e texto acessível (`getByRole`, `getByText`) a classes.
- Cada ticket acrescenta E2E do que é novo: chips e contagens, botão de ação por status, modo nota no campo, "/" abrindo respostas rápidas, ficha lembrando aberta/fechada, abas no celular, faixa de desconexão com "Reconectar" só para admin.
- Tema: um E2E com `colorScheme: "dark"` confere `data-theme="dark"` e outro confere que a escolha no Perfil vence o sistema.
- Nome da empresa: teste de borda do Worker para `GET`/`PATCH /api/workspace` (atendente recebe 403; admin rebaixado recebe 403 mesmo com cookie válido) e E2E do título trocando.
- Conferência visual por print (`E2E_PRINTS=<pasta>`) em desktop 1440px e celular 375px, claro e escuro, comparando com os prints do protótipo. Não há teste de pixel.

## Out of Scope

- Vídeo, chamada, figurinhas, status, comunidades e qualquer recurso do WhatsApp que o CRM não tem.
- Logo da empresa e cores da marca da empresa (só o nome).
- Arrastar cards no kanban de outro jeito que o atual; animações além de transições simples.
- Redesenho do login além de usar os tokens e mostrar o nome da empresa.
- Mudanças de comportamento da v1 (regras de status, avisos, permissões).

## Further Notes

- Decisões tomadas em entrevista em 2026-10-28; protótipo aprovado no mesmo dia.
- Diferença em relação à entrevista: o protótipo tinha "Resolver ▾" com "Aguardando cliente" e "Em andamento" na seta, e "Reabrir" na resolvida. A v1 não tem essas mudanças manuais de status (aguardando cliente é automático ao enviar; reabrir é automático quando o cliente escreve), então ficaram fora para não mudar comportamento. Se forem desejadas, viram um ticket de comportamento à parte.
- A paleta e o padrão de fundo são aproximações do WhatsApp Web; o objetivo é a familiaridade, não a cópia exata.
