# 02: Receber mensagem de texto

**What to build:** quando um cliente manda uma mensagem de texto para o número, ela aparece no CRM: a conversa surge na caixa de entrada (nome ou telefone, prévia, horário) e, ao abri-la, o atendente vê o histórico de texto em ordem, carregando as mais antigas ao rolar para cima. O contato é criado sozinho com o nome do WhatsApp. Mensagens de grupo e `fromMe` não aparecem. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 01 (Esqueleto e login)

**Status:** done

- [x] Rota de webhook valida o `token` do corpo contra o secret da instância **e** o segredo na URL; chamada inválida é recusada
- [x] O evento cru é gravado e a rota responde 200 imediatamente; o payload completo nunca é logado
- [x] Processamento idempotente por `message.id` (guardando também `messageid`): o mesmo evento duas vezes gera uma mensagem só
- [x] Mensagens com `isGroup` e `fromMe` são descartadas
- [x] Contato criado pelo telefone, guardando JID por número e por LID quando conhecidos, sem duplicar a mesma pessoa
- [x] Uma conversa por contato, criada como `aberta` sem responsável
- [x] Caixa de entrada ordenada pela mensagem mais recente; tela da conversa com histórico paginado
- [x] Parser de mídia **não** é escopo aqui, mas mensagens de mídia não quebram a ingestão (ficam como "tipo não suportado ainda")
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

**2026-10-27** — Implementado. Conferido por `pnpm check` (49 testes de borda: validação dupla do webhook, idempotência, descarte de grupo/`fromMe`, contato por número e LID sem duplicar, mídia — inclusive com legenda — como "tipo não suportado ainda", ordem da caixa e paginação do histórico com cursor `timestamp:id`) e por E2E em desktop e celular (375px): 80 mensagens via webhook, conversa no topo da caixa, histórico carrega as antigas ao rolar.

Decisões e pendências para tickets futuros:
- O processamento roda no mesmo request, logo após gravar o evento cru (escritas curtas no D1); falha deixa o evento com `processed_at` nulo e responde 200. Reprocessar esses eventos fica para o 19 (reconciliação).
- Se número e LID já pertencerem a dois contatos distintos, não há fusão (caso raro, fora de escopo).
- O nome do contato só é preenchido quando vazio; mudanças de nome no WhatsApp não sobrescrevem (a ficha é editável no 11).
- Caixa de entrada limitada às 200 conversas mais recentes, sem paginação da lista; revisar com filtros (05) ou busca (16).
- O formato real de `messageType` da Uazapi ainda não foi validado ao vivo; a comparação ignora maiúsculas. Validar no 08 (mídia).
- Harness: o E2E agora gera config e `.dev.vars` próprios em `.wrangler/e2e-config/` — antes ele herdava o `.dev.vars` de desenvolvimento (inclusive `UAZAPI_BASE_URL`), que tem precedência sobre as variáveis do processo.
