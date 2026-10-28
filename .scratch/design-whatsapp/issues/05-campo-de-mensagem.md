# 05: Campo de mensagem

**What to build:** o campo arredondado do WhatsApp. O "+" abre os anexos (fotos e vídeos, documento, câmera). O cadeado liga o modo nota, que deixa o campo amarelo e mostra uma dica. Digitar "/" abre as respostas rápidas acima do campo. O microfone grava a voz e vira enviar quando há texto. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 24–26.

**Blocked by:** 04 (Conversa: cabeçalho e balões)

**Status:** ready-for-agent

- [ ] Layout: "+", cadeado, texto que cresce até ~5 linhas, microfone/enviar
- [ ] "+" abre o menu de anexos e usa o envio de mídia atual
- [ ] Cadeado liga/desliga o modo nota: campo amarelo, dica "Nota interna: só a equipe vê. O cliente não recebe.", placeholder próprio; enviar grava nota
- [ ] "/" no início abre as respostas rápidas acima do campo, filtrando pelo atalho e pelo texto; setas e Enter escolhem; Esc fecha
- [ ] Rascunho, citação e nota de voz continuam como hoje
- [ ] Celular: placeholders curtos ("Mensagem ou /", "Nota para a equipe")
- [ ] E2E: o modo nota grava nota e não envia ao cliente; "/" filtra e insere; o microfone vira enviar
- [ ] Prints em desktop e celular, nos temas claro e escuro

## Comments
