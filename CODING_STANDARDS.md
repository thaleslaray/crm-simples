# Padrões de código

Lido na revisão. Cada regra aqui é julgamento; o que é mecânico já está em `pnpm check` (typecheck e `scripts/lint-tests.ts`).

## Testes

- **Borda do Worker.** Todo teste entra por onde o sistema é chamado de verdade (HTTP, webhook, fila, cron, WebSocket) e confere só o que um usuário ou a Uazapi observariam: resposta da API, evento no WebSocket, chamada registrada na Uazapi falsa, objeto no R2. Prova de "não aconteceu" também vem pela borda (login seguinte falha, rota responde 401/403), não por contagem de linhas.
- Um comportamento por teste, com nome que descreve o comportamento em português.
- Arrange que precisa tocar o banco fica em `test/helpers/`, com nome de domínio (`createUser`, `setUserRole`).

## Domínio

- Vocabulário da spec (`.scratch/crm-whatsapp-v1/spec.md`): caixa de entrada, conversa, contato, ficha do contato, atendente, admin, responsável, assumir, transferir, nota interna, resposta rápida, etiqueta, funil, etapa, card, conexão do número. Mesmo termo no código, nos testes e nas mensagens de erro.
- Papel e permissão são decididos no servidor, por `requireAuth` / `requireRole` em `src/worker/middleware.ts`. Toda rota de admin passa por `requireRole("admin")`.
- Rotas que dependem de o membro ainda existir ou ainda ter o papel (remover membro, mudar papel) releem a sessão do D1; o cookie cache de 60 s só serve para leitura comum.

## Segurança

- Payload do webhook e headers com `token` nunca vão para log.
- Segredos só via `env` (secrets do Worker); nada de segredo em código, teste E2E ou argumento de linha de comando.
- Envio à Uazapi que deu timeout fica "incerto" e não é reenviado automaticamente.

## Estilo

- Comentários em português, curtos, explicando o porquê; o código ao redor dita a densidade.
- Abstração entra quando o ticket atual precisa dela, não antes.
