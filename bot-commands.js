// ============================================
// БОТ ДЛЯ УПРАВЛЕНИЯ ПАРСЕРОМ
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const { parseChannel } = require('./parse-channel');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_CHAT_ID;

if (!botToken) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN не установлен - бот команды отключены');
    module.exports = { initBot: () => {} };
} else {
    const bot = new TelegramBot(botToken, { polling: true });
    
    let lastParseTime = null;
    let isParsingNow = false;
    
    // Команда /parse - запустить парсинг
    bot.onText(/\/parse/, async (msg) => {
        const chatId = msg.chat.id.toString();
        const userId = msg.from.id.toString();
        
        // DEBUG логирование
        console.log(`\n🔍 DEBUG /parse:`);
        console.log(`  Команда от: chatId="${chatId}", userId="${userId}"`);
        console.log(`  Ожидается: adminChatId="${adminChatId}"`);
        console.log(`  Chat type: ${msg.chat.type}`);
        console.log(`  Chat title: ${msg.chat.title || 'N/A'}`);
        
        // Проверка: либо из группы, либо от админа лично
        const normalizedChatId = chatId.replace(/-/g, '');
        const normalizedAdminId = adminChatId.replace(/-/g, '');
        
        // ID администратора (ваш личный User ID)
        const adminUserId = '1981582663';
        
        const isFromGroup = normalizedChatId === normalizedAdminId;
        const isFromAdmin = userId === adminUserId;
        
        console.log(`  Normalized chatId: "${normalizedChatId}"`);
        console.log(`  Normalized adminId: "${normalizedAdminId}"`);
        console.log(`  Match by chatId: ${isFromGroup}`);
        console.log(`  Match by userId: ${isFromAdmin}`);
        
        if (!isFromGroup && !isFromAdmin) {
            console.log(`❌ Отказано: ни группа, ни админ\n`);
            bot.sendMessage(chatId, '❌ У вас нет прав для управления парсером');
            return;
        }
        
        console.log(`✅ Доступ разрешён\n`);
        
        if (isParsingNow) {
            bot.sendMessage(chatId, '⏳ Парсинг уже выполняется... Подождите');
            return;
        }
        
        try {
            isParsingNow = true;
            bot.sendMessage(chatId, '🚀 Запускаю парсинг канала...');
            
            const startTime = Date.now();
            await parseChannel();
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            
            lastParseTime = new Date();
            
            bot.sendMessage(chatId, 
                `✅ Парсинг завершён!\n\n` +
                `⏱ Время: ${duration}с\n` +
                `🕐 Завершено: ${lastParseTime.toLocaleString('ru-RU')}\n\n` +
                `Товары обновлены на сайте!`
            );
            
        } catch (error) {
            bot.sendMessage(chatId, 
                `❌ Ошибка парсинга!\n\n` +
                `${error.message}`
            );
        } finally {
            isParsingNow = false;
        }
    });
    
    // Команда /status - показать статус
    bot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id.toString();
        const userId = msg.from.id.toString();
        
        // DEBUG логирование
        console.log(`\n🔍 DEBUG /status:`);
        console.log(`  Команда от: chatId="${chatId}", userId="${userId}"`);
        console.log(`  Ожидается: adminChatId="${adminChatId}"`);
        
        const normalizedChatId = chatId.replace(/-/g, '');
        const normalizedAdminId = adminChatId.replace(/-/g, '');
        
        const adminUserId = '1981582663';
        const isFromGroup = normalizedChatId === normalizedAdminId;
        const isFromAdmin = userId === adminUserId;
        
        console.log(`  Match by chatId: ${isFromGroup}, by userId: ${isFromAdmin}\n`);
        
        if (!isFromGroup && !isFromAdmin) {
            bot.sendMessage(chatId, '❌ У вас нет прав для управления парсером');
            return;
        }
        
        const status = isParsingNow ? '🔄 Выполняется парсинг...' : '✅ Готов к работе';
        const lastParse = lastParseTime 
            ? `🕐 Последний парсинг: ${lastParseTime.toLocaleString('ru-RU')}` 
            : '⏳ Парсинг ещё не запускался';
        
        const autoParse = '⏸️ Автопарсинг: Отключен (только ручной запуск)';
        
        bot.sendMessage(chatId, 
            `📊 СТАТУС ПАРСЕРА\n\n` +
            `${status}\n` +
            `${lastParse}\n` +
            `${autoParse}\n\n` +
            `Используй /parse для ручного запуска`
        );
    });
    
    // Команда /help - помощь
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id.toString();
        
        // DEBUG логирование
        console.log(`\n🔍 DEBUG /help:`);
        console.log(`  Команда от: chatId="${chatId}"`);
        console.log(`  Chat type: ${msg.chat.type}\n`);
        
        bot.sendMessage(chatId, 
            `🤖 КОМАНДЫ УПРАВЛЕНИЯ\n\n` +
            `/parse - Запустить парсинг вручную\n` +
            `/status - Показать статус парсера\n` +
            `/help - Показать это сообщение\n\n` +
            `📋 Парсер обновляет товары только по команде /parse\n` +
            `Запускайте парсинг когда добавили новые товары в канал!`
        );
    });
    
    console.log('✅ Telegram бот запущен - команды доступны');
    
    module.exports = { 
        bot,
        initBot: () => console.log('Bot already initialized')
    };
}
