# 13: Respostas rápidas

**What to build:** o admin cadastra respostas rápidas (atalho e texto). Na conversa, o atendente digita `/`, vê a lista filtrando enquanto digita, escolhe uma, e o texto entra no campo com `{nome}` trocado pelo nome do contato, pronto para editar e enviar. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto)

**Status:** done

- [x] CRUD de respostas rápidas só para admin; atendentes só usam
- [x] Respostas compartilhadas pela equipe
- [x] `/` abre a lista com filtro por atalho e texto
- [x] `{nome}` substituído ao inserir; o texto inserido é editável antes de enviar
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

**2026-10-27** — Implementado. Testes de borda em `test/quick-replies.test.ts` (login obrigatório, atendente recebe 403 ao criar/editar/apagar, admin faz CRUD, equipe vê as mesmas, atalho vazio/repetido, 404) e E2E em desktop e celular (`e2e/respostas-rapidas.spec.ts`: admin cadastra, atendente digita `/`, escolhe, `{nome}` trocado, texto editável).

Decisões: atalho gravado em minúsculas, sem `/` inicial e sem espaços (único). A lista abre quando o campo é só `/consulta`; filtra por atalho e texto; setas/Enter/Esc e toque escolhem. `{nome}` vira o nome do contato (vazio se não houver nome). Migração `0005` só cria a tabela `quick_reply`. Admin gerencia em `/respostas-rapidas` (link na caixa de entrada só para admin).
