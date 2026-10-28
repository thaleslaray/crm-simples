# 01: Tokens, tema e casca de navegação

**What to build:** a base visual do WhatsApp Web em todo o CRM. Variáveis de cor claras e escuras, fonte do sistema e ícones `lucide-react`. O tema segue o sistema, e no Perfil dá para fixar Claro, Escuro ou Automático. No computador há uma barra de ícones à esquerda; no celular, abas embaixo. A faixa de desconexão aparece acima de tudo, com "Reconectar" só para o admin. As telas atuais passam a viver dentro dessa casca, ainda com o miolo antigo. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). Histórias 1–3, 5–9.

**Blocked by:** None

**Status:** done

- [x] Tokens claros e escuros em `:root` e `:root[data-theme="dark"]` (valores da spec), com `body` usando os tokens
- [x] `data-theme` resolvido no carregamento: `localStorage` `crm.theme` (`auto`/`light`/`dark`), e no automático segue `prefers-color-scheme`, reagindo à troca do sistema
- [x] Perfil: seletor Claro / Escuro / Automático
- [x] `lucide-react` instalado; fonte do sistema
- [x] Barra de ícones no desktop: Conversas (com o total de não lidas), Contatos e Funis em cima; Configurações e a foto do membro embaixo; item ativo destacado
- [x] Abas no celular (<768px): Conversas (com o total), Contatos, Funis e Mais (abre Configurações); escondidas dentro do chat e da ficha
- [x] Faixa vermelha de desconexão acima de tudo, em todas as telas; "Reconectar" leva a `/conexao` e aparece só para o admin
- [x] E2E: tema escuro pelo sistema, escolha do Perfil vencendo o sistema, abas no celular, faixa com e sem "Reconectar"
- [x] Prints em desktop e celular, nos temas claro e escuro

## Comments

2026-10-28: tokens claros/escuros em `src/web/styles.css` (nomes antigos `--bg/--fg/--card/--brand...` ligados aos tokens novos); tema em `src/web/theme.ts` (`initTheme` no `main.tsx`, seletor no Perfil); casca em `src/web/shell.tsx` (`AppShell`, barra de ícones `Rail`, abas `TabBar`, total de não lidas via `useUnreadTotal`); faixa em `connection.tsx` com "Reconectar" para admin. Configurações aponta para `/perfil` por enquanto (a lista de Configurações vem em outro ticket). Links Contatos/Funis saíram do cabeçalho antigo da caixa. E2E novo: `e2e/casca.spec.ts`; suíte completa 54 passaram, 2 puladas (testes só de um dos projetos).
