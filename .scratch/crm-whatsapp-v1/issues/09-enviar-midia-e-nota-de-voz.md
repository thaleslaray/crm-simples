# 09: Enviar mídia e nota de voz

**What to build:** o atendente anexa imagem, vídeo ou documento com legenda opcional e envia; ou grava uma nota de voz no navegador (computador ou celular), ouve, descarta ou envia, e ela chega ao cliente como áudio de voz do WhatsApp. No celular, pode anexar foto direto da câmera. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 03 (Responder com texto), 08 (Mídia recebida)

**Status:** ready-for-agent

- [ ] Arquivo enviado pelo atendente é gravado no R2 e entregue à Uazapi por URL temporária assinada servida pelo Worker
- [ ] Legenda recebe a assinatura `*Nome:*` quando ligada; nota de voz vai sem legenda
- [ ] Nota de voz enviada como `ptt`, com prévia e descarte antes de enviar
- [ ] Mesmos estados de envio da fatia 03 (enviando, falhou, incerto)
- [ ] E2E: gravar e enviar nota de voz
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
