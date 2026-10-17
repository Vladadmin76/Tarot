# Как опубликовать сайт на kosmalis.com

Сайт публикуется сам: после каждого коммита в `main`, который меняет страницу, колоду или настройки, GitHub собирает папку `dist` и отправляет её в Cloudflare (`.github/workflows/deploy.yml`). Вручную нужно один раз подготовить доступ.

## Что сделать один раз (владелец)

1. **Токен Cloudflare.** Cloudflare → My Profile → API Tokens → Create Token. Шаблон «Edit Cloudflare Workers» плюс права `Zone → DNS → Edit` и `Zone → Workers Routes → Edit` для зоны `kosmalis.com` (домен куплен в Cloudflare, зона создана автоматически). Скопируйте токен (он показывается один раз).
2. **Номер аккаунта.** Cloudflare → Workers & Pages → справа «Account ID».
3. **Секреты в GitHub.** Репозиторий → Settings → Secrets and variables → Actions → New repository secret:
   - `CLOUDFLARE_API_TOKEN` — токен из п. 1;
   - `CLOUDFLARE_ACCOUNT_ID` — номер из п. 2.
4. **Запуск.** Репозиторий → Actions → «Deploy to Cloudflare» → Run workflow. Через пару минут сайт появится на https://kosmalis.com.

Токены и ключи нигде не присылайте в чат, только в секреты GitHub.

## Важно
- **DNS-запись для `tarot` вручную не создавайте.** Привязку адреса создаёт сам деплой (`custom_domain` в `wrangler.jsonc`). Если запись уже есть, деплой остановится с ошибкой, её нужно удалить.
- Пока сайт закрыт от поисковиков (`X-Robots-Tag: noindex` и `robots.txt`). Когда будем готовы показывать его всем, это уберём.
- Если деплой пишет, что не хватает прав, пришлите текст ошибки (без токена), я скажу, какое право добавить.

## Проверка у себя
```
bash tools/build_site.sh        # собирает dist
npx wrangler@4 dev              # открывает сайт на http://localhost:8787
```


## Живые карты (видео) в Cloudflare R2

Видео не лежат в Git (около 2 МБ на карту). Они хранятся в R2 и отдаются с адреса `https://live.kosmalis.com/major-NN.mp4`. Файлы, которые есть в хранилище, перечислены в `content/live.json`, эта страница показывает видео только для них.

1. В Cloudflare: R2 → Create bucket → имя `tarot-live`.
2. В настройках корзины: Custom Domains → Add → `live.kosmalis.com`. Сертификат и DNS Cloudflare создаст сам.
3. Токен API с правом «Workers R2 Storage: Edit» и номер аккаунта положить в переменные окружения (не в чат).
4. Сжать исходники: `bash tools/compress_live.sh <папка с исходными видео>` (нужен ffmpeg), результат в `live/`.
5. Загрузить: `bash tools/upload_live.sh`.
6. Для новой карты (например, Башни): сжать, загрузить, добавить id в `content/live.json` (например, `major-16`), выполнить `python3 tools/build_prototype.py`, закоммитить.

Для проверки без сайта положите папку `live/` рядом с `prototype/`: страница сначала ищет видео там.


## Сервер входа (регистрация, пароль, почта)

Код в `server/` (Hono). Проверка без Cloudflare и без внешних сервисов: `cd server && npm install && npm test` (12 тестов на локальной базе PGlite) и `npm run dev` (сервер на http://localhost:8787, письма печатаются в консоль, база в `server/.data`).

Что нужно сделать владельцу, чтобы заработало на сайте:
1. **Neon**: создать проект и базу, взять строку подключения. Применить миграции: `cd server && npm ci && DATABASE_URL='...' npm run migrate` (строку в чат не присылать).
2. **Resend** (отправка писем): создать аккаунт, добавить домен `kosmalis.com`, внести выданные DNS-записи в Cloudflare, создать API-ключ.
3. **Секреты Worker** (`cd server && npx wrangler secret put <имя> --config ../wrangler.jsonc`, либо в панели Cloudflare → Worker `tarot` → Settings → Variables): `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM` (например `Kosmalis <noreply@kosmalis.com>`), `ADMIN_USERNAMES` (до 5 логинов через запятую; пока не задан, администраторов нет). Открытая переменная `PUBLIC_URL` лежит в `wrangler.jsonc`.
4. Деплой идёт сам после коммита в `main` (workflow ставит зависимости `server/`). До появления секретов `/api/auth/*` отвечает ошибкой, статика работает.

Интерфейс (экраны входа и регистрации на сайте) пока не подключён к этому API, ссылки из писем ведут на готовые простые страницы `/confirm-email` и `/reset-password`.
