# 05: Campanhas e link do WhatsApp

**What to build:** tela Campanhas em Configurações (só admin): nome, produto e canal (Meta, Google, Instagram, TikTok, Outro). O CRM gera o código (3 letras do produto + `-` + letra do canal + 2 dígitos, único) e a mensagem padrão "Oi! Quero saber do <produto> #<código>", editável. Mostra o link `https://wa.me/<número>?text=<mensagem>` com copiar e QR code. Arquivar. Aviso "Crie um funil antes" se não houver funil com etapa. Spec: histórias 15–17.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Migração `campaign`
- [ ] Gerador de código (testes de colisão e acentos)
- [ ] Número do link: descobrir de onde vem o número conectado (status da instância Uazapi); se não houver, mostrar o aviso de conectar o número
- [ ] QR code gerado no navegador, sem serviço externo
- [ ] Testes de borda + E2E (criar campanha, copiar link)

## Comments
