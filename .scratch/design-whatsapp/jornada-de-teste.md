# Jornada de teste: um dia no CRM

Roteiro para testar o sistema inteiro como o Thales (admin) e como um atendente (Bruno). Cada passo diz o que fazer e o que deve acontecer. Marque `[x]` quando passar; anote o que falhar logo abaixo do passo.

## Antes de começar

Ambiente de teste local (não toca no WhatsApp de verdade):

- Subir: `crm-teste-uazapi` e `crm-teste` no `.claude/launch.json` (CRM em http://localhost:5190, Uazapi falsa na 4020).
- Login do admin: `admin@teste.com` (senha em `.wrangler/demo/app.ts`).
- Cliente mandando mensagem:

```bash
pnpm exec tsx .wrangler/demo/clientes.ts "Nome do Cliente" 5511900000000 "texto da mensagem"
```

- Número caindo / voltando:

```bash
curl -s -X POST http://127.0.0.1:5190/api/webhook/segredo-webhook-demo -H 'content-type: application/json' -d '{"EventType":"connection","token":"token-instancia-demo","instance":{"status":"disconnected"},"type":"Disconnected"}'
```

```bash
curl -s -X POST http://127.0.0.1:5190/api/webhook/segredo-webhook-demo -H 'content-type: application/json' -d '{"EventType":"connection","token":"token-instancia-demo","instance":{"status":"connected"}}'
```

## Parte 1: Thales (admin), manhã

### 1. Entrar e se situar
- [ ] O login mostra o nome da empresa no topo do cartão e na aba do navegador.
- [ ] Depois de entrar: barra de ícones à esquerda (Conversas com número de não lidas, Contatos, Funis; embaixo Configurações e minha foto).
- [ ] Lista com o nome da empresa, ⋮ e o "+" redondo; à direita, "Escolha uma conversa à esquerda…".

### 2. Dar nome à empresa
- [ ] Configurações › Empresa: trocar para "Laray Atendimento" e salvar.
- [ ] O título da lista, o estado vazio e a aba do navegador mudam sem recarregar.
- [ ] Apagar o nome inteiro: o botão Salvar fica desabilitado.

### 3. Tema
- [ ] Configurações › Perfil: Escuro deixa tudo escuro (chat quase preto, balões verdes escuros).
- [ ] Claro volta; Automático segue o sistema. Recarregar a página mantém a escolha.

### 4. Arrumar a casa antes do expediente
- [ ] Etiquetas: criar "Orçamento" e "Urgente", com cores diferentes.
- [ ] Respostas rápidas: criar `/preco` com "O plano mensal sai R$ 197." e `/pix` com a chave Pix.
- [ ] Funis e etapas: criar o funil "Vendas" com Novo › Proposta › Fechado.
- [ ] Equipe: convidar o Bruno como atendente e guardar o link do convite.
- [ ] Conexão do número: aparece conectado.

### 5. Chega cliente
- [ ] Simular "Fernanda Rocha" mandando "Oi, quanto custa o plano?".
- [ ] Ela aparece no topo da lista sem recarregar, com hora verde, contador verde, pílula laranja "Aberta" e "sem dono".
- [ ] O número da barra de ícones e o "(N)" da aba sobem.
- [ ] Chips: "Sem dono" e "Não lidas" contam ela; clicar em cada chip filtra.

### 6. Atender
- [ ] Abrir a Fernanda: balão branco à esquerda, fundo bege com desenhos, data "Hoje" em pílula.
- [ ] Cabeçalho: foto ou iniciais, nome, "Aberta", "sem dono" e o botão verde "Assumir". O ⋮ tem Ver ficha do contato e Atribuir a… (sem vídeo nem chamada).
- [ ] Assumir: o botão vira "Resolver", a pílula vira azul "Em andamento", aparece o evento "Thales assumiu a conversa".
- [ ] No campo, digitar `/pre`: a lista de respostas rápidas abre acima e filtra; Enter põe o texto no campo.
- [ ] Enviar: balão verde à direita com "Thales" em cima, hora e tique. A conversa vira "Aguardando cliente".
- [ ] Enviar uma segunda mensagem seguida: o nome não se repete no segundo balão.
- [ ] Na lista, a prévia mostra o tique e o texto enviado.

### 7. Nota interna
- [ ] Clicar no cadeado: o campo fica amarelo e aparece "Nota interna: só a equipe vê. O cliente não recebe."
- [ ] Escrever "Cliente veio do Instagram" e enviar: balão amarelo centralizado com 🔒, "nota interna, o cliente não vê". Nada vai para a Uazapi.

### 8. Ficha do contato
- [ ] Clicar no nome no cabeçalho: abre a coluna "Dados do contato" à direita e o chat estreita.
- [ ] Pôr a etiqueta "Orçamento", colocar no funil Vendas (etapa Novo), preencher e-mail e uma nota do contato.
- [ ] A lista mostra a etiqueta na terceira linha.
- [ ] Trocar de conversa: a ficha continua aberta. Recarregar: continua aberta. Fechar no X: continua fechada ao recarregar.

### 9. Cliente responde, anexo e resolver
- [ ] Simular a Fernanda: "Fechado, me manda o Pix". A conversa volta para "Em andamento".
- [ ] "+" do campo mostra Fotos e vídeos, Documento e Câmera.
- [ ] Responder com `/pix`, depois clicar em "Resolver": pílula cinza "Resolvida" e nenhum botão de ação.
- [ ] Simular a Fernanda de novo ("Paguei!"): a conversa reabre sozinha como "Em andamento", com o mesmo responsável.

### 10. Funis
- [ ] Funis: chip "Vendas", colunas Novo/Proposta/Fechado com contagem, fundo com desenhos.
- [ ] O card da Fernanda tem foto/iniciais, nome, hora, prévia, status e etiqueta. Clicar abre a conversa.
- [ ] Arrastar o card para "Proposta" e depois "Fechado".

### 11. Contatos
- [ ] Contatos: buscar "Fern", filtrar pelo chip "Orçamento".
- [ ] Abrir a Fernanda: ficha à direita com "Abrir conversa", que leva ao chat.

### 12. O número cai
- [ ] Simular a queda: faixa vermelha "WhatsApp desconectado: as mensagens não estão chegando." no topo, em qualquer tela, com "Reconectar".
- [ ] "Reconectar" leva à Conexão do número.
- [ ] Simular a volta: a faixa some.

## Parte 2: Bruno (atendente), à tarde

### 13. Entrar pelo convite
- [ ] Abrir o link do convite em outra janela (anônima), criar a senha e entrar.
- [ ] Configurações só tem Respostas rápidas, Perfil e Sair. `/equipe` digitado à mão não abre.

### 14. Dividir o trabalho
- [ ] Simular um cliente novo, "Ricardo Melo": o Bruno vê em "Sem dono" e assume.
- [ ] Na janela do Thales, a conversa do Ricardo mostra "com Bruno" sem recarregar.
- [ ] O Bruno responde: na lista do Thales, a prévia mostra "Bruno: …"; no chat, o balão verde tem "Bruno" em outra cor.
- [ ] O Thales usa "Atribuir a…" numa conversa sem dono para o Bruno; ela aparece em "Minhas" para o Bruno.
- [ ] O Bruno transfere uma conversa para o Thales pelo ⋮.

### 15. A faixa para o atendente
- [ ] Com o número caído, o Bruno vê a faixa vermelha mas sem o botão "Reconectar".

## Parte 3: no celular (375px)

### 16. Celular
- [ ] Abas embaixo: Conversas (com número), Contatos, Funis, Mais. Mais abre Configurações.
- [ ] Abrir uma conversa: tela cheia, seta de voltar, sem abas. Placeholder curto "Mensagem ou /".
- [ ] Abrir a ficha: tela cheia; a seta volta ao chat.
- [ ] Funis: colunas de quase a tela toda, rolando de lado.
- [ ] Configurações: lista → item → voltar.
- [ ] Tema escuro no celular.

## Resultado

Anote aqui a data, quem testou e o que falhou.

### 2026-10-28: Claude, no ambiente de teste local (main em 76c045d)

Partes 1 a 3 rodadas inteiras. A Parte 1 rodou no navegador do app; as Partes 2 e 3 rodaram num navegador separado (Playwright), com o Bruno e o celular. Todos os passos passaram, menos os achados abaixo.

**Defeitos**
- Configurações › Conexão do número: o subtítulo diz sempre "WhatsApp conectado", mesmo com o número caído. O texto é fixo em `src/web/pages/SettingsLayout.tsx:23`.
- Contatos: a faixa de chips de etiqueta fica cortada à esquerda ("…dos" em vez de "Todos") quando uma etiqueta à direita está ativa.
- Contatos: a lista mostra o telefone cru (`5511912340010`), e a ficha mostra o formatado (`+55 11 91234-0010`).
- Seletores sem nome legível para leitor de tela: o botão "Assumir" do cabeçalho, o botão Sair da lista de Configurações e os rádios do tema, que se chamam `light`/`dark`/`auto`.
- O título da aba pisca "Atendimento" a cada navegação antes de mostrar o nome da empresa.

**Para decidir (comportamento da v1)**
- Enter quebra a linha e Ctrl/Cmd+Enter envia. No WhatsApp Web é o contrário.
- A ficha, aberta dentro de uma conversa em andamento, mostra o botão "Iniciar conversa".

**Correção desta jornada:** ao reabrir, a conversa volta para "Em andamento" com o mesmo responsável (v1, história 70), não para "Aberta". O passo 9 foi corrigido.
