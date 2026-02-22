// ============================================
// STEALTHSHOP - EXPRESS SERVER
// Хостинг сайта на Railway
// ============================================

const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { parseChannel } = require('./parse-channel');

// Инициализация бота для управления парсером
require('./bot-commands');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint для получения товаров
app.get('/api/products', (req, res) => {
    try {
        const products = require('./public/products.js');
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Не удалось загрузить товары' });
    }
});

// API endpoint для отправки уведомлений о заказах
app.post('/api/send-order', async (req, res) => {
    try {
        const orderData = req.body;
        
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (!botToken || !chatId) {
            console.error('Telegram bot credentials not configured');
            return res.status(500).json({ error: 'Bot not configured' });
        }
        
        // Логирование для отладки
        console.log('📦 Новый заказ:');
        console.log('  Товар:', orderData.product.brand, orderData.product.name);
        console.log('  Фото URL:', orderData.product.image);
        
        const message = `
🛍 <b>НОВЫЙ ЗАКАЗ!</b>

━━━━━━━━━━━━━━━━━━━
📋 <b>Номер заказа:</b> <code>${orderData.orderId}</code>

📦 <b>ТОВАР:</b>
• ${orderData.product.brand} ${orderData.product.name}
• Размер: ${orderData.product.size}
• Цена: ${orderData.product.priceDisplay || orderData.product.price}

👤 <b>ПОКУПАТЕЛЬ:</b>
• Имя: ${orderData.customer.name}
• Telegram: ${orderData.customer.telegram}
• Телефон: ${orderData.customer.phone}

💬 <b>Комментарий:</b>
${orderData.customer.comment || 'Нет'}

⏰ <b>Время заказа:</b> ${orderData.timestamp}

━━━━━━━━━━━━━━━━━━━
✅ Покупатель будет перенаправлен в ваш Telegram
        `;
        
        const fetch = require('node-fetch');
        
        // Проверка фото
        const hasRealPhoto = orderData.product.image && 
                             !orderData.product.image.includes('placeholder') &&
                             (orderData.product.image.includes('ibb.co') || 
                              orderData.product.image.includes('telegra.ph'));
        
        console.log('  Есть фото:', hasRealPhoto ? 'ДА' : 'НЕТ');
        
        if (hasRealPhoto) {
            console.log('  📸 Отправляю с фото...');
            
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    photo: orderData.product.image,
                    caption: message,
                    parse_mode: 'HTML'
                })
            });
            
            const result = await response.json();
            
            if (result.ok) {
                console.log('  ✅ Отправлено с фото!');
                res.json({ success: true });
            } else {
                console.error('  ❌ Ошибка Telegram API:', result);
                // Если не получилось с фото - пробуем без фото
                console.log('  📝 Отправляю без фото...');
                const textResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'HTML'
                    })
                });
                const textResult = await textResponse.json();
                if (textResult.ok) {
                    console.log('  ✅ Отправлено без фото');
                    res.json({ success: true, photoFailed: true });
                } else {
                    console.error('  ❌ Не удалось отправить:', textResult);
                    res.status(500).json({ error: 'Failed to send notification' });
                }
            }
        } else {
            console.log('  📝 Отправляю без фото (нет реального фото)');
            
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            
            const result = await response.json();
            
            if (result.ok) {
                console.log('  ✅ Отправлено без фото');
                res.json({ success: true });
            } else {
                console.error('  ❌ Ошибка:', result);
                res.status(500).json({ error: 'Failed to send notification' });
            }
        }
        
    } catch (error) {
        console.error('❌ Order notification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint для получения конфигурации
app.get('/api/config', (req, res) => {
    res.json({
        sellerTelegram: process.env.SELLER_TELEGRAM || 'stealthshop'
    });
});

// API endpoint для ручного обновления товаров
app.post('/api/update-products', async (req, res) => {
    try {
        console.log('🔄 Запуск парсинга по запросу...');
        await parseChannel();
        res.json({ success: true, message: 'Товары обновлены!' });
    } catch (error) {
        console.error('❌ Ошибка парсинга:', error);
        res.status(500).json({ error: 'Ошибка обновления товаров' });
    }
});

// Health check endpoint для Railway
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Debug endpoint для проверки переменных окружения (только для отладки!)
app.get('/api/debug-config', (req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    res.json({
        hasBotToken: !!botToken,
        botTokenPreview: botToken ? botToken.substring(0, 10) + '...' : 'NOT SET',
        hasChatId: !!chatId,
        chatIdValue: chatId || 'NOT SET',
        chatIdType: typeof chatId
    });
});

// ============================================
// CRON JOB - АВТООБНОВЛЕНИЕ КАЖДЫЙ ЧАС
// ============================================

// Автоматический парсинг ОТКЛЮЧЕН
// Используйте команду /parse в боте для ручного запуска
/*
if (process.env.ENABLE_AUTO_PARSE === 'true') {
    cron.schedule('0 3 * * *', async () => {
        console.log('⏰ Запуск автоматического парсинга...');
        try {
            await parseChannel();
            console.log('✅ Автоматическое обновление завершено!');
        } catch (error) {
            console.error('❌ Ошибка автообновления:', error);
        }
    });
    
    console.log('✅ Автообновление включено (каждый день в 3:00)');
}
*/

console.log('📌 Автопарсинг отключен. Используйте команду /parse в боте для запуска парсинга вручную.');

// Запуск сервера
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║                                       ║
║       🚀 STEALTHSHOP ЗАПУЩЕН!        ║
║                                       ║
║  Сайт: http://localhost:${PORT}        ║
║  API:  http://localhost:${PORT}/api   ║
║                                       ║
╚═══════════════════════════════════════╝
    `);
    
    // Первый парсинг при запуске (опционально)
    if (process.env.PARSE_ON_START === 'true') {
        console.log('🔄 Первоначальный парсинг канала...');
        parseChannel().catch(console.error);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('⏹️  Остановка сервера...');
    process.exit(0);
});
