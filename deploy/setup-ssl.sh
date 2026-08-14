#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# InterCode — автоматическая настройка HTTPS (Let's Encrypt) для self-hosted VPS.
#
# Использование:
#   ./deploy/setup-ssl.sh <домен> <email> [--staging]
#
# Пример:
#   ./deploy/setup-ssl.sh intercode.example.com you@example.com
#
# Что делает скрипт (без ручных действий, без даунтайма):
#   1. Поднимает docker compose стек в HTTP-режиме (если ещё не поднят) —
#      нужен открытый порт 80 для ACME HTTP-01 challenge.
#   2. Мягко проверяет, что домен резолвится на IP этого сервера
#      (предупреждает, но не блокирует — DNS мог ещё не обновиться).
#   3. Получает сертификат Let's Encrypt через webroot-плагин (certbot
#      сам идемпотентен: если валидный сертификат уже есть — просто
#      выходит без переиздания).
#   4. Генерирует deploy/nginx.conf из deploy/nginx.ssl.conf.template
#      с подставленным доменом (бэкап старого — deploy/nginx.conf.bak),
#      пересобирает и перезапускает контейнер web.
#   5. Открывает порт 443 в docker-compose.yml, если он ещё закрыт.
#   6. Регистрирует задачу в crontab текущего пользователя: дважды в день
#      продлевает сертификат и перечитывает конфиг nginx — дальше ничего
#      делать не нужно, сертификат никогда не протухнет сам по себе.
#
# Скрипт идемпотентен: его можно спокойно перезапускать (например, если
# что-то пошло не так на середине, или чтобы сменить домен).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

usage() {
  cat <<'EOF'
Использование: deploy/setup-ssl.sh <домен> <email> [--staging]

  <домен>     Домен, указывающий A-записью на этот VPS (например: intercode.example.com)
  <email>     Email для уведомлений Let's Encrypt (истечение/проблемы сертификата)
  --staging   Использовать staging-окружение Let's Encrypt (тестовый сертификат,
              браузер будет ругаться, зато не расходует лимит на выпуск — полезно
              при первой обкатке скрипта, чтобы не словить rate limit)

Пример:
  ./deploy/setup-ssl.sh intercode.example.com you@example.com
EOF
}

if [[ $# -lt 2 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 1
fi

DOMAIN="$1"
EMAIL="$2"
STAGING_FLAG=""
if [[ "${3:-}" == "--staging" ]]; then
  STAGING_FLAG="--staging"
fi

log() { printf '\n==> %s\n' "$1"; }
warn() { printf '\n⚠ %s\n' "$1" >&2; }

if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]; then
  warn "«$DOMAIN» не похож на доменное имя. Проверьте аргумент (IP-адрес для Let's Encrypt не подходит)."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker &>/dev/null; then
  echo "Ошибка: docker не найден. Установите Docker (https://docs.docker.com/engine/install/)." >&2
  exit 1
fi
if ! docker compose version &>/dev/null; then
  echo "Ошибка: docker compose plugin не найден (нужен 'docker compose', не устаревший docker-compose)." >&2
  exit 1
fi
if [[ ! -f deploy/nginx.ssl.conf.template ]]; then
  echo "Ошибка: deploy/nginx.ssl.conf.template не найден. Запускайте скрипт из клона репозитория." >&2
  exit 1
fi
if [[ "$STAGING_FLAG" == "--staging" ]]; then
  log "Staging-режим Let's Encrypt: сертификат будет тестовым (недоверенным), лимиты не расходуются."
fi

log "Домен: $DOMAIN · Email: $EMAIL"

# 1. Поднимаем стек в HTTP-режиме — нужен порт 80 для ACME HTTP-01 challenge.
log "Поднимаю docker compose стек (HTTP)…"
docker compose up -d --build

# 2. Мягкая проверка DNS — не блокирует, только предупреждает (может ещё не
#    успеть распространиться, certbot в этом случае просто не пройдёт challenge).
SERVER_IP="$(curl -fsS4 --max-time 5 https://ifconfig.me 2>/dev/null || curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || true)"
DOMAIN_IP="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -n1 || true)"
if [[ -n "$SERVER_IP" && -n "$DOMAIN_IP" && "$SERVER_IP" != "$DOMAIN_IP" ]]; then
  warn "$DOMAIN резолвится в $DOMAIN_IP, а этот сервер — $SERVER_IP."
  echo "  Если A-запись ещё не обновилась, certbot не пройдёт проверку. Продолжаю через 10с (Ctrl+C — отменить)…"
  sleep 10
elif [[ -z "$DOMAIN_IP" ]]; then
  warn "Не удалось резолвить $DOMAIN — проверьте A-запись в DNS. Продолжаю через 10с (Ctrl+C — отменить)…"
  sleep 10
fi

# 3. Получаем сертификат Let's Encrypt через webroot (без даунтайма — порт 80
#    продолжает работать). certbot certonly идемпотентен сам по себе: если
#    валидный сертификат для этого домена уже есть, просто ничего не делает.
log "Запрашиваю сертификат Let's Encrypt для $DOMAIN…"
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --agree-tos -m "$EMAIL" --no-eff-email --non-interactive \
  --keep-until-expiring \
  $STAGING_FLAG

# 4. Генерируем deploy/nginx.conf из HTTPS-шаблона с подставленным доменом.
#    Подстановка через bash (${var//pattern/repl}), а не envsubst — чтобы не
#    требовать лишний пакет (gettext-base) на минимальных VPS-образах.
log "Генерирую deploy/nginx.conf (HTTPS) из шаблона…"
cp deploy/nginx.conf deploy/nginx.conf.bak
template="$(cat deploy/nginx.ssl.conf.template)"
printf '%s\n' "${template//\$\{DOMAIN\}/$DOMAIN}" >deploy/nginx.conf
echo "  Бэкап предыдущего конфига: deploy/nginx.conf.bak"

# 5. Открываем порт 443 в docker-compose.yml, если он ещё закомментирован.
if grep -qE '^\s*#\s*-\s*"443:443"' docker-compose.yml; then
  log "Открываю порт 443 в docker-compose.yml…"
  sed -i -E 's/^(\s*)#\s*-\s*"443:443"/\1- "443:443"/' docker-compose.yml
fi

# 6. Пересобираем и перезапускаем web (конфиг nginx вшит в образ на этапе сборки).
log "Пересобираю и перезапускаю web…"
docker compose up -d --build web

# 7. Автопродление: задача в crontab текущего пользователя, дважды в день.
#    certbot renew сам по себе — no-op, если сертификату ещё рано обновляться,
#    поэтому дважды в день (рекомендация Let's Encrypt) — безопасно и достаточно.
#    Ключ -T у exec обязателен: cron запускает команды без TTY.
CRON_MARKER="# intercode-certbot-renew (deploy/setup-ssl.sh, не редактируйте руками)"
CRON_CMD="cd $ROOT_DIR && docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet && docker compose exec -T web nginx -s reload"
CRON_LINE="17 3,15 * * * $CRON_CMD $CRON_MARKER"

if ! command -v crontab &>/dev/null; then
  CRON_INSTALLED=0
  warn "Команда crontab не найдена — автопродление не настроено автоматически."
  echo "  Установите cron (apt install -y cron / apk add dcron / yum install -y cronie)"
  echo "  или добавьте эту команду в свой планировщик (systemd timer и т.п.), дважды в день:"
  echo "  $CRON_CMD"
elif crontab -l 2>/dev/null | grep -qF "$CRON_MARKER"; then
  CRON_INSTALLED=1
  log "Задача автопродления уже есть в crontab — пропускаю."
else
  CRON_INSTALLED=1
  log "Добавляю задачу автопродления в crontab пользователя $(whoami) (каждый день в 03:17 и 15:17)…"
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
fi

# 8. Проверка.
log "Проверяю https://$DOMAIN/api/healthz…"
sleep 3
if curl -fsSk --max-time 10 "https://$DOMAIN/api/healthz" >/dev/null 2>&1; then
  echo "✅ Готово! HTTPS работает: https://$DOMAIN/"
else
  warn "Не удалось достучаться по HTTPS с этой же машины (это не всегда ошибка, если тестируете NAT/firewall изнутри)."
  echo "  Проверьте руками: curl -v https://$DOMAIN/api/healthz"
  echo "  И логи: docker compose logs web"
fi

cat <<EOF

$(if [[ "$CRON_INSTALLED" == "1" ]]; then
cat <<INNER
Дальше ничего делать не нужно — сертификат продлевается автоматически:
  - каждый день в 03:17 и 15:17 (crontab пользователя $(whoami)) certbot
    проверяет срок действия и продлевает сертификат при необходимости;
  - следом nginx (web) перечитывает конфиг (docker compose exec -T web nginx -s reload).
INNER
else
cat <<INNER
⚠ Автопродление НЕ настроено (нет crontab) — настройте его сами, иначе через
  ~90 дней сертификат протухнет. Команда, которую нужно вызывать дважды в день:
  $CRON_CMD
INNER
fi)

Полезные команды:
  docker compose logs -f web              — логи nginx
  docker compose logs -f server            — логи бэкенда
  crontab -l                               — посмотреть задачу автопродления
  docker compose run --rm certbot certificates   — срок действия сертификата
EOF
