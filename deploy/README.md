# InterCode — развёртывание на своём VPS

Полностью self-hosted: без Cloudflare, без GitHub Pages, без внешних сервисов.
Два контейнера: **web** (nginx + статика фронтенда) и **server** (Node.js:
WebSocket/Yjs-синхронизация, телеметрия, HTTP API, хранение сессий).

## Требования

- VPS с Linux, Docker и Docker Compose plugin (`docker compose version`)
- Открытые порты 80 (и 443 для HTTPS)
- Для HTTPS — домен с A-записью на IP вашего VPS

## Быстрый старт (HTTP)

```bash
git clone <ваш-репозиторий> intercode && cd intercode
docker compose up -d --build
```

### Альтернатива: готовые образы из GHCR

Образы можно собирать не на VPS, а в GitHub Actions — workflow уже в репо:
`.github/workflows/docker.yml`. Он собирает `web` и `server` (amd64 + arm64)
и пушит в GitHub Container Registry при push в main и по тегам `v*`.
Настройка не нужна — используется встроенный `GITHUB_TOKEN`; после первого
прогона сделайте пакеты public (Packages → settings → Change visibility).

Деплой без сборки:

```bash
export GHCR_PREFIX=ghcr.io/<owner>/<repo>   # ваш репозиторий
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Приложение доступно на `http://<ip-vps>/`. Проверка:

```bash
curl http://localhost/api/healthz
# {"ok":true,"service":"intercode-server","time":...}
```

## HTTPS (рекомендуется)

Без TLS токены в ссылках и код передаются открытым текстом — для реальных
собеседований включите HTTPS. Домен должен уже указывать A-записью на IP
этого VPS.

### Автоматически (одна команда)

```bash
chmod +x deploy/setup-ssl.sh
./deploy/setup-ssl.sh intercode.example.com you@example.com
```

Скрипт сам, без дальнейших ручных действий:

1. поднимает docker compose стек (HTTP), если он ещё не запущен;
2. мягко проверяет, что домен резолвится на IP этого сервера (предупреждает,
   не блокирует — вдруг DNS ещё не обновился);
3. получает сертификат Let's Encrypt через `certbot` (webroot-плагин, без
   даунтайма — порт 80 продолжает работать);
4. генерирует `deploy/nginx.conf` из `deploy/nginx.ssl.conf.template` с вашим
   доменом (бэкап предыдущего конфига — `deploy/nginx.conf.bak`), пересобирает
   и перезапускает `web`;
5. открывает порт `443` в `docker-compose.yml`, если он ещё закрыт;
6. регистрирует задачу в `crontab`: дважды в день (03:17 и 15:17) продлевает
   сертификат и перечитывает конфиг nginx — **дальше делать вообще ничего не
   нужно**, сертификат никогда не протухнет сам по себе.

Скрипт идемпотентен — его можно спокойно перезапускать (например, если что-то
не задалось на середине, или чтобы сменить домен). Для обкатки без риска
упереться в лимиты Let's Encrypt есть флаг `--staging` (тестовый сертификат,
браузер будет ругаться, зато лимиты не расходуются):

```bash
./deploy/setup-ssl.sh intercode.example.com you@example.com --staging
```

Проверить, что всё встало:

```bash
curl -I https://intercode.example.com/api/healthz
crontab -l                                     # задача автопродления
docker compose run --rm certbot certificates   # срок действия сертификата
```

> Работает для сборки на VPS (`docker-compose.yml`, `build: .` — вариант из
> «Быстрого старта»). Для варианта с готовыми образами GHCR
> (`docker-compose.ghcr.yml`) `deploy/nginx.conf` уже вшит в опубликованный
> образ `web` — под HTTPS для него либо соберите `web` локально по
> `docker-compose.yml`, либо подготовьте свой образ поверх `nginx:1.27-alpine`
> с уже сгенерированным конфигом.

### Вручную (для справки/кастомизации)

Если нужно больше контроля, чем даёт скрипт — тот же процесс руками:

```bash
# 1. Домен указывает на VPS, порт 80 открыт.
docker compose up -d --build

# 2. Выпустить сертификат (web продолжает работать, challenge отдаёт nginx).
#    Сервис certbot уже описан в docker-compose.yml (profiles: [tools]),
#    поэтому его не нужно поднимать через `up` — только через `run`.
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d intercode.example.com --agree-tos -m you@example.com --non-interactive

# 3. Сгенерировать deploy/nginx.conf из шаблона (или отредактировать вручную —
#    структура блоков описана в deploy/nginx.ssl.conf.template). Плейсхолдер —
#    только ${DOMAIN}, остальные $-переменные — это переменные nginx.
DOMAIN=intercode.example.com
template="$(cat deploy/nginx.ssl.conf.template)"
printf '%s\n' "${template//\$\{DOMAIN\}/$DOMAIN}" > deploy/nginx.conf

# 4. В docker-compose.yml раскомментировать порт "443:443".

# 5. Пересобрать web (конфиг nginx вшивается в образ на этапе сборки).
docker compose up -d --build web
```

Продление сертификата (действует 90 дней; Let's Encrypt рекомендует проверять
дважды в день — `renew` сам ничего не делает, пока рано) и перечитывание
конфига nginx без даунтайма:

```bash
docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet
docker compose exec -T web nginx -s reload
```

Именно эти две команды `./deploy/setup-ssl.sh` кладёт в `crontab` автоматически.

## Данные и бэкап

Всё состояние — в volume `server-data` (внутри контейнера `/app/data`):

```
sessions/<id>.json    метаданные сессий (токены, конфиг, стартовый код)
docs/<id>.bin         бинарный снапшот Yjs-документа
telemetry/<id>.jsonl  журнал телеметрии
```

Бэкап:

```bash
docker run --rm -v intercode_server-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/intercode-data-$(date +%F).tgz -C /data .
```

Восстановление — распаковать архив обратно в volume.

## Автоматическая очистка сессий

Сервер сам следит за жизненным циклом сессий, без внешнего крона:

- **Простой > 1 часа.** Если в комнате час никого нет, она выгружается из RAM
  и автоматически помечается завершённой (`status: "ended"`, выставляется `closedAt`)
  — даже если интервьюер не нажимал «Завершить» явно.
- **12 часов после завершения.** Раз в 30 минут сервер сканирует все сохранённые
  сессии и безвозвратно удаляет файлы (`sessions/<id>.json`, `docs/<id>.bin`,
  `telemetry/<id>.jsonl`) тех, что завершены (вручную или по простою) более 12
  часов назад. Активные сессии никогда не трогаются — только завершённые.

Если нужно хранить данные дольше (например, для архива собеседований), делайте
резервную копию `server-data` до истечения 12 часов после завершения сессии —
это единственный механизм долговременного хранения, автоочистку он не отменяет.

## Обновление до новой версии

```bash
git pull
docker compose up -d --build
```

Данные в volume сохраняются. Активные WebSocket-соединения при рестарте
server разорвутся — клиенты переподключатся автоматически (backoff до 10 с),
документ и телеметрия восстановятся с диска.

## Переменные окружения (server)

| Переменная  | По умолчанию | Назначение                          |
|-------------|--------------|-------------------------------------|
| `PORT`      | `8090`       | Порт HTTP/WS сервера внутри сети    |
| `DATA_DIR`  | `/app/data`  | Каталог хранения сессий             |
| `STATIC_DIR`| —            | Отдавать фронтенд самим сервером (режим без nginx) |

## Режим без Docker

```bash
# Сервер
cd server && npm ci --omit=dev
PORT=8090 DATA_DIR=./data node src/index.js

# Фронтенд
npm ci && npm run build
# раздавайте dist/ любым статическим сервером, проксируя /api и /ws
# на 127.0.0.1:8090 (готовый конфиг — deploy/nginx.conf)
```

Либо всё в одном процессе: `STATIC_DIR=../dist node src/index.js` — сервер
сам отдаст и статику, и API, и WebSocket (тогда nginx не нужен вовсе).

## Эксплуатация

```bash
docker compose logs -f server     # логи сервера (подключения, ошибки)
docker compose logs -f web        # access/error логи nginx
docker compose ps                 # состояние контейнеров
docker compose restart server     # перезапуск без потери данных
```

### Ошибка `EACCES: permission denied, mkdir '/app/data/sessions'`

Контейнер сервера работает под пользователем `node`, а volume для данных,
созданный старой версией образа, принадлежит root. После обновления образа
(в Dockerfile каталог `/app/data` создаётся с владельцем `node`) почините
права один раз:

```bash
docker compose up -d --build
docker compose exec -u root server chown -R node:node /app/data
docker compose restart server
```

## Ограничения MVP (по ТЗ)

- Нет аккаунтов: доступ только по ссылкам с токеном — храните их как пароли.
- Токены передаются в query URL; на HTTPS это безопасно в транзите, но
  видно в access-логах nginx — при желании отключите логирование /ws и /api.
- Один инстанс сервера (in-memory комнаты + диск). Горизонтальное
  масштабирование (Redis/adapter) — post-MVP.
## Админка

Статистика использования доступна по `#/admin` после настройки серверного `ADMIN_TOKEN`. Инструкция и определения показателей: [ADMIN.md](ADMIN.md).
