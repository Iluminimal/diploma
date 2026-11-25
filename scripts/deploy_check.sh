#!/usr/bin/env bash
# `.env.prod` болон prod compose-ийг deploy хийхээс өмнө шалгана. Утгыг хэзээ ч хэвлэхгүй, зөвхөн
# хувьсагчийн нэр. API өөрөө бас эхлэхдээ APP_ENV=prod-ийн дүрмийг (fake, offline, console, sandbox хориотой)
# шалгадаг тул энэ нь түүнээс өмнөх, хурдан шалгалт.
#
#   make deploy-check            # .env.prod
#   ENV_FILE=other.env make deploy-check
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=${ENV_FILE:-.env.prod}
COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file "$ENV_FILE")
problems=0

if [[ ! -f $ENV_FILE ]]; then
  echo "✗ $ENV_FILE байхгүй: cp .env.prod.example .env.prod, дараа нь утгуудыг бөглө"
  exit 1
fi

get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
bad() { echo "✗ $1"; problems=$((problems + 1)); }

for key in SITE_ADDRESS SITE_URL POSTGRES_PASSWORD JWT_SECRET \
  QPAY_CLIENT_ID QPAY_CLIENT_SECRET QPAY_INVOICE_CODE \
  TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM_NUMBER \
  SMTP_HOST MAIL_FROM GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  value=$(get "$key")
  if [[ -z $value || $value == CHANGE_ME ]]; then bad "$key хоосон эсвэл CHANGE_ME"; fi
done

[[ $(get SITE_URL) == https://* ]] || bad "SITE_URL нь https:// -ээр эхлэх ёстой"
jwt=$(get JWT_SECRET)
[[ ${#jwt} -ge 32 ]] || bad "JWT_SECRET 32-оос богино (openssl rand -base64 48)"
[[ $(get PAYMENTS_MODE) == qpay ]] || bad "PAYMENTS_MODE=qpay байх ёстой"
[[ $(get QPAY_BASE_URL) != *sandbox* ]] || bad "QPAY_BASE_URL нь sandbox хаяг (https://merchant.qpay.mn байх ёстой)"
[[ $(get EMBEDDER) != fake ]] || bad "EMBEDDER=fake prod-д хориотой"
[[ $(get LOCALIZER) != fake ]] || bad "LOCALIZER=fake prod-д хориотой"
[[ $(get SMS_MODE) == twilio ]] || bad "SMS_MODE=twilio байх ёстой"
[[ $(get MAIL_MODE) == smtp ]] || bad "MAIL_MODE=smtp байх ёстой"
[[ $(get OAUTH_MODE) == google ]] || bad "OAUTH_MODE=google байх ёстой"
[[ -z $(get OTP_DEV_CODE) ]] || bad "OTP_DEV_CODE prod-д хориотой"

"${COMPOSE[@]}" config -q || bad "docker compose config алдаатай"

if [[ $problems -gt 0 ]]; then
  echo "$problems асуудал. Засаад дахин ажиллуул."
  exit 1
fi
echo "✓ $ENV_FILE болон compose зөв харагдаж байна"
