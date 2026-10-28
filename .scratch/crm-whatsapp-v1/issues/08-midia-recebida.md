# 08: Mídia recebida

**What to build:** quando o cliente manda imagem, vídeo, áudio, nota de voz, documento, figurinha, localização ou contato, a conversa exibe cada um de forma adequada: imagens e vídeos visíveis, áudios tocáveis, documentos baixáveis. Enquanto o arquivo é baixado aparece "carregando"; se falhar de vez, aparece um aviso. As mídias ficam disponíveis por um ano. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 02 (Receber mensagem de texto)

**Status:** ready-for-human

- [ ] **Antes do parser:** capturar um webhook real de mídia da Uazapi e registrar o formato (a doc não o documenta)
- [x] Mensagem com mídia é gravada como "pendente" e um job com o id vai para a fila
- [x] Consumer chama `/message/download` e faz stream para o R2 sem bufferizar o arquivo inteiro
- [x] Retries da fila; após esgotar, DLQ e mídia "falhou"
- [ ] Regra de ciclo de vida do R2 apaga objetos com mais de 365 dias; mídia expirada mostra "mídia expirada"
- [x] Mídia servida ao front só para usuários com sessão
- [x] Figurinha, localização e contato exibidos (sem envio)
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

**2026-10-27** — Implementado, com dois itens para humano (por isso `ready-for-human`). `pnpm check` verde (64 testes de borda) e E2E em desktop e celular.

Feito: webhook grava mídia como "pendente" e enfileira o id; o consumer chama `/message/download`, abre o link do arquivo (sem enviar o token) e grava no R2 em stream (direto com `content-length`, multipart de 5 MiB sem ele); retries com espera crescente, na 6ª tentativa marca "falhou" e devolve o job à fila (DLQ); `GET /api/media/:id` exige sessão, aceita `Range` (áudio/vídeo) e força download em tipos ativos (html, svg); objeto ausente no R2 vira "mídia expirada" (410 na rota). Imagem, vídeo, áudio, nota de voz, documento, figurinha, localização e contato aparecem na conversa; "carregando" atualiza sozinho por polling (3 s) até o WebSocket chegar.

Pendente para humano:
- **Capturar um webhook real de mídia da Uazapi.** O parser lê `message.mediaType` (ou `messageType` "ImageMessage" etc., sem diferenciar caixa) e `message.content.{mimetype,fileLength,fileName,caption,PTT}`, localização em `content.degreesLatitude/degreesLongitude/name/address` e contato em `content.displayName/vcard`; tudo isso vem da memória da doc, NÃO de um payload real. O corpo de `/message/download` (`id`, `return_link`) e a resposta (`fileURL`, `mimetype`) também. Se o real diferir, ajustar `parse()` em `src/worker/ingest.ts` e `downloadMedia` em `src/worker/uazapi/client.ts` (e os helpers de `test/helpers/webhook.ts`).
- **Regra de ciclo de vida do R2** (365 dias) é config da conta, não do código: comando no README (passo 3 do deploy).

Para tickets futuros: reenfileirar mídias "pendentes" antigas é da reconciliação (15); tempo real via WebSocket substitui o polling; envio de mídia (spec item 4) segue a ficha própria.
