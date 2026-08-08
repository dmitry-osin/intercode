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
собеседований включите HTTPS.

```bash
# 1. Домен должен указывать на VPS (A-запись). Порт 80 открыт.
docker compose up -d --build

# 2. Выпустить сертификат certbot'ом (webroot через запущенный nginx):
sudo apt install certbot
sudo certbot certonly --webroot -w /var/www/html -d intercode.example.com
#    либо временно остановить web и использовать --standalone:
#    docker compose stop web && sudo certbot certonly --standalone -d intercode.example.com

# 3. В deploy/nginx.conf:
#    - раскомментируйте HTTPS-блок, впишите домен;
#    - HTTP-блок замените на редирект 301 (шаблон в комментарии файла).

# 4. В docker-compose.yml:
#    - раскомментируйте порт "443:443";
#    - раскомментируйте volume /etc/letsencrypt (ro).

# 5. Пересобрать web (конфиг nginx вшивается в образ):
docker compose up -d --build web
```

Certbot обновляет сертификаты сам (`certbot renew` по cron/systemd-таймеру);
после обновления перезагрузите nginx: `docker compose exec web nginx -s reload`.

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

## Ограничения MVP (по ТЗ)

- Нет аккаунтов: доступ только по ссылкам с токеном — храните их как пароли.
- Токены передаются в query URL; на HTTPS это безопасно в транзите, но
  видно в access-логах nginx — при желании отключите логирование /ws и /api.
- Один инстанс сервера (in-memory комнаты + диск). Горизонтальное
  масштабирование (Redis/adapter) — post-MVP.
