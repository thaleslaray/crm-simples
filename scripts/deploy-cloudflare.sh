#!/usr/bin/env bash
# Publica o CRM na Cloudflare: o comando de deploy do Workers Builds (GitHub) e o do terminal.
# Com o banco ja existente, aplica as migracoes antes do deploy (o codigo novo nunca roda sobre o esquema velho).
# Na primeira vez o banco ainda nao existe: o deploy cria o D1, o R2 e as filas (provisionamento automatico pelos nomes
# do wrangler.jsonc) e as migracoes vem logo depois.
set -euo pipefail

if pnpm exec wrangler d1 info DB >/dev/null 2>&1; then
  pnpm exec wrangler d1 migrations apply DB --remote
  pnpm exec wrangler deploy
else
  echo "Banco D1 ainda nao existe: o deploy vai criar."
  pnpm exec wrangler deploy
  pnpm exec wrangler d1 migrations apply DB --remote
fi
