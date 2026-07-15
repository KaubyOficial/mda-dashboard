#!/usr/bin/env bash
# Deploy do Dashboard MDA na VPS (Story 7.1). Requer .env preenchido.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERRO: .env ausente. Copie de .env.example e preencha SHEET_ID, CF_ACCESS_*, TUNNEL_TOKEN." >&2
  exit 1
fi

echo "==> Build da imagem"
docker compose build

echo "==> Subindo (origem sem porta pública; acesso via cloudflared)"
docker compose up -d

echo "==> Aguardando healthcheck"
for i in $(seq 1 20); do
  if docker compose exec -T dashboard node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "OK — dashboard saudável."
    exit 0
  fi
  sleep 3
done

echo "ERRO: healthcheck não passou. Ver 'docker compose logs dashboard'." >&2
exit 1
