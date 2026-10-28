# 04: Tempo real

**What to build:** com duas pessoas logadas, uma mensagem que chega aparece para as duas na caixa de entrada e na conversa aberta, sem recarregar. Se a internet cair e voltar, o app se reconecta e se atualiza com o que perdeu. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** done

- [x] Um Durable Object único ("hub da caixa de entrada") mantém os WebSockets com Hibernation
- [x] Sessão validada no Worker antes do upgrade; sem sessão válida, o upgrade é recusado
- [x] Mensagem recebida e mensagem enviada publicam eventos no hub, que faz broadcast (recebida feito; enviada: ver nota, depende do ticket 03)
- [x] O hub não guarda estado de negócio; ao reconectar, o cliente busca pela API o que mudou desde o último evento visto
- [x] E2E com duas sessões vendo a mesma mensagem chegar

## Comments

2026-10-27: feito. `GET /api/realtime` (requireAuth antes do upgrade; sem sessão, 401) leva ao `InboxHub` (Hibernation, ping/pong automático, `publish()` por RPC). Webhook publica `message.created` com a conversa completa (inclui `assigneeId`, base da regra de aviso dos tickets 17) e a mensagem, só quando a mensagem é nova. `GET /conversations/:id/messages?after=<cursor>` devolve o que veio depois da última vista; o front reconecta com backoff, no `online` e ao voltar à aba, e se ressincroniza (lista inteira e `after` na conversa aberta). Testes de borda em `test/realtime.test.ts`; E2E `e2e/tempo-real.spec.ts` (desktop e celular).
Para o ticket 03: o envio ainda não existe nesta branch; ao gravar a mensagem enviada, chamar `publish(env, { type: "message.created", conversation, message })` de `src/worker/realtime.ts` (o tipo `Message.direction` hoje só aceita "in"). Outros tipos de evento (status, responsável, nota, conexão) entram nos tickets deles ampliando `RealtimeEvent`. Reconexão após queda não tem E2E (Playwright não derruba um WebSocket aberto de forma confiável); ficou só o código.
