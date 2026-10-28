# 11: Ficha do contato e notas internas

**What to build:** ao lado da conversa (ou numa aba, no celular), o atendente vê a ficha do contato: foto, telefone (não editável), nome, e-mail, empresa e observação editáveis, e o histórico de conversas do contato. Dentro da conversa, ele escreve notas internas, que aparecem na linha do tempo com visual diferente, autor e horário, nunca vão para o cliente e ficam reunidas na ficha. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 05 (Status e responsável)

**Status:** done

- [x] Foto via avatar da Uazapi, renovada quando a URL temporária expirar
- [x] Campos editáveis fixos: nome, e-mail, empresa, observação; telefone somente leitura
- [x] Histórico de conversas do contato com status e responsáveis
- [x] Notas internas na linha do tempo, visualmente distintas, com autor e horário
- [x] Teste garante que nota interna nunca gera chamada à Uazapi
- [x] Ficha agrega as notas de todas as conversas do contato
- [x] Notas e edições publicadas no hub
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-27: implementado pela borda (`test/ficha.test.ts`, 16 testes) e E2E `e2e/ficha-e-notas.spec.ts` (desktop e celular, prints conferidos).
- Migração 0011: tabela `conversation_note` e `ADD COLUMN` em `contact` (email, company, notes, avatar_url, avatar_fetched_at). `contact` nao foi recriada: gatilhos FTS5 intactos (o gatilho de nome continua valendo na edição).
- Rotas: `GET/POST /api/conversations/:id/notes`, `GET/PATCH /api/contacts/:id`, `POST /api/contacts/:id/avatar/refresh`. Nota interna nao passa por `send.ts`: nao chama a Uazapi nem muda status.
- Foto: `getAvatar` no cliente Uazapi (`POST /chat/details`, formato nao validado com a Uazapi real). Renovada ao abrir a ficha se tem mais de 12h e, sob demanda, quando a imagem quebra no navegador. Se a Uazapi falha, mantem a foto antiga.
- Tempo real: `note.created` e `contact.updated` (+ `conversation.updated` para o nome na lista).
- Ficha agrega notas de todas as conversas do contato (hoje 1 conversa por contato). Etiquetas e funis na ficha ficam para os tickets deles. Foto na lista de conversas (story 22) nao feita aqui.
