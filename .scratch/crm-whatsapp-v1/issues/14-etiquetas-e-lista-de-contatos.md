# 14: Etiquetas e lista de contatos

**What to build:** o admin cria, renomeia, colore e apaga etiquetas; qualquer membro aplica e remove etiquetas existentes num contato pela ficha. As etiquetas aparecem na caixa de entrada e servem de filtro. Uma lista de contatos permite buscar por nome ou telefone e filtrar por etiqueta. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 11 (Ficha do contato e notas internas)

**Status:** done

- [x] Etiquetas pertencem ao contato (nome + cor); só admin cria, edita e apaga
- [x] Apagar uma etiqueta a remove de todos os contatos
- [x] Aplicar e remover na ficha; etiquetas visíveis na caixa de entrada
- [x] Filtro por etiqueta na caixa de entrada
- [x] Lista de contatos com busca por nome/telefone e filtro por etiqueta
- [x] Mudanças publicadas no hub
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-27: Implementado. Tabelas novas `label` (nome único sem diferenciar maiúsculas, cor `#rrggbb`) e `contact_label` (FK em cascata: apagar a etiqueta a tira de todos os contatos); migração 0013 só cria tabelas (FTS intacto). API: `/api/labels` (admin escreve), `PUT/DELETE /api/contacts/:id/labels/:labelId` (qualquer membro), `GET /api/contacts?q=&label=`, `GET /api/conversations?label=`; `contact.labels` na caixa, na ficha e nas buscas. Hub: `contact.updated` + `conversation.updated` ao aplicar/remover e `labels.changed` quando o admin cria/edita/apaga. Telas: `/etiquetas` (admin), `/contatos`, etiquetas na ficha e na caixa, filtro por etiqueta. Testes de borda (12) e E2E `etiquetas.spec.ts` (desktop e celular) verdes; prints conferidos. Só `avisos.spec.ts` falhou no E2E (conserto à parte).
