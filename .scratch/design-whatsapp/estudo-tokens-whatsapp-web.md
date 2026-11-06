# Estudo: tokens de design do WhatsApp Web (2026-11-06)

Fonte: CSS público servido por `static.whatsapp.net` à aba aberta do usuário (97 arquivos: 96 JS, 1 CSS de 1,5 MB). **Não há sourcemaps publicados** (0 referências `sourceMappingURL`). O CSS é atômico (StyleX) e os temas são blocos de variáveis CSS do **WDS — WhatsApp Design System**, com nomes semânticos.

Uso: referência para o CRM ter a mesma *linguagem* (onde fica cada tom, contraste, hierarquia). Não copiar código, arte, ícones ou o desenho do fundo do chat.

## Tokens semânticos que importam para o CRM (claro → escuro)

| Papel (WDS) | Claro | Escuro | Equivalente no CRM |
|---|---|---|---|
| surface-default (painéis) | `#FFFFFF` | `#161717` | `--bg-panel` |
| surface-emphasized / nav-bar (barra de ícones) | `#F7F5F3` | `#1D1F1F` | `--bg-rail` |
| surface-elevated-emphasized | `#F7F5F3` | `#242626` | `--bg-active` (escuro) |
| surface-highlight / active-list-row (linha selecionada, hover) | `rgba(194,189,184,.15)` | `rgba(255,255,255,.1)` | `--bg-active` / `--bg-hover` |
| systems-chat-background-wallpaper | `#F5F1EB` | `#161717` | `--bg-chat` |
| systems-chat-foreground-wallpaper (traço do desenho) | `#EAE0D3` | `rgba(255,255,255,.1)` | `--doodle-stroke` |
| systems-chat-surface-composer | `#FFFFFF` | `#242626` | campo de mensagem |
| systems-bubble-surface-incoming | `#FFFFFF` | `#242626` | `--bubble-in` |
| systems-bubble-surface-outgoing | `#D9FDD3` | `#144D37` | `--bubble-out` |
| systems-bubble-surface-system (pílula de data) | `rgba(255,255,255,.9)` | `#1D1F1F` | `--pill-event` |
| content-default (texto) | `#0A0A0A` | `#FAFAFA` | `--text` |
| content-deemphasized (secundário) | `rgba(0,0,0,.6)` | `rgba(255,255,255,.6)` | `--text-2` |
| content-action-emphasized / external-link (verde de texto) | `#1B8755` | `#21C063` | `--green-text` |
| accent / persistent-always-branded (verde da marca) | `#1DAA61` | `#21C063` | `--green-strong` |
| content-read (tique lido) | `#007BFC` | `#53BDEB` | `--tick-read` |
| lines-divider | `rgba(0,0,0,.1)` | `rgba(255,255,255,.1)` | `--divider` |
| components-filter-surface-selected (filtro ativo) | `#D9FDD3` | `#424445` | `--filter-on-bg` |
| secondary-negative (erro/faixa vermelha) | `#EA0038` | `#FB5061` | `--danger-bar` |
| secondary-warning-deemphasized | `#FFF7E5` | `#362C1F` | base possível para nota interna |
| content-disabled | `#BDBDBD` | `#424445` | botões desabilitados |

Observações:
- O claro é **quente** (bege: `#F7F5F3`, `#F5F1EB`, realce `rgba(194,189,184,.15)`); o escuro é **grafite neutro** (`#161717`/`#1D1F1F`/`#242626`). Nem azulado (CRM antigo) nem esverdeado (ramo `design/cores-whatsapp-novo`).
- Transparências (`rgba`) para realce, divisória e texto secundário: funcionam sobre qualquer fundo, nos dois temas.
- Filtro ativo: verde-claro no claro, cinza `#424445` no escuro.
- Cores de avatar sem foto: pares fundo/conteúdo por cor (ex.: verde `#D9FDD3`/`#1B8755`), em vez de iniciais brancas sobre cor forte.

## Movimento e raios (base Meta)
- Duração rápida 250 ms; curvas `cubic-bezier(.6,0,.1,1)` (orgânica) e `cubic-bezier(.1,1,.36,1)` (resposta).
- Raios: linha de lista 10px, chip 100px (pílula), botão médio 18px, diálogo 32px.
