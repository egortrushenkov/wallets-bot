'use strict';

const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');
const fs          = require('fs');
const path        = require('path');

// ─────────────────────────────────────────────────────────────────────────────
//  Конфигурация
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN     = process.env.BOT_TOKEN || '';
const DATA_FILE = path.join(__dirname, 'wallets.json');

const TRONGRID      = 'https://api.trongrid.io';
const COINGECKO     = 'https://api.coingecko.com/api/v3';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

if (!TOKEN) {
  console.error('❌  Не задан BOT_TOKEN. Укажите его в .env или переменной окружения.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ─────────────────────────────────────────────────────────────────────────────
//  Хранилище (wallets.json)
//  Структура: { [chatId]: [ { address, label }, ... ] }
// ─────────────────────────────────────────────────────────────────────────────
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) { return {}; }
}

function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function getWallets(chatId) {
  const db = loadDB();
  return db[String(chatId)] || [];
}

function setWallets(chatId, list) {
  const db = loadDB();
  db[String(chatId)] = list;
  saveDB(db);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Состояние диалога (ожидание ввода от пользователя)
// ─────────────────────────────────────────────────────────────────────────────
const state = {};   // { [chatId]: { step, data } }

function setState(chatId, s) { state[chatId] = s; }
function getState(chatId)    { return state[chatId] || null; }
function clearState(chatId)  { delete state[chatId]; }

// ─────────────────────────────────────────────────────────────────────────────
//  API: курс TRX
// ─────────────────────────────────────────────────────────────────────────────
async function getTrxPrice() {
  try {
    const r = await axios.get(COINGECKO + '/simple/price', {
      params: { ids: 'tron', vs_currencies: 'usd' },
      timeout: 8000,
    });
    return r.data?.tron?.usd || 0;
  } catch (_) { return 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  API: данные кошелька
// ─────────────────────────────────────────────────────────────────────────────
async function getWalletData(address) {
  const r = await axios.get(TRONGRID + '/v1/accounts/' + address, { timeout: 10000 });
  const data = r.data?.data;

  if (!data || data.length === 0) {
    return { trx: 0, usdt: 0, tokens: 0 };
  }

  const acc = data[0];
  const trx = (acc.balance || 0) / 1e6;
  let usdt   = 0;
  let tokens = 0;

  for (const obj of (acc.trc20 || [])) {
    const [contract, raw] = Object.entries(obj)[0];
    if (contract === USDT_CONTRACT) {
      usdt = parseInt(raw) / 1e6;
    } else {
      tokens++;
    }
  }

  return { trx, usdt, tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Форматирование чисел
// ─────────────────────────────────────────────────────────────────────────────
function fmt(n, d) {
  d = d === undefined ? 2 : d;
  return parseFloat(n || 0).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function shortAddr(a) { return a.slice(0, 6) + '...' + a.slice(-6); }

// ─────────────────────────────────────────────────────────────────────────────
//  Клавиатуры
// ─────────────────────────────────────────────────────────────────────────────
const MAIN_KB = {
  reply_markup: {
    keyboard: [
      ['➕ Добавить кошелёк', '📋 Мои кошельки'],
      ['💰 Балансы',          '✏️ Переименовать'],
      ['❌ Удалить кошелёк',  'ℹ️ Помощь'],
    ],
    resize_keyboard: true,
  },
};

function cancelKB() {
  return {
    reply_markup: {
      keyboard: [['🚫 Отмена']],
      resize_keyboard: true,
    },
  };
}

function walletListKB(wallets) {
  const rows = wallets.map((w, i) => [{
    text: (i + 1) + '. ' + (w.label || shortAddr(w.address)),
  }]);
  rows.push([{ text: '🚫 Отмена' }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Отправка с Markdown
// ─────────────────────────────────────────────────────────────────────────────
function send(chatId, text, opts) {
  return bot.sendMessage(chatId, text, Object.assign({ parse_mode: 'Markdown' }, opts || {}));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Команды
// ─────────────────────────────────────────────────────────────────────────────

// /start
bot.onText(/\/start/, (msg) => {
  clearState(msg.chat.id);
  send(msg.chat.id,
    '👋 *TRX Wallet Tracker*\n\n' +
    'Отслеживайте балансы TRON-кошельков прямо в Telegram.\n\n' +
    'Выберите действие в меню ниже:',
    MAIN_KB
  );
});

// /help
bot.onText(/\/help/, (msg) => cmdHelp(msg.chat.id));
function cmdHelp(chatId) {
  send(chatId,
    '*Доступные команды:*\n\n' +
    '➕ *Добавить кошелёк* — добавить новый TRX-адрес\n' +
    '📋 *Мои кошельки* — список всех добавленных кошельков\n' +
    '💰 *Балансы* — показать балансы всех кошельков\n' +
    '✏️ *Переименовать* — изменить название кошелька\n' +
    '❌ *Удалить кошелёк* — удалить кошелёк из списка\n\n' +
    '_Данные сохраняются в wallets.json на сервере._',
    MAIN_KB
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Обработчик всех входящих сообщений
// ─────────────────────────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text   = (msg.text || '').trim();

  // Кнопки меню
  if (text === '➕ Добавить кошелёк') { return startAdd(chatId); }
  if (text === '📋 Мои кошельки')     { return cmdList(chatId); }
  if (text === '💰 Балансы')          { return cmdBalances(chatId); }
  if (text === '✏️ Переименовать')    { return startRename(chatId); }
  if (text === '❌ Удалить кошелёк')  { return startDelete(chatId); }
  if (text === 'ℹ️ Помощь')           { return cmdHelp(chatId); }
  if (text === '🚫 Отмена')           { clearState(chatId); return send(chatId, '✅ Отменено.', MAIN_KB); }

  // Обработка шагов диалога
  const s = getState(chatId);
  if (s) return handleStep(chatId, text, s);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Добавить кошелёк
// ─────────────────────────────────────────────────────────────────────────────
function startAdd(chatId) {
  setState(chatId, { step: 'add_address' });
  send(chatId, '📥 Введите *TRX-адрес* кошелька:', cancelKB());
}

// ─────────────────────────────────────────────────────────────────────────────
//  Список кошельков
// ─────────────────────────────────────────────────────────────────────────────
function cmdList(chatId) {
  const list = getWallets(chatId);
  if (list.length === 0) {
    return send(chatId, '📭 У вас нет добавленных кошельков.\n\nНажмите *➕ Добавить кошелёк*.', MAIN_KB);
  }
  const lines = list.map((w, i) =>
    (i + 1) + '. ' + (w.label ? '*' + w.label + '*\n   ' : '') +
    '`' + w.address + '`\n   [tronscan](https://tronscan.org/#/address/' + w.address + ')'
  );
  send(chatId, '📋 *Ваши кошельки:*\n\n' + lines.join('\n\n'), MAIN_KB);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Балансы
// ─────────────────────────────────────────────────────────────────────────────
async function cmdBalances(chatId) {
  const list = getWallets(chatId);
  if (list.length === 0) {
    return send(chatId, '📭 Нет кошельков. Добавьте через *➕ Добавить кошелёк*.', MAIN_KB);
  }

  const loadingMsg = await send(chatId, '⏳ Загружаю балансы...', MAIN_KB);

  const price = await getTrxPrice();
  let totalTrx = 0, totalUsdt = 0;
  const lines = [];

  for (const w of list) {
    try {
      const d = await getWalletData(w.address);
      totalTrx  += d.trx;
      totalUsdt += d.usdt;
      const usdVal = price ? ' ≈ $' + fmt(d.trx * price) : '';
      lines.push(
        (w.label ? '*' + w.label + '*' : '*' + shortAddr(w.address) + '*') + '\n' +
        '  TRX: `' + fmt(d.trx, 4) + '`' + usdVal + '\n' +
        '  USDT: `' + fmt(d.usdt, 2) + '`\n' +
        '  Прочих токенов: ' + d.tokens
      );
    } catch (e) {
      lines.push(
        (w.label ? '*' + w.label + '*' : '*' + shortAddr(w.address) + '*') + '\n' +
        '  ⚠️ Ошибка загрузки: ' + e.message
      );
    }
  }

  const summary =
    '\n\n📊 *Итого:*\n' +
    '  TRX: `' + fmt(totalTrx, 4) + '`' + (price ? ' ≈ $' + fmt(totalTrx * price) : '') + '\n' +
    '  USDT: `' + fmt(totalUsdt, 2) + '`\n' +
    (price ? '  Курс TRX: $' + price.toFixed(4) : '');

  bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
  send(chatId, '💰 *Балансы кошельков:*\n\n' + lines.join('\n\n') + summary, MAIN_KB);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Переименовать
// ─────────────────────────────────────────────────────────────────────────────
function startRename(chatId) {
  const list = getWallets(chatId);
  if (list.length === 0) {
    return send(chatId, '📭 Нет кошельков для переименования.', MAIN_KB);
  }
  setState(chatId, { step: 'rename_pick' });
  send(chatId, '✏️ Выберите кошелёк для переименования:', walletListKB(list));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Удалить
// ─────────────────────────────────────────────────────────────────────────────
function startDelete(chatId) {
  const list = getWallets(chatId);
  if (list.length === 0) {
    return send(chatId, '📭 Нет кошельков для удаления.', MAIN_KB);
  }
  setState(chatId, { step: 'delete_pick' });
  send(chatId, '❌ Выберите кошелёк для удаления:', walletListKB(list));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Обработка шагов диалога
// ─────────────────────────────────────────────────────────────────────────────
async function handleStep(chatId, text, s) {
  const list = getWallets(chatId);

  // ── Добавление: шаг 1 — адрес ──────────────────────────────────────────
  if (s.step === 'add_address') {
    if (!text.startsWith('T') || text.length !== 34) {
      return send(chatId,
        '⚠️ Неверный формат адреса.\n\nTRX-адрес начинается с *T* и содержит *34 символа*.\nПопробуйте ещё раз:',
        cancelKB()
      );
    }
    if (list.find(w => w.address === text)) {
      clearState(chatId);
      return send(chatId, '⚠️ Этот кошелёк уже добавлен.', MAIN_KB);
    }
    setState(chatId, { step: 'add_label', data: { address: text } });
    return send(chatId,
      '✅ Адрес принят: `' + text + '`\n\nВведите *название* для этого кошелька\n_(или отправьте `-` чтобы пропустить)_:',
      cancelKB()
    );
  }

  // ── Добавление: шаг 2 — название ───────────────────────────────────────
  if (s.step === 'add_label') {
    const label   = text === '-' ? '' : text.slice(0, 32);
    const address = s.data.address;
    list.push({ address, label });
    setWallets(chatId, list);
    clearState(chatId);
    return send(chatId,
      '✅ *Кошелёк добавлен!*\n\n' +
      (label ? 'Название: *' + label + '*\n' : '') +
      'Адрес: `' + address + '`\n\n' +
      'Нажмите *💰 Балансы* чтобы проверить.',
      MAIN_KB
    );
  }

  // ── Переименование: шаг 1 — выбор кошелька ─────────────────────────────
  if (s.step === 'rename_pick') {
    const idx = pickWallet(text, list);
    if (idx === -1) {
      return send(chatId, '⚠️ Кошелёк не найден. Выберите из списка:', walletListKB(list));
    }
    setState(chatId, { step: 'rename_label', data: { idx } });
    const w = list[idx];
    return send(chatId,
      'Выбран: ' + (w.label ? '*' + w.label + '*' : '`' + w.address + '`') + '\n\n' +
      'Введите *новое название*\n_(или `-` чтобы убрать название)_:',
      cancelKB()
    );
  }

  // ── Переименование: шаг 2 — новое название ─────────────────────────────
  if (s.step === 'rename_label') {
    const idx      = s.data.idx;
    const newLabel = text === '-' ? '' : text.slice(0, 32);
    list[idx].label = newLabel;
    setWallets(chatId, list);
    clearState(chatId);
    return send(chatId,
      '✅ Переименовано!\n\n' +
      'Адрес: `' + list[idx].address + '`\n' +
      (newLabel ? 'Новое название: *' + newLabel + '*' : '_Название убрано_'),
      MAIN_KB
    );
  }

  // ── Удаление: шаг 1 — выбор кошелька ───────────────────────────────────
  if (s.step === 'delete_pick') {
    const idx = pickWallet(text, list);
    if (idx === -1) {
      return send(chatId, '⚠️ Кошелёк не найден. Выберите из списка:', walletListKB(list));
    }
    setState(chatId, { step: 'delete_confirm', data: { idx } });
    const w = list[idx];
    return send(chatId,
      '⚠️ Удалить кошелёк?\n\n' +
      (w.label ? 'Название: *' + w.label + '*\n' : '') +
      'Адрес: `' + w.address + '`',
      {
        reply_markup: {
          keyboard: [['✅ Да, удалить'], ['🚫 Отмена']],
          resize_keyboard: true,
        },
      }
    );
  }

  // ── Удаление: шаг 2 — подтверждение ────────────────────────────────────
  if (s.step === 'delete_confirm') {
    if (text === '✅ Да, удалить') {
      const idx = s.data.idx;
      const removed = list.splice(idx, 1)[0];
      setWallets(chatId, list);
      clearState(chatId);
      return send(chatId,
        '🗑 Кошелёк удалён:\n`' + removed.address + '`',
        MAIN_KB
      );
    }
    clearState(chatId);
    return send(chatId, '✅ Отменено.', MAIN_KB);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Вспомогательная: найти кошелёк по тексту кнопки (N. Название)
// ─────────────────────────────────────────────────────────────────────────────
function pickWallet(text, list) {
  // По номеру "1. Название"
  const m = text.match(/^(\d+)\./);
  if (m) {
    const idx = parseInt(m[1]) - 1;
    if (idx >= 0 && idx < list.length) return idx;
  }
  // По полному адресу
  const byAddr = list.findIndex(w => w.address === text);
  if (byAddr !== -1) return byAddr;
  // По названию
  const byLabel = list.findIndex(w => w.label && w.label === text);
  return byLabel;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Обработка ошибок polling
// ─────────────────────────────────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('[polling_error]', err.message);
});

console.log('🤖 TRX Wallet Tracker Bot запущен...');
