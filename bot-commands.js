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
        
        // Проверка что команду отправил администратор
        // Сравниваем без минусов и приводим к строкам
        const normalizedChatId = chatId.replace('-', '');
        const normalizedAdminId = adminChatId.replace('-', '');
        
        if (normalizedChatId !== normalizedAdminId) {
            console.log(`❌ Отказано: chatId=${chatId}, adminChatId=${adminChatId}`);
            bot.sendMessage(chatId, '❌ У вас нет прав для управления парсером');
            return;
        }
        
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
        
        const normalizedChatId = chatId.replace('-', '');
        const normalizedAdminId = adminChatId.replace('-', '');
        
        if (normalizedChatId !== normalizedAdminId) {
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
