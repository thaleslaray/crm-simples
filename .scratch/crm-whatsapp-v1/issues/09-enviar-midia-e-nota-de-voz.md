# 09: Enviar mídia e nota de voz

**What to build:** o atendente anexa imagem, vídeo ou documento com legenda opcional e envia; ou grava uma nota de voz no navegador (computador ou celular), ouve, descarta ou envia, e ela chega ao cliente como áudio de voz do WhatsApp. No celular, pode anexar foto direto da câmera. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto), 08 (Mídia recebida)

**Status:** done

- [x] Arquivo enviado pelo atendente é gravado no R2 e entregue à Uazapi por URL temporária assinada servida pelo Worker
- [x] Legenda recebe a assinatura `*Nome:*` quando ligada; nota de voz vai sem legenda
- [x] Nota de voz enviada como `ptt`, com prévia e descarte antes de enviar
- [x] Mesmos estados de envio da fatia 03 (enviando, falhou, incerto)
- [x] E2E: gravar e enviar nota de voz
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

**2026-10-27** — Implementado. Testes de borda em `test/send-media.test.ts` (imagem com legenda assinada, link assinado recusa adulteração/vencimento/outra mensagem, documento com `docName`, legenda sem assinatura, nota de voz `ptt` sem legenda, falhou + reenvio manual com novo link, timeout incerto, validações e 401/404) e E2E `e2e/enviar-midia.spec.ts` em desktop e celular (anexo com legenda; gravar, ouvir, descartar, gravar de novo e enviar nota de voz com microfone falso do Chromium).

Decisões e pendências:
- Reaproveita `sendOutgoingText` (`src/worker/send.ts`): a mesma função grava "enviando", chama a Uazapi e define sent/failed/uncertain; só muda a chamada (`/send/media`).
- Arquivo vai ao R2 em `out/<id da mensagem>`; a Uazapi busca em `GET /api/files/:id?exp&sig` (HMAC com `BETTER_AUTH_SECRET`, validade de 1 h, só mensagens de saída, sem sessão). Reenvio gera link novo. `serveMedia` (Range, CSP) foi extraído de `media.ts` e é compartilhado.
- Teto de 20 MB por anexo (o arquivo passa pela memória do Worker); acima disso 413.
- Nota de voz: o navegador grava ogg/opus quando suporta, senão webm/opus (Chrome) ou mp4 (Safari). Não validado ao vivo se a Uazapi converte webm/mp4 para ogg no `ptt`: conferir com um envio real.
- Formato do corpo de `/send/media` (`type`, `file`, `text`, `docName`) segue a documentação da Uazapi; confirmar com a instância real.
- Bolha "enviando" de mídia é só texto/ícone até a resposta; sem barra de progresso de upload.
