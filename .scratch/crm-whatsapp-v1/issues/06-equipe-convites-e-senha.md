# 06: Equipe: convites, papéis e redefinição de senha

**What to build:** o admin gera um link de convite de uso único e com validade, escolhendo o papel, e o envia por onde quiser; o convidado abre o link, define nome, e-mail e senha e entra. O admin vê a lista de membros, muda papéis, remove membros e gera links de redefinição de senha. Remover um membro encerra as sessões dele e devolve as conversas em andamento ou aguardando cliente dele para "aberta". Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 05 (Status e responsável)

**Status:** done

- [x] Convite: link de uso único com validade e papel definido; link vencido ou usado mostra mensagem clara
- [x] Redefinição de senha por link de uso único com validade, gerado pelo admin
- [x] Lista de membros com nome, e-mail e papel; troca de papel
- [x] Remover membro revoga sessões imediatamente e devolve suas conversas `em_andamento` e `aguardando_cliente` para `aberta` sem dono
- [x] Conversa resolvida de membro removido reabre como `aberta` quando o cliente escreve
- [x] Todas as rotas de admin recusam atendentes (teste por rota)
- [x] E2E: aceitar convite e entrar
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-27: implementado test-first (`test/equipe.test.ts`, 26 testes pela borda) e E2E `e2e/equipe.spec.ts` (desktop e celular, prints conferidos).
- Tabela nova `access_link` (migração 0011, só CREATE TABLE): convite e redefinição no mesmo formato, só o hash SHA-256 do token é gravado, validade de 3 dias, uso único por UPDATE atômico.
- Rotas de admin (`teamAdmin` em `members.ts`, sob `/api/admin`, todas `requireRole("admin")`): `POST invites`, `GET members`, `PATCH members/:id` (papel), `DELETE members/:id`, `POST members/:id/reset-link`. Públicas (`access-links.ts`): `GET|POST /api/invites/:token` e `/api/password-resets/:token`; link vencido/usado/inválido responde 410 com `message` pronta para mostrar.
- Remover membro: apaga sessões, devolve conversas `em_andamento`/`aguardando_cliente` a `aberta` sem dono por `releaseConversationsOf` (`status.ts`, publica `conversation.updated` sem evento de linha do tempo) e apaga o usuário (FKs soltam o resto). Resolvidas perdem o dono pela FK e reabrem como `aberta` pelo `reopenOnClientMessage` existente.
- Decisões: o admin não remove nem muda o papel de si mesmo (409), para a equipe não ficar sem admin; redefinir a senha encerra as sessões do membro; aceitar o convite já inicia a sessão. Telas: `/equipe` (admin), `/convite/:token`, `/redefinir-senha/:token`.
- Fora do E2E: redefinição de senha pela UI (coberta pelos testes de API).
