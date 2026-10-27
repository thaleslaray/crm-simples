# Spec: CRM de atendimento por WhatsApp — v1

Status: ready-for-agent

## Problem Statement

A empresa atende clientes por um único número de WhatsApp, e hoje uma equipe pequena (2 a 10 pessoas) divide esse atendimento sem nenhuma organização: não se sabe quem está cuidando de qual cliente, conversas ficam sem resposta porque cada um acha que o outro respondeu, o contexto de cada cliente (quem é, em que pé está a negociação, o que já foi combinado) vive na cabeça das pessoas, e não há como acompanhar em que etapa de venda ou atendimento cada contato está. Quando alguém sai ou troca de turno, o histórico e o combinado se perdem.

## Solution

Um CRM web interno, usado só pela equipe da empresa, que conecta o número de WhatsApp (via Uazapi) a uma **caixa de entrada compartilhada**. Toda mensagem que chega vira uma **conversa** visível para toda a equipe, em tempo real. Cada conversa tem um **status** (aberta, em andamento, resolvida) e um **responsável**: o atendente assume a conversa ou o admin a atribui. Dentro da conversa, o atendente vê o histórico completo, responde com texto, mídia e nota de voz, cita mensagens, usa respostas rápidas e deixa **notas internas** que o cliente nunca vê. Cada cliente tem uma **ficha do contato** com seus dados, **etiquetas** e posição em um ou mais **funis** (kanban). O admin gerencia a equipe, os funis, as etiquetas, as respostas rápidas e a conexão do número. Funciona bem no computador e no celular.

## User Stories

### Acesso e equipe

1. Como admin, quero que o primeiro admin seja criado por um script na implantação, para que o sistema nasça sem cadastro aberto.
2. Como admin, quero gerar um link de convite de uso único e com validade para um novo atendente, para que eu possa enviá-lo pelo canal que quiser sem depender de e-mail.
3. Como admin, quero escolher o papel (admin ou atendente) ao gerar o convite, para que a pessoa já entre com as permissões certas.
4. Como convidado, quero abrir o link de convite e definir meu nome, e-mail e senha, para que eu comece a usar o CRM.
5. Como convidado, quero ver uma mensagem clara se o link estiver vencido ou já tiver sido usado, para que eu saiba pedir outro ao admin.
6. Como atendente, quero entrar com e-mail e senha, para que só a equipe acesse as conversas.
7. Como visitante, quero que não exista tela de cadastro aberto, para que ninguém de fora crie conta.
8. Como admin, quero gerar um link de redefinição de senha de uso único e com validade para um atendente que esqueceu a senha, para que ele recupere o acesso sem e-mail.
9. Como atendente, quero abrir o link de redefinição e definir uma nova senha, para que eu volte a entrar.
10. Como admin, quero ver a lista de membros da equipe com nome, e-mail e papel, para que eu saiba quem tem acesso.
11. Como admin, quero remover um atendente, para que ele perca o acesso imediatamente (sessões encerradas).
12. Como admin, quero que as conversas em andamento de um atendente removido voltem para "aberta" sem responsável, para que nenhum cliente fique esquecido.
13. Como admin, quero mudar o papel de um membro, para que eu promova ou rebaixe alguém.
14. Como atendente, quero sair da minha conta, para que ninguém use meu acesso num computador compartilhado.

### Conexão do número

15. Como admin, quero uma tela de conexão que mostre o status do número (conectado, conectando, desconectado), para que eu saiba se o WhatsApp está funcionando.
16. Como admin, quero ver o QR code nessa tela quando o número estiver desconectado, para que eu reconecte escaneando com o celular.
17. Como admin, quero que o QR code se atualize sozinho enquanto a conexão está pendente, para que eu não precise recarregar a página.
18. Como membro da equipe, quero ver uma faixa vermelha no topo de todas as telas quando o número cair, para que eu saiba que mensagens não estão chegando nem saindo.
19. Como membro da equipe, quero que a faixa suma sozinha quando o número voltar, para que eu saiba que está tudo normal.
20. Como admin, quero que o sistema confira o status do número periodicamente (a cada 5 minutos), para que uma queda seja detectada mesmo quando a Uazapi não avisar.

### Caixa de entrada compartilhada

21. Como atendente, quero ver todas as conversas individuais do número numa lista única, para que a equipe inteira enxergue o mesmo trabalho.
22. Como atendente, quero que a lista mostre nome ou telefone do contato, foto, prévia da última mensagem, horário, status, responsável e contador de não lidas, para que eu decida o que abrir primeiro.
23. Como atendente, quero que a lista seja ordenada pela mensagem mais recente, para que o que acabou de chegar apareça no topo.
24. Como atendente, quero filtrar a lista por status (aberta, em andamento, resolvida), para que eu foque no que precisa de ação.
25. Como atendente, quero um filtro "minhas", para que eu veja só as conversas pelas quais sou responsável.
26. Como atendente, quero filtrar por responsável, para que eu veja a fila de um colega.
27. Como atendente, quero filtrar por etiqueta do contato, para que eu encontre clientes de um segmento.
28. Como atendente, quero que novas mensagens e mudanças (status, responsável, nova conversa) apareçam na lista em tempo real, sem recarregar a página, para que eu nunca trabalhe com informação velha.
29. Como atendente, quero que o app se reconecte sozinho e se atualize quando a internet voltar, para que eu não perca nada que chegou enquanto estava offline.
30. Como atendente, quero buscar por nome ou telefone do contato, para que eu ache a conversa de alguém rapidamente.
31. Como atendente, quero buscar por um trecho do texto das mensagens, para que eu ache "aquela conversa onde falaram do boleto".
32. Como atendente, quero que os resultados da busca no texto mostrem a mensagem encontrada e me levem até ela na conversa, para que eu veja o contexto.
33. Como atendente, quero que mensagens de grupos do WhatsApp não apareçam no CRM, para que a caixa tenha só atendimento individual.

### Avisos

34. Como atendente, quero receber som e notificação do navegador quando chegar mensagem numa conversa sem responsável, para que alguém da equipe pegue logo.
35. Como atendente, quero receber som e notificação só das conversas em que sou o responsável (além das sem dono), para que eu não seja incomodado pelas conversas dos colegas.
36. Como atendente, quero que a notificação mostre o nome do contato e uma prévia da mensagem, e que clicar nela abra a conversa, para que eu responda rápido.
37. Como atendente, quero ver o total de não lidas no título da aba, para que eu perceba mensagens novas mesmo em outra aba.

### Conversa

38. Como atendente, quero abrir uma conversa e ver todo o histórico de mensagens desde que o número foi conectado, em ordem, para que eu entenda o contexto.
39. Como atendente, quero carregar mensagens mais antigas rolando para cima, para que conversas longas abram rápido.
40. Como atendente, quero ver imagens, vídeos, áudios, documentos, figurinhas, localizações e contatos recebidos exibidos de forma adequada, para que eu entenda o que o cliente mandou sem sair do CRM.
41. Como atendente, quero ouvir notas de voz e áudios dentro da conversa, para que eu não precise baixar o arquivo.
42. Como atendente, quero baixar documentos recebidos, para que eu abra PDFs e planilhas do cliente.
43. Como atendente, quero que mídias recebidas continuem disponíveis por um ano, para que eu consulte comprovantes antigos.
44. Como atendente, quero ver um indicador de "carregando mídia" enquanto o arquivo ainda está sendo baixado, e um aviso se o download falhar de vez, para que eu saiba o que aconteceu.
45. Como atendente, quero enviar mensagens de texto, para que eu responda o cliente.
46. Como atendente, quero que minhas mensagens saiam com meu nome no início (por exemplo, "*Ana:*"), para que o cliente saiba quem está falando.
47. Como atendente, quero desligar a assinatura com meu nome no meu perfil, para que eu escolha se apareço ou não.
48. Como atendente, quero enviar imagem, vídeo e documento com legenda opcional, para que eu mande arquivos ao cliente.
49. Como atendente, quero gravar uma nota de voz no navegador (no computador e no celular) e enviá-la, para que ela chegue ao cliente como áudio de voz do WhatsApp.
50. Como atendente, quero ouvir minha gravação antes de enviar e poder descartá-la, para que eu não mande áudio errado.
51. Como atendente, quero responder citando uma mensagem específica do cliente, para que fique claro a qual pergunta estou respondendo.
52. Como atendente, quero ver as citações também nas mensagens recebidas, para que eu entenda quando o cliente responde a algo específico.
53. Como atendente, quero ver o status de cada mensagem enviada (enviada, entregue, lida, falhou), para que eu saiba se o cliente viu.
54. Como atendente, quero que o status de uma mensagem nunca volte atrás (por exemplo, de "lida" para "entregue"), para que a informação seja confiável.
55. Como atendente, quero que, ao abrir a conversa, as mensagens do cliente sejam marcadas como lidas no WhatsApp, para que o cliente veja que foi atendido.
56. Como atendente, quero ver claramente quando o envio falhou e poder reenviar manualmente, para que nenhuma resposta se perca.
57. Como atendente, quero que o sistema nunca reenvie sozinho uma mensagem cujo envio ficou incerto, para que o cliente não receba mensagens duplicadas.
58. Como atendente, quero que o campo de mensagem preserve o rascunho se eu trocar de conversa, para que eu não perca o que estava escrevendo.

### Respostas rápidas

59. Como atendente, quero digitar `/` no campo de mensagem e ver a lista de respostas rápidas filtrando enquanto digito, para que eu responda perguntas frequentes em segundos.
60. Como atendente, quero que `{nome}` na resposta rápida seja trocado pelo nome do contato, para que a mensagem pareça pessoal.
61. Como atendente, quero poder editar o texto da resposta rápida depois de inseri-la e antes de enviar, para que eu ajuste ao caso.
62. Como admin, quero criar, editar e apagar respostas rápidas com um atalho e um texto, para que a equipe use mensagens padronizadas.
63. Como atendente, quero que as respostas rápidas sejam as mesmas para toda a equipe, para que o atendimento seja consistente.

### Status, responsável e transferência

64. Como atendente, quero que uma conversa nova (ou de um contato que nunca falou) comece como "aberta" sem responsável, para que a equipe saiba que precisa ser assumida.
65. Como atendente, quero assumir uma conversa aberta com um clique, para que eu me torne o responsável e ela passe para "em andamento".
66. Como atendente, quero ser impedido de assumir uma conversa que um colega acabou de assumir, para que duas pessoas não atendam o mesmo cliente.
67. Como atendente, quero transferir uma conversa minha para um colega, para que alguém mais adequado continue o atendimento.
68. Como admin, quero atribuir ou transferir qualquer conversa para qualquer atendente, para que eu distribua o trabalho.
69. Como atendente, quero marcar uma conversa como resolvida quando o atendimento terminar, para que ela saia da fila de trabalho.
70. Como atendente, quero que uma conversa resolvida volte para "em andamento" com o mesmo responsável quando o cliente escrever de novo, para que quem já conhece o caso continue.
71. Como atendente, quero que, se o antigo responsável tiver sido removido, a conversa reaberta volte para "aberta" sem dono, para que alguém assuma.
72. Como atendente, quero ver na linha do tempo da conversa os eventos de atribuição, transferência e mudança de status (quem fez e quando), para que eu entenda o histórico do atendimento.
73. Como atendente, quero que enviar a primeira resposta numa conversa aberta me torne responsável automaticamente, para que não fique conversa respondida sem dono.

### Iniciar conversa

74. Como atendente, quero um botão "Nova conversa" onde escolho um contato existente ou digito um número, para que eu possa falar primeiro com um cliente.
75. Como atendente, quero que digitar um número que ainda não existe crie o contato automaticamente, para que eu não precise cadastrar antes.
76. Como atendente, quero que iniciar uma conversa me torne o responsável dela, para que fique claro quem a abriu.
77. Como atendente, quero iniciar uma conversa a partir da ficha do contato, para que eu fale com quem estou vendo.
78. Como atendente, quero ser avisado se o número digitado for inválido, para que eu corrija antes de enviar.

### Notas internas

79. Como atendente, quero escrever uma nota interna dentro da conversa, para que eu registre informações para a equipe sem enviar ao cliente.
80. Como atendente, quero que notas internas apareçam na linha do tempo intercaladas com as mensagens e com visual claramente diferente, para que eu nunca as confunda com mensagens enviadas.
81. Como atendente, quero que notas internas mostrem autor e horário, para que eu saiba quem anotou.
82. Como atendente, quero ver todas as notas de um contato reunidas na ficha dele, para que eu tenha o contexto completo mesmo de conversas antigas.

### Ficha do contato

83. Como atendente, quero ver a ficha do contato ao lado da conversa (ou numa aba, no celular), para que eu tenha o contexto enquanto respondo.
84. Como atendente, quero que o contato seja criado automaticamente quando ele mandar a primeira mensagem, com o nome que aparece no WhatsApp e a foto de perfil, para que eu não precise cadastrar ninguém.
85. Como atendente, quero editar nome, e-mail, empresa e uma observação livre do contato, para que eu complete os dados.
86. Como atendente, quero que o telefone venha do WhatsApp e não seja editável, para que a ficha não se desconecte do número real.
87. Como atendente, quero ver na ficha o histórico de conversas do contato, para que eu saiba quantas vezes ele já foi atendido e por quem.
88. Como atendente, quero ver e alterar na ficha as etiquetas do contato, para que eu classifique o cliente.
89. Como atendente, quero ver e alterar na ficha em quais funis e etapas o contato está, para que eu mova o cliente sem abrir o kanban.
90. Como atendente, quero uma lista de contatos com busca e filtro por etiqueta, para que eu encontre clientes fora da caixa de entrada.

### Etiquetas

91. Como admin, quero criar, renomear, mudar a cor e apagar etiquetas, para que a equipe use uma classificação comum.
92. Como atendente, quero aplicar e remover etiquetas existentes num contato, para que eu classifique clientes.
93. Como atendente, quero ser impedido de criar etiquetas novas, para que a lista não vire bagunça.
94. Como atendente, quero ver as etiquetas do contato na lista de conversas e nos cards do funil, para que eu identifique o cliente de relance.
95. Como admin, quero que apagar uma etiqueta a remova de todos os contatos, para que não sobrem etiquetas órfãs.

### Funis

96. Como admin, quero criar vários funis (por exemplo, "Vendas" e "Suporte"), cada um com suas etapas, para que cada processo tenha seu próprio fluxo.
97. Como admin, quero criar, renomear, reordenar e apagar etapas de um funil, para que o funil reflita nosso processo.
98. Como admin, quero renomear e apagar funis, para que eu mantenha só os que usamos.
99. Como admin, quero ser impedido de apagar uma etapa que ainda tem cards sem antes escolher para onde movê-los, para que nenhum contato suma do funil.
100. Como atendente, quero ver um funil como kanban, com uma coluna por etapa e um card por contato, para que eu enxergue o pipeline.
101. Como atendente, quero adicionar um contato a um funil escolhendo a etapa inicial, para que ele comece a ser acompanhado.
102. Como atendente, quero arrastar o card entre etapas (no computador e no celular), para que eu atualize o andamento.
103. Como atendente, quero que um mesmo contato possa estar em vários funis ao mesmo tempo, com um card em cada, para que vendas e suporte acompanhem a mesma pessoa.
104. Como atendente, quero tirar um contato de um funil, para que ele saia do pipeline quando não fizer mais sentido.
105. Como atendente, quero abrir a conversa ou a ficha do contato a partir do card, para que eu aja sem procurar.
106. Como atendente, quero filtrar o kanban por etiqueta e por responsável da conversa atual, para que eu veja um recorte.
107. Como atendente, quero que movimentações no kanban feitas por colegas apareçam para mim em tempo real, para que o quadro esteja sempre certo.
108. Como atendente, quero que contatos fora de qualquer funil simplesmente não apareçam no kanban, para que o quadro mostre só quem está sendo acompanhado.

### Celular

109. Como atendente, quero usar o CRM inteiro pelo navegador do celular com um layout pensado para tela pequena (lista → conversa → ficha), para que eu atenda fora do computador.
110. Como atendente, quero gravar e enviar nota de voz e anexar fotos da câmera pelo celular, para que eu atenda com o mesmo recurso do desktop.

### Confiabilidade

111. Como admin, quero que nenhuma mensagem recebida se perca se o processamento falhar no meio, para que o histórico seja completo.
112. Como admin, quero que mensagens recebidas duas vezes pela Uazapi apareçam uma vez só, para que o histórico não fique duplicado.
113. Como admin, quero que o sistema recupere periodicamente mensagens que o webhook possa ter perdido, para que quedas temporárias não deixem buracos.
114. Como admin, quero que o webhook só aceite chamadas legítimas da nossa instância da Uazapi, para que ninguém injete mensagens falsas.

## Implementation Decisions

### Plataforma e stack

- Tudo na Cloudflare, plano **Workers Paid** (necessário para o tempo de CPU do hash de senha e para as cotas de escrita do D1). Endereço inicial no subdomínio `workers.dev`; domínio próprio fica para depois.
- Um único Worker com Hono serve a API, o webhook, o consumer da fila, o handler do cron e os static assets do front (React + Vite, SPA responsiva). Uma origem só: sem CORS e cookies de sessão no mesmo domínio.
- **D1** (SQLite) com Drizzle é a fonte da verdade de tudo. Inserts em lote respeitam o limite de parâmetros por consulta; escritas relacionadas usam batch.
- **Durable Object único** ("hub da caixa de entrada") só para tempo real: mantém os WebSockets dos membros conectados (com Hibernation) e faz broadcast de eventos. Não guarda estado de negócio; se hibernar ou reiniciar, nada se perde, porque o cliente se ressincroniza pela API.
- **Queues** para o download de mídia, fora da requisição do webhook.
- **R2** para mídias recebidas e enviadas, com regra de ciclo de vida que apaga objetos com mais de 365 dias. Mensagens cuja mídia expirou mostram "mídia expirada".
- **Cron Trigger** a cada 5 minutos para checagem de conexão e reconciliação.
- Segredos (token da instância Uazapi, admintoken, segredo da URL do webhook, segredo de auth) ficam como secrets do Worker.

### Módulos

1. **Cliente Uazapi** — interface única e injetável para tudo que fala com a Uazapi: enviar texto (com citação), enviar mídia (imagem, vídeo, documento, nota de voz `ptt`), marcar como lida, baixar mídia (`/message/download`), ler status da instância, iniciar conexão (QR), buscar avatar e detalhes do contato, buscar mensagens recentes para reconciliação, configurar o webhook. Trata `429` com backoff e jitter respeitando `Retry-After` (limite de ~10 req/s por instância). **Nunca** reenvia automaticamente um envio que deu timeout. Nos testes, é substituído por um servidor Uazapi falso.
2. **Ingestão do webhook** — rota única de webhook. Valida a origem comparando o `token` do corpo com o secret da instância **e** um segredo na própria URL cadastrada. Grava o evento cru e responde 200 imediatamente; o processamento é idempotente pelo `id` da mensagem (guardando também o `messageid` do WhatsApp, ambos como string). Trata os eventos `messages`, `messages_update` e `connection`. Webhook configurado com `excludeMessages` para descartar grupos (`isGroupYes`) e mensagens `fromMe` (as nossas são registradas no momento do envio pela API; as enviadas pelo celular são ignoradas por decisão do produto). `addUrlEvents` e `addUrlTypesMessages` desligados. O payload completo nunca é logado (contém o token).
3. **Pipeline de mídia** — ao ingerir uma mensagem com mídia, a mensagem é gravada com mídia "pendente" e um job com o id da mensagem vai para a fila. O consumer chama o download da Uazapi, faz stream do arquivo para o R2 (sem bufferizar inteiro na memória) e marca a mídia como disponível com tipo e tamanho. Retries automáticos da fila; após esgotar, vai para a DLQ e a mídia fica "falhou". A URL da Uazapi vale ~2 dias e a mensagem fica lá ~7 dias, então o job precisa rodar logo.
4. **Envio de mensagens** — o atendente envia pela API do CRM; o CRM grava a mensagem como "enviando", chama a Uazapi e atualiza com o id retornado. Se a Uazapi recusar, vira "falhou" com opção de reenviar manualmente; se der timeout, vira "incerto" e não é reenviada sozinha. Texto ganha o prefixo de assinatura `*Nome:*` + quebra de linha quando a assinatura do atendente estiver ligada (também na legenda de mídia; nota de voz não tem legenda). Mídia enviada pelo atendente é primeiro gravada no R2 e entregue à Uazapi por uma URL temporária assinada servida pelo Worker. Nota de voz gravada no navegador é enviada como `ptt`.
5. **Status de entrega** — eventos `messages_update` atualizam o status das mensagens enviadas na ordem enviada → entregue → lida/reproduzida, e o status nunca regride. "Falhou" só se aplica a mensagens que ainda não foram entregues.
6. **Conversas** — uma conversa por contato (o número é um só). Máquina de estados:
   - `aberta` (sem responsável) → `em_andamento` ao assumir, ao ser atribuída ou quando um atendente envia a primeira resposta.
   - `em_andamento` → `em_andamento` com outro responsável ao transferir.
   - `em_andamento` → `resolvida` quando um atendente ou o admin resolve.
   - `resolvida` → `em_andamento` com o mesmo responsável quando o cliente escreve; se o responsável não existir mais, volta a `aberta` sem dono.
   - Remover um atendente devolve as conversas `em_andamento` dele para `aberta` sem dono.
   - Assumir é uma operação condicional (só tem efeito se a conversa ainda estiver sem dono) para impedir que dois atendentes assumam ao mesmo tempo.
   - Cada transição grava um evento de sistema (autor e horário) que aparece na linha do tempo.
   - Contador de não lidas por conversa, zerado ao abrir; abrir também marca as mensagens recebidas como lidas na Uazapi.
7. **Contatos** — identificados pelo telefone. O JID pode chegar como número (`@s.whatsapp.net`) ou como LID (`@lid`); o contato guarda ambos quando conhecidos (`sender_pn` e `sender_lid`) para não duplicar a mesma pessoa. Nome inicial vem de `senderName`; foto via avatar da Uazapi (URL temporária, renovada quando necessário). Campos editáveis fixos: nome, e-mail, empresa, observação. Sem campos personalizados.
8. **Notas internas** — pertencem a uma conversa (e, por ela, ao contato), com autor e horário; nunca passam pelo cliente Uazapi. A ficha agrega as notas de todas as conversas do contato.
9. **Etiquetas** — pertencem ao contato (nome + cor). Só o admin cria, edita e apaga; qualquer membro aplica e remove. Apagar remove de todos os contatos.
10. **Funis** — vários funis, cada um com etapas ordenadas. Card = vínculo (contato, funil, etapa); um contato tem no máximo um card por funil e pode estar em vários funis. Só o admin gerencia funis e etapas; qualquer membro adiciona, move e remove cards. Apagar uma etapa com cards exige escolher uma etapa de destino. A ordem dos cards dentro da etapa é mantida.
11. **Respostas rápidas** — atalho + texto, compartilhadas pela equipe, gerenciadas só pelo admin. A substituição de `{nome}` acontece ao inserir no campo de mensagem (o atendente vê e pode editar o texto final).
12. **Busca** — índice FTS5 sobre o texto das mensagens (e legendas), mais busca por nome e telefone do contato. Resultados de mensagem levam à conversa posicionada na mensagem.
13. **Tempo real** — o cliente abre um WebSocket com o hub; a sessão é validada no Worker **antes** do upgrade. Toda escrita relevante (mensagem nova, mudança de status de entrega, mudança de status/responsável da conversa, nota, mudança de card, mudança de etiqueta, status da conexão) publica um evento no hub, que faz broadcast para todos. Cada evento traz o que o cliente precisa para decidir se toca som e notificação: conversa sem responsável → todos; com responsável → só ele. Ao reconectar, o cliente busca pela API o que mudou desde o último evento visto.
14. **Conexão do número** — tela do admin com status e QR code (consulta periódica enquanto estiver `connecting`). O evento `connection` do webhook e o cron de 5 minutos atualizam um estado de conexão no D1 e publicam no hub; o front mostra a faixa vermelha para todos quando não estiver `connected`. O pareamento usa `history_days: 0` (sem importar histórico).
15. **Reconciliação** — no cron, busca na Uazapi as mensagens recebidas desde o último evento processado (janela curta, com margem) e ingere pelo mesmo caminho idempotente do webhook. Consulta limitada e indexada para não varrer tabelas grandes. Também reenfileira mídias "pendentes" antigas cujo job não terminou.
16. **Autenticação e permissões** — Better Auth com e-mail e senha sobre D1/Drizzle, instanciado por requisição (o binding do D1 só existe dentro do handler), com `nodejs_compat`. Sem cadastro público. Convite e redefinição de senha são **links de uso único com validade** gerados pelo admin (sem envio de e-mail na v1). O primeiro admin é criado por script de bootstrap. Dois papéis: **admin** e **atendente**, verificados no servidor em cada rota. Remover um membro revoga as sessões dele. Cache de sessão em cookie para não consultar o D1 a cada requisição. Preferência de assinatura por membro (ligada por padrão).

### Contratos externos (Uazapi)

- Autenticação por header `token` (instância); `admintoken` só para operações de administração.
- Mensagens recebidas: evento `messages` com `message.id`, `message.messageid`, `chatid`, `sender`, `senderName`, `fromMe`, `isGroup`, `messageType`, `text`, `messageTimestamp` (ms). O formato exato do payload de mídia não está documentado: **validar com um webhook real antes de fechar o parser**.
- Status: evento `messages_update` com `state` e `event.MessageIDs[]`, `event.Timestamp` em **segundos**.
- Conexão: evento `connection` com `instance.status`, `lastDisconnectReason` e `type` (`Disconnected`, `TemporaryBan`).
- A Uazapi não assina o webhook e não reenvia entregas que falharam; daí a validação dupla, a gravação imediata e a reconciliação.

## Testing Decisions

- **Um bom teste exercita só comportamento externo**: entra por onde o sistema é chamado de verdade (HTTP, webhook, fila, cron, WebSocket) e verifica o que um usuário ou a Uazapi observariam (respostas da API, eventos no WebSocket, chamadas feitas à Uazapi, objetos no R2). Não testa funções internas, formato de tabelas ou chamadas do Drizzle.
- **Costura principal: a borda do Worker.** Testes com `@cloudflare/vitest-pool-workers`, rodando sobre D1, Durable Object, Queues e R2 reais do Miniflare, chamando os handlers de fetch, queue e scheduled. A Uazapi é substituída por um servidor HTTP falso que grava as chamadas recebidas e devolve respostas programadas (incluindo `429`, timeout e erro).
- Cobrir pela borda do Worker:
  - webhook: validação de origem, idempotência (o mesmo evento duas vezes vira uma mensagem), descarte de grupos e de `fromMe`, criação automática de contato e conversa, reabertura de resolvida;
  - pipeline de mídia: sucesso grava no R2, falha temporária faz retry, falha definitiva marca "falhou";
  - envio: assinatura com nome, citação, mídia via URL assinada, "falhou" versus "incerto" e nenhum reenvio automático;
  - status de entrega que não regride;
  - máquina de estados da conversa, incluindo assumir em concorrência (só um vence), transferência e remoção de atendente;
  - permissões por papel em cada rota de admin;
  - convite e redefinição de senha: uso único, expiração e ausência de cadastro aberto;
  - etiquetas, funis e etapas, incluindo apagar etapa com cards e contato em vários funis;
  - respostas rápidas;
  - busca no texto e por nome/telefone;
  - eventos de tempo real e a regra de quem recebe o aviso;
  - cron de conexão e reconciliação recuperando mensagem perdida.
- **Poucos testes E2E com Playwright** no navegador, para os fluxos críticos de ponta a ponta: aceitar convite e entrar; mensagem recebida aparecendo em tempo real em duas sessões; assumir e responder; enviar nota de voz; mover card no kanban. Rodam contra o Worker local com a Uazapi falsa. Pelo menos um cenário em viewport de celular.
- **Prior art:** nenhum. O repositório está vazio; estes testes estabelecem o padrão.

## Out of Scope

- IA de qualquer tipo (sugestão de resposta, resumo, classificação, robô, transcrição de áudio).
- Métricas e relatórios.
- Integrações (Hotmart e outras).
- Roteamento automático de conversas e resposta automática fora do horário.
- Mais de um número de WhatsApp (o modelo de dados não precisa impedir, mas a interface e as regras assumem um só).
- Grupos do WhatsApp.
- Mensagens enviadas direto pelo app do WhatsApp no celular (são ignoradas).
- Importação de histórico anterior à conexão do número.
- Envio de figurinha, localização e contato (são só exibidos quando chegam).
- Editar ou apagar mensagens enviadas.
- Disparos em massa e campanhas.
- Campos personalizados na ficha do contato.
- Envio de e-mail (convites e redefinições são por link copiável).
- Domínio próprio (fica em `workers.dev` por enquanto).
- Multi-tenant ou venda do CRM para terceiros.

## Further Notes

- Custo estimado: cerca de US$ 5 a 9 por mês (Workers Paid mais o armazenamento acumulado no R2), assumindo ~5 mil mensagens por dia e 30% com mídia.
- Riscos conhecidos da API não oficial: o número pode ser banido (`TemporaryBan` no evento `connection`) e a conexão cai de vez em quando. A faixa de alerta e a tela de conexão existem para isso.
- Como mensagens enviadas pelo celular são ignoradas, a conversa no CRM fica incompleta se alguém responder fora dele. A equipe deve ser orientada a responder só pelo CRM.
- Itens não verificados ao vivo durante o levantamento, para conferir na implementação: o formato do payload de mídia no webhook da Uazapi, a validade da URL de avatar, o limite de conexões WebSocket por Durable Object (irrelevante para 10 pessoas) e o custo de CPU do hash de senha do Better Auth.
- Ainda não existem `GLOSSARY.md` nem ADRs. Termos de domínio usados aqui: caixa de entrada, conversa, contato, ficha do contato, atendente, admin, responsável, assumir, transferir, nota interna, resposta rápida, etiqueta, funil, etapa, card, conexão do número.
