// ============================================
// STEALTHSHOP - EXPRESS SERVER
// Хостинг сайта на Railway
// ============================================

const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { parseChannel } = require('./parse-channel');

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

// ============================================
// CRON JOB - АВТООБНОВЛЕНИЕ КАЖДЫЙ ЧАС
// ============================================

if (process.env.ENABLE_AUTO_PARSE === 'true') {
    // Запуск каждый час в :00
    cron.schedule('0 * * * *', async () => {
        console.log('⏰ Запуск автоматического парсинга...');
        try {
            await parseChannel();
            console.log('✅ Автоматическое обновление завершено!');
        } catch (error) {
            console.error('❌ Ошибка автообновления:', error);
        }
    });
    
    console.log('✅ Автообновление включено (каждый час)');
}

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
