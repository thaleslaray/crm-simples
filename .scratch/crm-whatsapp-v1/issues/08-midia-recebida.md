# 08: Mídia recebida

**What to build:** quando o cliente manda imagem, vídeo, áudio, nota de voz, documento, figurinha, localização ou contato, a conversa exibe cada um de forma adequada: imagens e vídeos visíveis, áudios tocáveis, documentos baixáveis. Enquanto o arquivo é baixado aparece "carregando"; se falhar de vez, aparece um aviso. As mídias ficam disponíveis por um ano. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** ready-for-agent

- [ ] **Antes do parser:** capturar um webhook real de mídia da Uazapi e registrar o formato (a doc não o documenta)
- [ ] Mensagem com mídia é gravada como "pendente" e um job com o id vai para a fila
- [ ] Consumer chama `/message/download` e faz stream para o R2 sem bufferizar o arquivo inteiro
- [ ] Retries da fila; após esgotar, DLQ e mídia "falhou"
- [ ] Regra de ciclo de vida do R2 apaga objetos com mais de 365 dias; mídia expirada mostra "mídia expirada"
- [ ] Mídia servida ao front só para usuários com sessão
- [ ] Figurinha, localização e contato exibidos (sem envio)
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
