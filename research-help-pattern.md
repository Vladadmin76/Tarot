# Паттерн Help: авторизация и интеграция Telegram-бота
## (референс для нового Таро-приложения)

Дата исследования: 2026-10-14.
Источник: репозиторий `Vladadmin76/Help`, **ветка по умолчанию `claude/custom-server-addition-kbbykz`**
(важно: ветки `main` в этом репозитории **не существует** — все чтения ниже сделаны
с дефолтной ветки, она же продовая).
Анализ только на чтение, в репозиторий ничего не менялось. Значения секретов не копировались —
ниже только их имена.

Прод: Cloudflare Worker, `PUBLIC_URL=https://app.fixtorllc.com` (см. `server/wrangler.jsonc`).
Стек сервера: Node.js + Express (`server/src/app.js`), библиотека Telegraf для бота,
Prisma ORM + PostgreSQL (Neon через Hyperdrive на Workers).

---

## 1. Обзор архитектуры

- **Один бот на всех пользователей.** Токен бота — один на приложение (`TELEGRAM_BOT_TOKEN`),
  у каждого пользователя в БД хранится его `telegramUserId` (Telegram user id), по нему
  бот понимает, чей аккаунт пишет, и по нему же сервер шлёт пуши.
- **Веб-приложение и бот — один сервер/кодовая база.** Express обслуживает и API сайта,
  и вебхук Telegram (`POST /telegram-webhook`).
- **Сессии, не JWT.** Авторизация сайта — cookie-сессия (`cookie-session`), в сессии
  хранится только `userId`.
- **Привязка бота — через одноразовый код.** Пользователь пишет боту `/start` или `/connect`,
  бот выдаёт код, пользователь вводит его в настройках сайта → аккаунты связываются.
- **Пуши — прямые вызовы Bot API.** Без очередей: `bot.telegram.sendMessage(telegramUserId, text)`.
  Массовые/плановые отправки идут из крон-задач.

---

## 2. Авторизация (логин/пароль) — пошагово

Файл: `server/src/auth.js`; маршруты в `server/src/app.js`.

1. **Регистрация** — `POST /api/auth/register` `{ username, password }`:
   - валидация: username ≥ 3 символов, пароль ≥ 6 символов;
   - проверка уникальности username;
   - `passwordHash = bcrypt.hash(password, 10)` → запись в `User`;
   - сразу логин: `req.session.userId = user.id`.
2. **Вход** — `POST /api/auth/login` `{ username, password }`:
   - поиск по username, `bcrypt.compare(password, user.passwordHash)`;
   - при успехе `req.session.userId = user.id`; при неудаче — generic 401
     «Неверный логин или пароль» (не раскрывает, что именно неверно).
3. **Сессия** — `cookie-session` (`server/src/app.js`):
   - имя куки `session`, подпись секретом `SESSION_SECRET`;
   - `maxAge` 30 дней, `sameSite: 'lax'`, `secure: true` в production;
   - `app.set('trust proxy', 1)` — обязательно за прокси/Cloudflare.
4. **Проверка** — middleware `requireAuth`: есть ли `req.session.userId`;
   все `/api/*` (кроме auth/tutor) идут через него.
5. **Статус** — `GET /api/auth/status` возвращает `{ authed, ..., telegramConnected, telegramBotUsername }`.
6. Бонус (не обязателен для Таро): вход по Face ID/Touch ID через WebAuthn-passkey
   (`WebauthnCredential` в БД) как альтернатива паролю.

**Где что лежит:**
- хэш пароля: таблица `User.passwordHash` (bcrypt, cost 10), PostgreSQL;
- секрет подписи cookie: env `SESSION_SECRET`.

---

## 3. Привязка Telegram-бота к аккаунту — пошагово

Файлы: `server/src/bot/bot.js` (команды), `server/src/auth.js`
(`createTelegramCode`, `connectTelegram`, `disconnectTelegram`),
таблица `TelegramCode` в `server/prisma/schema.prisma`.

1. Пользователь открывает бота и жмёт `/start` или пишет `/connect`
   (эти две команды работают **до** привязки — остальной бот требует привязки).
2. Сервер генерирует код: `crypto.randomBytes(5).toString('hex').toUpperCase()`
   (10 hex-символов), создаёт запись `TelegramCode`:
   `{ code, telegramUserId, used: false, expiresAt: now + 10 минут }`.
3. Бот отвечает кодом в `<code>`-блоке (тап-для-копирования) + инструкция
   ввести его в настройках приложения.
4. Пользователь (авторизованный на сайте) вводит код →
   `POST /api/auth/connect-telegram` `{ code }` (под `requireAuth` + rate limit).
5. Сервер проверяет: код существует, `used = false`, `expiresAt` в будущем.
   Неудачные попытки в лог пишутся **без** самого кода.
6. В одной транзакции:
   - `TelegramCode.used = true` (одноразовость);
   - `telegramUserId` отвязывается от любого **другого** аккаунта
     («новый код всегда побеждает» — защита от зависших привязок);
   - `User.telegramUserId = <id>` для текущего пользователя.
7. Отвязка: `POST /api/auth/disconnect-telegram` → `telegramUserId = null`.

**Ключевые свойства паттерна:**
- код живёт 10 минут (`CODE_TTL_MS`), одноразовый;
- коды каждый раз свежие — повторный `/connect` перевыпускает;
- связь «пользователь ↔ Telegram» — просто поле `User.telegramUserId` (unique, nullable);
- middleware бота на каждое входящее сообщение резолвит
  `User` по `ctx.from.id` → дальше весь бот работает в контексте аккаунта.

---

## 4. Отправка сообщений пользователю через бота

Файл: `server/src/telegram/notify.js`.

- `notifyUser(userId, text)` — находит `User`, берёт `telegramUserId`,
  вызывает `botInstance.telegram.sendMessage(telegramUserId, text)`.
  Если бота нет / пользователь не привязан — молча ничего не делает.
- `notifyTelegramId(telegramUserId, text)` — то же по сырому Telegram id.
- **Прямые вызовы Bot API через Telegraf, без очереди.** Ошибки только логируются.
- Плановые пуши идут из крона: `server/src/cron/scheduler.js`
  (`checkDueReminders`, `checkBills`, …) → вызывают `notifyUser(...)`.
  На Workers крон — триггеры в `wrangler.jsonc` (`* * * * *`, `0 9 * * *`, `15 8 * * *`)
  → `scheduled()` в `server/src/worker.mjs`.

Для Таро-приложения «карта дня в бот» — это ровно этот путь:
крон-раз в день → выбрать карту → `notifyUser(userId, текст-расклад)`.

---

## 5. Webhook

Файлы: `server/src/app.js` (endpoint), `server/src/telegram/botInfo.js` (регистрация).

- Endpoint: `POST /telegram-webhook` (путь константный, не секретный).
- Защита: сверка заголовка `x-telegram-bot-api-secret-token` с env
  `TELEGRAM_WEBHOOK_SECRET` (секрет передаётся в `setWebhook` как `secret_token`).
  ⚠️ **Секрет НЕ обязателен**: если `TELEGRAM_WEBHOOK_SECRET` не задан —
  проверка пропускается (сделано сознательно, чтобы не сломать вебхук до установки
  секрета; в коде есть комментарий с объяснением).
- Обработчик — свой, не `bot.webhookCallback()` от Telegraf:
  просто `await bot.handleUpdate(req.body)` и ответ `200`
  (встроенная обёртка Telegraf вешала изолят на Cloudflare Workers).
- Регистрация вебхука — ленивая (`ensureWebhook()`): при первом реальном запросе
  сверяет `getWebhookInfo().url` с `${PUBLIC_URL}/telegram-webhook` и при расхождении
  переустанавливает; дополнительно форсируется из ежеминутного крона
  (`ensureWebhook(true)` в `worker.mjs`), т.к. Telegram сам отключает вебхук
  после серии ошибок доставки.

---

## 6. База данных и секреты

- **СУБД:** PostgreSQL. На Workers — Neon через Hyperdrive
  (`hyperdrive` binding в `wrangler.jsonc`); в `.env.example` — строка `DATABASE_URL`
  (Render Postgres). ORM — Prisma, схема `server/prisma/schema.prisma`.
- **Где лежат токены/идентификаторы:**
  - `User.passwordHash` — bcrypt-хэш пароля;
  - `User.telegramUserId` — Telegram user id (строка, unique, nullable);
  - `TelegramCode` — одноразовые коды привязки (+ `used`, `expiresAt`);
  - `WebauthnCredential` — passkey для Face ID-входа (опционально).
- **Имена секретов (значений нет, только имена):**
  - `DATABASE_URL` — подключение к PostgreSQL;
  - `SESSION_SECRET` — подпись session cookie;
  - `TELEGRAM_BOT_TOKEN` — токен бота от @BotFather (один на всех);
  - `TELEGRAM_WEBHOOK_SECRET` — секрет вебхука (опционален, см. п.5);
  - `PUBLIC_URL` — публичный URL сервиса (не секрет, лежит в `wrangler.jsonc`);
  - прочие несвязанные: `DEEPSEEK_API_KEY`, `TUTOR_PROXY_SECRET`,
    `GITHUB_LOG_TOKEN`, `TUTOR_ALLOWED_ORIGIN`, `ENGLISH_DEEPSEEK_API_KEY`.

---

## 7. Rate limiting, helmet, CORS

- **Rate limit** (`server/src/rateLimit.js`): свой, in-memory `Map`
  (сторонние пакеты частично несовместимы с Workers).
  Применён к `POST /api/auth/register`, `/api/auth/login`,
  `/api/auth/connect-telegram`: **20 запросов / 15 минут** на связку `IP + путь`,
  дальше `429`. ⚠️ На Workers память не общая между изолятами —
  это best-effort защита от перебора, не строгая гарантия.
- **Helmet** включён, но `contentSecurityPolicy: false` и
  `crossOriginEmbedderPolicy: false` — из-за страницы `/tv` с инлайн-скриптами
  и сторонними ресурсами; остальные заголовки (nosniff, HSTS, X-Frame-Options) активны.
- **CORS**: строгий allowlist — только `PUBLIC_URL` (+ `localhost:5173/3000` для dev),
  `credentials: true`. Раньше был `origin: true` (любой origin с куками) — сузили.
  Для прокси English — отдельный более строгий CORS только на два маршрута.

---

## 8. Что переиспользовать, что улучшить (для Таро-приложения)

**Переиспользовать как есть:**
1. Cookie-сессии (`cookie-session`, 30 дней, `sameSite: lax`, `secure` в проде) —
   простой и рабочий паттерн для сайта с логином/паролем.
2. bcrypt-хэши паролей (cost 10) в `User.passwordHash`.
3. Привязка бота через одноразовый код 10 минут: `/start` → код → ввод на сайте →
   `User.telegramUserId`. Готовая схема «один бот на всех».
4. Пуши через `notifyUser(userId, text)` + крон — идеально ложится на «карту дня в бот».
5. Ленивая регистрация вебхука + форсированная проверка из крона.
6. Строгий CORS-allowlist + `credentials: true`.

**Улучшить / учесть:**
1. **Сделать `TELEGRAM_WEBHOOK_SECRET` обязательным** — сейчас его отсутствие
   молча отключает проверку (путь вебхука угадываемый).
2. **Rate limit строже и распределённый**: in-memory на Workers — best-effort;
   для логина/привязки лучше хранить счётчики в БД/KV. Лимит 20/15 мин —
   ок как старт.
3. **Парольная политика**: сейчас минимум 6 символов без проверки сложности.
4. **Helmet**: для нового приложения без `/tv`-страницы можно включить CSP полностью.
5. **Очередь для пушей**: сейчас отправка синхронная, без ретраев; при росте числа
   пользователей (ежедневная рассылка всем) стоит добавить очередь + обработку
   429/flood-wait от Telegram.
6. **Привязка кодом — только через сайт**: в Таро-приложении можно также дать
   deep-link `t.me/<bot>?start=<payload>` и привязывать автоматически по `start`-параметру,
   без ручного ввода кода (удобнее на телефоне).
7. Ветка/деплой: у Help прод живёт на `claude/custom-server-addition-kbbykz`
   (не `main`) на Cloudflare Workers — для нового проекта сразу выбрать
   понятную схему веток и не повторять эту путаницу.
