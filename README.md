# TRX Wallet Tracker Bot

Telegram-бот для отслеживания балансов TRON-кошельков (TRX + USDT TRC-20).

---

## Возможности

- Добавление кошельков с произвольным названием
- Просмотр балансов TRX и USDT по всем кошелькам
- Переименование и удаление кошельков
- Данные сохраняются в `wallets.json` на сервере (каждый пользователь видит только свои кошельки)
- Курс TRX в реальном времени через CoinGecko

---

## Быстрый старт

### 1. Получите токен бота

1. Откройте Telegram и найдите [@BotFather](https://t.me/BotFather)
2. Отправьте `/newbot` и следуйте инструкциям
3. Скопируйте полученный токен вида `1234567890:ABCdef...`

### 2. Установка на сервере

```bash
# Клонируйте или скопируйте папку на сервер
cd trx-bot

# Установите зависимости
npm install

# Создайте файл .env
cp .env.example .env
nano .env   # вставьте ваш BOT_TOKEN
```

Содержимое `.env`:
```
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```

### 3. Запуск

**Простой запуск (для теста):**
```bash
npm start
```

**Запуск через PM2 (рекомендуется для продакшена):**
```bash
# Установите PM2 глобально (один раз)
npm install -g pm2

# Запустите бота
BOT_TOKEN=ваш_токен pm2 start ecosystem.config.js

# Или если используете .env файл:
pm2 start ecosystem.config.js --env production

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save
```

**Полезные команды PM2:**
```bash
pm2 status          # статус бота
pm2 logs trx-bot    # логи в реальном времени
pm2 restart trx-bot # перезапуск
pm2 stop trx-bot    # остановка
```

---

## Структура файлов

```
trx-bot/
├── bot.js              # основной код бота
├── wallets.json        # база данных кошельков (создаётся автоматически)
├── .env                # токен бота (создать вручную из .env.example)
├── .env.example        # шаблон переменных окружения
├── ecosystem.config.js # конфигурация PM2
├── package.json
└── README.md
```

---

## Структура wallets.json

```json
{
  "123456789": [
    { "address": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE", "label": "Биржа" },
    { "address": "TSWMLkjxAwJJMVvY94Vr49gAFQCxZnQ7Z5", "label": "Холодный" }
  ]
}
```

Ключ — это Telegram `chat_id` пользователя. Каждый пользователь видит только свои кошельки.

---

## Требования

- Node.js >= 16
- Доступ к интернету (TronGrid API + CoinGecko API)
