const XLSX = require('xlsx')

let cache = {
  lastFetch: 0,
  ttl: 60 * 1000,
  data: null,
};

function loadExcelFile(dataPath) {
  const workbook = XLSX.readFile(dataPath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json(worksheet);
}

function getData(dataPath) {
  const now = Date.now();

  if (!cache.data || now - cache.lastFetch > cache.ttl) {
    console.log("Снова загружаю файл...");
    cache.data = loadExcelFile(dataPath);
    cache.lastFetch = now;
  } else {
    console.log("Беру файл из кэша")
  }

  return cache.data;
}

function normalizeText(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\[\]\(\)]/g, '') 
    .toLowerCase()
    .trim();
}

function filterSpeakersAndLectures(role, challenge, format, immersion) {
  const data = getData("./data/speakers.xlsx")

  const filteredData = data.filter(row => {
    const roleCell = normalizeText(row['Роль']);
    const challengeCell = normalizeText(row['Вызов']);
    const formatCell = normalizeText(row['Формат']);
    const immersionCell = normalizeText(row['Погружение']);

    const roleTag = normalizeText(role);
    const challengeTag = normalizeText(challenge);
    const formatTag = normalizeText(format);
    const immersionTag = normalizeText(immersion);
    
    return (
      roleCell?.includes(roleTag) &&
      challengeCell?.includes(challengeTag) &&
      formatCell?.includes(formatTag) &&
      immersionCell?.includes(immersionTag) &&
      true
    );
  });

  const result = filteredData.map(row => row['Доклад']);
  return result;
}

require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const answersList1 = require("./data/answers1");
const answersList2 = require("./data/answers2");
const answersList3 = require("./data/answers3");
const answersList4 = require("./data/answers4");

const bot = new Telegraf(process.env.BOT_TOKEN);

let role;
let challenge;
let format;
let immersion;


bot.start((ctx) => {
    console.log("Бот запущен!");
    console.log("Пользователь начал работу:", ctx.chat.id);
  ctx.reply(
    `ВАШ ПЕРСОНАЛЬНЫЙ НАВИГАТОР ПО КОНФЕРЕНЦИИ «МЕДИЦИНА И КАЧЕСТВО. ОБЕСПЕЧЕНИЕ КАЧЕСТВА И БЕЗОПАСНОСТИ МЕДИЦИНСКОЙ ДЕЯТЕЛЬНОСТИ»
    Выберите свой путь к качеству: ответьте на вопросы и получите индивидуальный план действий.
    Этот чек-лист поможет вам не потеряться в море информации и сфокусироваться на самом важном лично для вас. Готовы ответить на вопросы?`,
    Markup.keyboard([
      ["❓ Приступить"],
    ]).resize()
  );
});

bot.hears("❓ Приступить", (ctx) => {
  const buttons = answersList1.map((a) => [a.answer]);
  ctx.reply("Ваша ключевая управленческая роль?", Markup.keyboard([...buttons, ["⬅ Назад"]]).resize());
});

bot.hears(answersList1.map((a) => a.answer), (ctx) => {
  const answer = answersList1.find((a) => a.answer === ctx.message.text);
  if (answer) {
    role = answer.tag;
    ctx.session = ctx.session || {};
    ctx.session.role = role;
    //ctx.reply(answer.tag);
    const buttons = answersList2.map((a) => [a.answer]);
    ctx.reply("Какой вызов для вас сейчас в приоритете?", Markup.keyboard([...buttons, ["⬅ Назад"]]).resize());
  }
});

bot.hears(answersList2.map((a) => a.answer), (ctx) => {
  const answer = answersList2.find((a) => a.answer === ctx.message.text);
  if (answer) {
    challenge = answer.tag
    ctx.session = ctx.session || {};
    ctx.session.challenge = answer.tag;
    //ctx.reply(answer.tag);
    const buttons = answersList3.map((a) => [a.answer]);
    ctx.reply("Какой формат решений вам ближе?", Markup.keyboard([...buttons, ["⬅ Назад"]]).resize());
  }
});

bot.hears(answersList3.map((a) => a.answer), (ctx) => {
  const answer = answersList3.find((a) => a.answer === ctx.message.text);
  if (answer) {
    format = answer.tag
    ctx.session = ctx.session || {};
    ctx.session.format = answer.tag;
    //ctx.reply(answer.tag);
    const buttons = answersList4.map((a) => [a.answer]);
    ctx.reply("На какую глубину погружения вы настраиваетесь?", Markup.keyboard([...buttons, ["⬅ Назад"]]).resize());
  }
});

bot.hears(answersList4.map((a) => a.answer), (ctx) => {
  const answer = answersList4.find((a) => a.answer === ctx.message.text);
  if (answer) {
    immersion = answer.tag
    ctx.session = ctx.session || {};
    ctx.session.immersion = answer.tag;
    //ctx.reply(answer.tag);

    ctx.reply("Спасибо, ваши ответы сохранены ✅");
    const results = filterSpeakersAndLectures(role, challenge, format, immersion)
    if (results.length > 0) {
      ctx.reply(results);
    } else {
      ctx.reply(`Ваш запрос охватывает сразу несколько стратегических направлений! Такой подход заслуживает уважения!\nМы рекомендуем ознакомиться с полной программой: https://inozem.online/npm/2025/pdf/programma.pdf`);
    }
    ctx.reply(`Контакты оргкомитета:\n📞 Тел: +7-905-268-00-94\n📧 Email: akademuy@yandex.ru`);
    ctx.reply(
    `Изменились приоритеты, хотите сосредоточится на других темах — пройдите опрос заново`,
    Markup.keyboard([
      ["❓ Приступить"],
    ]).resize()
  );
  }
});

bot.hears("⬅ Назад", (ctx) => {
    console.log("Нажата кнопка Назад");
  ctx.reply(
    `Вернемся в главное меню`,
    Markup.keyboard([
      ["❓ Приступить"],
    ]).resize()
  );
});

bot.telegram.setMyCommands([
  { command: 'start', description: 'Начать / Главное меню' },
  { command: 'questions', description: 'Приступить к ответам на вопросы' }
]);


bot.launch();
console.log("Бот запущен!");

// старый функционал, который сейчас не используется
/*
bot.hears("📝 Регистрация", (ctx) => {
  ctx.reply(`Подайте заявку на странице мероприятия.\ninozem.online/npm/2025/mic_2025.php Обязательно выбирайте формат участия - очно или онлайн.`);
});

bot.hears("❓ Часто задаваемые вопросы", (ctx) => {
  const buttons = faqList.map((faq) => [faq.question]);
  ctx.reply("Выберите интересующий вопрос:", Markup.keyboard([...buttons, ["⬅ Назад"]]).resize());
});

bot.hears(faqList.map((f) => f.question), (ctx) => {
  const faq = faqList.find((f) => f.question === ctx.message.text);
  if (faq) {
    ctx.reply(faq.answer);
  }
});

 const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: true, // true для 465 порта, false для 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function sendEmail(subject, text) {
  return transporter.sendMail({
    from: `"Conference Bot" <${process.env.SMTP_USER}>`,
    to: process.env.EMAIL_TO,
    subject,
    text
  });
}


let isWaitingForQuestion = {};

bot.hears("📨 Задать вопрос организаторам", (ctx) => {
  isWaitingForQuestion[ctx.chat.id] = true;
  ctx.reply("Пожалуйста, напишите ваш вопрос. Мы передадим его организаторам.");
});

// Обработка вопросов с флагом
bot.on("text", (ctx, next) => {
  const userId = ctx.chat.id;
  if (isWaitingForQuestion[userId]) {
    const message = `📨 Новый вопрос от участника @${ctx.from.username || "без username"}:\n\n${ctx.message.text}`;
    sendEmail("Новый вопрос от участника", message)
      .then(() => ctx.reply("Ваш вопрос отправлен организаторам. Спасибо!"))
      .catch((err) => {
        console.error("Ошибка при отправке письма:", err);
        ctx.reply("Произошла ошибка при отправке. Попробуйте позже.");
      });
    isWaitingForQuestion[userId] = false;
    return; // чтобы не обрабатывать дальше
  }
  next();
});

bot.command('faq', (ctx) => {
  const buttons = faqList.map((faq) => [faq.question]);
  ctx.reply("Выберите интересующий вопрос:", Markup.keyboard([...buttons, ["⬅ Назад"]]).resize());
});

bot.command('register', (ctx) => {
  ctx.reply(`Подайте заявку на странице мероприятия.\ninozem.online/npm/2025/mic_2025.php\nОбязательно выбирайте формат участия - очно или онлайн.`);
});

bot.command('contacts', (ctx) => {
  ctx.reply(`Контакты оргкомитета:\n📞 Тел: +7-905-268-00-94\n📧 Email: akademuy@yandex.ru`);
});

bot.command('question', (ctx) => {
  isWaitingForQuestion[ctx.chat.id] = true;
  ctx.reply("Напишите ваш вопрос. Организаторы ответят вам в telegram в рабочее время (пн-пт, с 9:00 до 17:30 по МСК)");
});
 */