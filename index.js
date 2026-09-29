require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup, session } = require('telegraf');
const { SocksProxyAgent } = require('socks-proxy-agent');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@inozemonlinetg';
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
  .map(Number);

const PROXY_URL = process.env.PROXY_URL || '';

if (!BOT_TOKEN) {
  throw new Error('Не задан BOT_TOKEN в .env');
}

if (!ADMIN_IDS.length) {
  console.warn('⚠️ ADMIN_IDS не задан. Модерация фотографий работать не будет.');
}

const telegramOptions = PROXY_URL
  ? { agent: new SocksProxyAgent(PROXY_URL) }
  : {};

const bot = new Telegraf(BOT_TOKEN, {
  telegram: telegramOptions,
});

bot.use(session());

const DATA_DIR = path.join(__dirname, 'data');
const PROGRAM_PDF = path.join(DATA_DIR, 'programma.docx');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const ROUTE_URL = 'https://yandex.ru/maps/2/saint-petersburg/?ll=30.363371%2C59.762315&mode=routes&rtext=~59.762315%2C30.363371&rtt=auto&ruri=~ymapsbm1%3A%2F%2Ftransit%2Fstop%3Fid%3Dstop__10073529&z=11';
const EDUCATION_URL = 'https://xn--e1adcscg.xn--p1ai/programs';
const PMFZ_URL = 'https://pmfz.expoforum.ru/ru/';
const CHANNEL_URL = 'https://t.me/inozemonlinetg';

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { applications: {} };
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (error) {
    console.error('Ошибка чтения state.json:', error);
    return { applications: {} };
  }
}

let state = loadState();

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function ensureSession(ctx) {
  if (!ctx.session) ctx.session = {};
  return ctx.session;
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(Number(userId));
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📄 Программа конференции', 'program')],
    [Markup.button.callback('📍 Как добраться', 'location')],
    [Markup.button.callback('🎁 Купон на обучение', 'coupon')],
    [Markup.button.callback('🎓 Программы Академии', 'education')],
    [Markup.button.callback('🏥 ПМФЗ', 'pmfz')],
  ]);
}

function subscriptionMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', CHANNEL_URL)],
    [Markup.button.callback('🔄 Проверить подписку', 'check_subscription')],
  ]);
}

function backMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ В главное меню', 'main_menu')],
  ]);
}

async function isSubscribed(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_USERNAME, userId);
    return ['creator', 'administrator', 'member'].includes(member.status) ||
      (member.status === 'restricted' && member.is_member === true);
  } catch (error) {
    console.error('Ошибка проверки подписки:', error.description || error.message);
    return false;
  }
}

async function requireSubscription(ctx) {
  const subscribed = await isSubscribed(ctx.from.id);

  if (!subscribed) {
    await ctx.reply(
      '👋 Добро пожаловать!\n\n' +
      'Для продолжения работы с ботом необходимо подписаться на официальный канал организатора конференции — Академии медицинского образования им. Ф. И. Иноземцева.\n\n' +
      'После подписки нажмите кнопку «Проверить подписку».',
      subscriptionMenu()
    );
    return false;
  }

  return true;
}

async function showMainMenu(ctx, edit = false) {
  const text =
    '✅ Отлично, подписка подтверждена!\n\n' +
    'Добро пожаловать в официальный бот конференции «Медицина и качество — 2026».\n\n' +
    'Здесь вы можете:\n' +
    '1. Получить программу конференции в электронном формате;\n' +
    '2. Узнать, как добраться до КВЦ «Экспофорум» на автомобиле или общественном транспорте;\n' +
    '3. Получить купон в размере 9 000 ₽ на любую программу Академии медицинского образования им. Ф. И. Иноземцева трудоёмкостью от 36 академических часов;\n' +
    '4. Ознакомиться с образовательными программами Академии и подобрать обучение для профессионального развития;\n' +
    '5. Узнать больше о Петербургском международном форуме здоровья (ПМФЗ);\n' +
    '6. Получать актуальную информацию о мероприятии, спикерах и организационных изменениях.\n\n' +
    'Выберите интересующий раздел в меню ниже 👇';

  if (edit && ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, mainMenu());
      return;
    } catch (_) {}
  }

  await ctx.reply(text, mainMenu());
}

bot.start(async (ctx) => {
  console.log('START:', ctx.from.id, ctx.from.username || 'без username');
  ensureSession(ctx).waitingForPhoto = false;

  if (await requireSubscription(ctx)) {
    await showMainMenu(ctx);
  }
});

bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery();

  if (!(await isSubscribed(ctx.from.id))) {
    await ctx.reply(
      '❌ Подписка не найдена.\n\nПодпишитесь на канал и затем снова нажмите «Проверить подписку».',
      subscriptionMenu()
    );
    return;
  }

  await showMainMenu(ctx);
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireSubscription(ctx))) return;
  await showMainMenu(ctx);
});

bot.action('program', async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireSubscription(ctx))) return;

  if (!fs.existsSync(PROGRAM_PDF)) {
    await ctx.reply(
      '📄 Программа конференции\n\n' +
      'Файл с утверждённой программой пока не загружен. Как только программа будет утверждена, организаторы добавят её в бот.',
      backMenu()
    );
    return;
  }

  await ctx.reply(
    '📄 Программа конференции\n\n' +
    'Актуальная программа IX Межрегиональной научно-практической конференции «Медицина и качество. Обеспечение качества и безопасности медицинской деятельности».\n\n' +
    'В программе вы найдёте:\n' +
    '• расписание секций и выступлений;\n' +
    '• информацию о спикерах;\n' +
    '• ключевые темы конференции;\n' +
    '• время проведения мероприятий;\n' +
    '• организационную информацию для участников.',
    backMenu()
  );

  await ctx.replyWithDocument({ source: PROGRAM_PDF }, {
    caption: '📄 Программа конференции «Медицина и качество — 2026»',
  });
});

bot.action('location', async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireSubscription(ctx))) return;

  const text =
    '📍 Как добраться до КВЦ «Экспофорум»\n\n' +
    'Адрес проведения конференции:\n' +
    'Санкт-Петербург, КВЦ «Экспофорум», Петербургское шоссе, 64/1\n\n' +
    '🚇 На общественном транспорте\n' +
    'От станции метро «Московская»:\n' +
    '• автобус № 187\n' +
    '• автобус № 299\n' +
    '• автобус № 478\n' +
    '• автобус № 400Э (курсирует только в дни проведения мероприятий)\n\n' +
    'От станции метро «Звёздная»:\n' +
    '• автобус № 232\n\n' +
    '🚌 Бесплатные шаттлы\n' +
    'В дни проведения мероприятий до КВЦ «Экспофорум» курсируют бесплатные шаттлы.\n\n' +
    '📍 Место отправления: ст. м. «Московская», Московский проспект, д. 197\n' +
    'Шаттлы легко узнать по табличке «ЭКСПОФОРУМ» (EXPOFORUM) на лобовом стекле.\n\n' +
    '🚕 На такси или личном автомобиле\n' +
    'Для навигатора используйте адрес: Петербургское шоссе, 64/1, КВЦ «Экспофорум».\n\n' +
    'Основной маршрут проходит по Пулковскому шоссе с поворотом в сторону г. Пушкин согласно дорожным указателям на «Экспофорум».';

  await ctx.reply(text, Markup.inlineKeyboard([
    [Markup.button.url('🗺️ Построить маршрут', ROUTE_URL)],
    [Markup.button.callback('⬅️ В главное меню', 'main_menu')],
  ]));
});

bot.action('education', async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireSubscription(ctx))) return;

  await ctx.reply(
    '🎓 Образовательные программы Академии\n\n' +
    'Академия медицинского образования им. Ф. И. Иноземцева реализует программы дополнительного профессионального образования для специалистов здравоохранения.\n\n' +
    'Мы помогаем врачам и среднему медицинскому персоналу повышать квалификацию, осваивать новые компетенции и проходить профессиональную переподготовку в соответствии с актуальными требованиями отрасли.\n\n' +
    '✅ Все образовательные программы лицензированы и реализуются в соответствии с законодательством Российской Федерации.\n\n' +
    'Перейдите в раздел «Обучение», чтобы ознакомиться с программами и подобрать подходящий курс для профессионального развития. 👇',
    Markup.inlineKeyboard([
      [Markup.button.url('🎓 Перейти к программам обучения', EDUCATION_URL)],
      [Markup.button.callback('⬅️ В главное меню', 'main_menu')],
    ])
  );
});

bot.action('pmfz', async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireSubscription(ctx))) return;

  await ctx.reply(
    '🏥 Петербургский международный форум здоровья (ПМФЗ)\n\n' +
    'Конференция «Медицина и качество — 2026» проходит в рамках Петербургского международного форума здоровья — одного из крупнейших отраслевых событий в сфере здравоохранения.\n\n' +
    'ПМФЗ объединяет представителей органов государственной власти, бизнеса, науки, профессионального медицинского сообщества и практического здравоохранения для совместной работы над вопросами развития отрасли и повышения качества медицинской помощи.\n\n' +
    'Форум способствует формированию комплексного междисциплинарного подхода к здравоохранению, укреплению здоровья населения, развитию современных медицинских технологий и достижению технологической независимости в сфере здравоохранения.\n\n' +
    '🔗 Подробнее о программе, мероприятиях и участниках форума можно узнать на официальном сайте ПМФЗ.',
    Markup.inlineKeyboard([
      [Markup.button.url('🌐 Официальный сайт ПМФЗ', PMFZ_URL)],
      [Markup.button.callback('⬅️ В главное меню', 'main_menu')],
    ])
  );
});

bot.action('coupon', async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireSubscription(ctx))) return;

  const userId = String(ctx.from.id);
  const existing = state.applications[userId];

  if (existing?.status === 'approved' && existing.coupon) {
    await ctx.reply(
      '🎁 Ваша заявка уже одобрена.\n\n' +
      `Ваш персональный купон: ${existing.coupon}\n\n` +
      'Купон номиналом 9 000 ₽ можно использовать на любую программу Академии медицинского образования им. Ф. И. Иноземцева трудоёмкостью от 36 академических часов.',
      backMenu()
    );
    return;
  }

  if (existing?.status === 'pending') {
    await ctx.reply(
      '⏳ Ваша фотография уже отправлена организаторам и находится на проверке.\n\nОбычно проверка занимает до 3 рабочих дней. Следите за сообщениями в боте.',
      backMenu()
    );
    return;
  }

  ensureSession(ctx).waitingForConsent = false;
  ensureSession(ctx).waitingForPhoto = false;

  await ctx.reply(
    '🎁 Получить купон на обучение номиналом 9 000 ₽\n\n' +
    'Посетили конференцию «Медицина и качество — 2026»? Получите купон номиналом 9 000 ₽ на любую программу Академии медицинского образования им. Ф. И. Иноземцева трудоёмкостью от 36 академических часов.\n\n' +
    'Для получения купона необходимо отправить фотографию, подтверждающую ваше участие в конференции:\n' +
    '📸 со спикером;\n' +
    '📸 на фоне баннера;\n' +
    '📸 в конференц-зале;\n' +
    '📸 на площадке мероприятия;\n' +
    '📸 или любую другую фотографию, подтверждающую ваше присутствие.\n\n' +
    'Перед отправкой фотографии ознакомьтесь с условиями обработки фотоматериалов.',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Согласен(на)', 'coupon_consent')],
      [Markup.button.callback('⬅️ В главное меню', 'main_menu')],
    ])
  );
});

bot.action('coupon_consent', async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireSubscription(ctx))) return;

  const sessionData = ensureSession(ctx);
  sessionData.waitingForPhoto = true;
  sessionData.waitingForConsent = false;

  await ctx.reply(
    '📸 Согласие принято.\n\n' +
    'Теперь отправьте одним сообщением фотографию, подтверждающую ваше участие в конференции.\n\n' +
    'После отправки фотография будет направлена организаторам на проверку.'
  );
});

bot.on('photo', async (ctx) => {
  if (!(await requireSubscription(ctx))) return;

  const sessionData = ensureSession(ctx);

  if (!sessionData.waitingForPhoto) {
    await ctx.reply('Чтобы отправить фотографию для получения купона, сначала откройте раздел «🎁 Купон на обучение».', mainMenu());
    return;
  }

  const userId = String(ctx.from.id);
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const applicationId = `${userId}_${Date.now()}`;

  state.applications[userId] = {
    applicationId,
    userId: Number(ctx.from.id),
    username: ctx.from.username || null,
    firstName: ctx.from.first_name || '',
    lastName: ctx.from.last_name || '',
    status: 'pending',
    photoFileId: photo.file_id,
    createdAt: new Date().toISOString(),
    coupon: null,
  };
  saveState();

  sessionData.waitingForPhoto = false;

  const caption =
    '📸 Новая заявка на купон\n\n' +
    `ID заявки: ${applicationId}\n` +
    `Telegram ID: ${ctx.from.id}\n` +
    `Пользователь: ${ctx.from.username ? '@' + ctx.from.username : 'без username'}\n` +
    `Имя: ${[ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'не указано'}\n\n` +
    'Выберите действие:';

  const moderationKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Одобрить', `approve:${applicationId}`),
      Markup.button.callback('❌ Отклонить', `reject:${applicationId}`),
    ],
  ]);

  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendPhoto(adminId, photo.file_id, {
        caption,
        ...moderationKeyboard,
      });
    } catch (error) {
      console.error(`Не удалось отправить заявку админу ${adminId}:`, error.description || error.message);
    }
  }

  await ctx.reply(
    'Спасибо за участие в конференции «Медицина и качество — 2026».\n\n' +
    'Мы проверим фотографию и убедимся, что она соответствует условиям акции. После проверки вам будет направлен персональный купон номиналом 9 000 ₽ на обучение в Академии медицинского образования им. Ф. И. Иноземцева.\n\n' +
    '⏳ Обычно проверка занимает до 3 рабочих дней.\n\n' +
    'Следите за сообщениями в боте — купон будет отправлен сюда после подтверждения участия.',
    backMenu()
  );
});

bot.action(/^approve:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;

  const applicationId = ctx.match[1];
  const application = Object.values(state.applications).find((item) => item.applicationId === applicationId);

  if (!application) {
    await ctx.reply('❌ Заявка не найдена.');
    return;
  }

  if (application.status !== 'pending') {
    await ctx.reply(`ℹ️ Заявка уже обработана. Статус: ${application.status}`);
    return;
  }

  ensureSession(ctx).couponApplicationId = applicationId;
  ensureSession(ctx).waitingForCoupon = true;

  await ctx.reply(
    `Заявка ${applicationId} одобрена.\n\nВведите персональный код купона одним сообщением.\n\nНапример: MIC2026-12345`
  );
});

bot.action(/^reject:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;

  const applicationId = ctx.match[1];
  const application = Object.values(state.applications).find((item) => item.applicationId === applicationId);

  if (!application) {
    await ctx.reply('❌ Заявка не найдена.');
    return;
  }

  if (application.status !== 'pending') {
    await ctx.reply(`ℹ️ Заявка уже обработана. Статус: ${application.status}`);
    return;
  }

  application.status = 'rejected';
  application.reviewedAt = new Date().toISOString();
  application.reviewedBy = Number(ctx.from.id);
  saveState();

  try {
    await bot.telegram.sendMessage(
      application.userId,
      '❌ К сожалению, фотография не подтверждена организаторами.\n\nЕсли вы считаете, что произошла ошибка, обратитесь в оргкомитет.'
    );
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error.description || error.message);
  }

  await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  await ctx.reply(`❌ Заявка ${applicationId} отклонена.`);
});

bot.on('text', async (ctx, next) => {
  const sessionData = ensureSession(ctx);

  if (isAdmin(ctx.from.id) && sessionData.waitingForCoupon) {
    const coupon = ctx.message.text.trim();
    const applicationId = sessionData.couponApplicationId;
    const application = Object.values(state.applications).find((item) => item.applicationId === applicationId);

    if (!application) {
      sessionData.waitingForCoupon = false;
      sessionData.couponApplicationId = null;
      await ctx.reply('❌ Заявка не найдена.');
      return;
    }

    if (application.status !== 'pending') {
      sessionData.waitingForCoupon = false;
      sessionData.couponApplicationId = null;
      await ctx.reply(`ℹ️ Заявка уже обработана. Статус: ${application.status}`);
      return;
    }

    application.status = 'approved';
    application.coupon = coupon;
    application.reviewedAt = new Date().toISOString();
    application.reviewedBy = Number(ctx.from.id);
    saveState();

    sessionData.waitingForCoupon = false;
    sessionData.couponApplicationId = null;

    try {
      await bot.telegram.sendMessage(
        application.userId,
        '🎉 Ваша заявка подтверждена!\n\n' +
        `Ваш персональный купон: ${coupon}\n\n` +
        'Номинал купона — 9 000 ₽. Купон можно использовать на любую программу Академии медицинского образования им. Ф. И. Иноземцева трудоёмкостью от 36 академических часов.\n\n' +
        'Подробнее о программах обучения:',
        Markup.inlineKeyboard([
          [Markup.button.url('🎓 Программы Академии', EDUCATION_URL)],
          [Markup.button.callback('⬅️ В главное меню', 'main_menu')],
        ])
      );
    } catch (error) {
      console.error('Ошибка отправки купона пользователю:', error.description || error.message);
    }

    await ctx.reply(`✅ Купон ${coupon} сохранён и отправлен пользователю.`);
    return;
  }

  await next();
});

bot.command('menu', async (ctx) => {
  if (await requireSubscription(ctx)) await showMainMenu(ctx);
});

bot.command('start', async () => {});

bot.telegram.setMyCommands([
  { command: 'start', description: 'Начать / Главное меню' },
  { command: 'menu', description: 'Открыть главное меню' },
]);

bot.catch((error, ctx) => {
  console.error('Ошибка бота:', error);
  ctx.reply('Произошла техническая ошибка. Попробуйте ещё раз позже.').catch(() => {});
});

bot.launch();
console.log('🤖 Бот «Медицина и качество — 2026» запущен');
console.log(`📢 Канал: ${CHANNEL_USERNAME}`);
console.log(`👮 Администраторы: ${ADMIN_IDS.length}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
