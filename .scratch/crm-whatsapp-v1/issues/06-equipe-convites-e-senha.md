# 06: Equipe: convites, papéis e redefinição de senha

**What to build:** o admin gera um link de convite de uso único e com validade, escolhendo o papel, e o envia por onde quiser; o convidado abre o link, define nome, e-mail e senha e entra. O admin vê a lista de membros, muda papéis, remove membros e gera links de redefinição de senha. Remover um membro encerra as sessões dele e devolve as conversas em andamento dele para "aberta". Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 05 (Status e responsável)

**Status:** ready-for-agent

- [ ] Convite: link de uso único com validade e papel definido; link vencido ou usado mostra mensagem clara
- [ ] Redefinição de senha por link de uso único com validade, gerado pelo admin
- [ ] Lista de membros com nome, e-mail e papel; troca de papel
- [ ] Remover membro revoga sessões imediatamente e devolve suas conversas `em_andamento` para `aberta` sem dono
- [ ] Conversa resolvida de membro removido reabre como `aberta` quando o cliente escreve
- [ ] Todas as rotas de admin recusam atendentes (teste por rota)
- [ ] E2E: aceitar convite e entrar
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
