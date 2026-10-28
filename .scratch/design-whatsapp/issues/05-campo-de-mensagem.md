# 05: Campo de mensagem

**What to build:** o campo arredondado do WhatsApp. O "+" abre os anexos (fotos e vídeos, documento, câmera). O cadeado liga o modo nota, que deixa o campo amarelo e mostra uma dica. Digitar "/" abre as respostas rápidas acima do campo. O microfone grava a voz e vira enviar quando há texto. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 24–26.

**Blocked by:** 04 (Conversa: cabeçalho e balões)

**Status:** done

- [x] Layout: "+", cadeado, texto que cresce até ~5 linhas, microfone/enviar
- [x] "+" abre o menu de anexos e usa o envio de mídia atual
- [x] Cadeado liga/desliga o modo nota: campo amarelo, dica "Nota interna: só a equipe vê. O cliente não recebe.", placeholder próprio; enviar grava nota
- [x] "/" no início abre as respostas rápidas acima do campo, filtrando pelo atalho e pelo texto; setas e Enter escolhem; Esc fecha
- [x] Rascunho, citação e nota de voz continuam como hoje
- [x] Celular: placeholders curtos ("Mensagem ou /", "Nota para a equipe")
- [x] E2E: o modo nota grava nota e não envia ao cliente; "/" filtra e insere; o microfone vira enviar
- [x] Prints em desktop e celular, nos temas claro e escuro

## Comments

2026-10-28: campo de mensagem em pílula (`.composer-pill`): "+" (`AttachMenu`, menu com Fotos e vídeos, Documento, Câmera, reaproveita o envio de mídia), cadeado (botão "Nota interna" com `aria-pressed`; modo nota deixa a pílula amarela via `--composer-note`, mostra a dica e troca o placeholder), "/" com respostas rápidas acima do campo (setas, Enter, Esc), microfone que vira enviar (botão "Enviar"/"Salvar nota"). Placeholders curtos no celular (<768px). O formulário passou para dentro de `.chat-surface` (o fundo do chat aparece atrás). Rascunho, citação e nota de voz iguais. Nome do textarea no modo nota: "Texto da nota"; E2E `conversa`, `ficha-e-notas` e `enviar-midia` ajustados; novo `e2e/campo-de-mensagem.spec.ts`.
