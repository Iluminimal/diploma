#!/usr/bin/env bash
# Production-ийн өгөгдлийн сан (pg_dump, custom format) болон барааны зургийг (media volume) нөөцлөнө.
# Хуучин нөөцүүдээс сүүлийн KEEP (анхдагч 14)-ийг үлдээнэ. cron-д тавихад тохиромжтой:
#
#   0 3 * * *  cd /opt/angel && scripts/backup.sh /var/backups/angel
#
# Сэргээх: docs/deploy.md ("Backup ба restore").
set -euo pipefail
cd "$(dirname "$0")/.."

DEST=${1:-backups}
KEEP=${KEEP:-14}
ENV_FILE=${ENV_FILE:-.env.prod}
COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file "$ENV_FILE")
PROJECT=angel-prod
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DEST"
DEST=$(cd "$DEST" && pwd)

# Postgres: нэг transaction-ийн тогтвортой хуулбар, сервер ажиллаж байхад.
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$DEST/db-$STAMP.dump"

# Зураг: named volume-ийг түр container-аар tar болгоно.
docker run --rm -v "${PROJECT}_media:/media:ro" -v "$DEST:/out" alpine \
  tar czf "/out/media-$STAMP.tgz" -C /media .

# Хуучныг цэвэрлэх (файл бүрийн төрлөөр тусад нь).
for kind in db media; do
  ls -1t "$DEST"/"$kind"-* 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -- "$old"
  done
done

echo "✓ $DEST/db-$STAMP.dump, $DEST/media-$STAMP.tgz"
