// ============================================
// TELEGRAM CHANNEL PARSER - МОДУЛЬНАЯ ВЕРСИЯ
// Автоматически парсит товары из канала
// ============================================

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

// ============================================
// КОНФИГУРАЦИЯ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
// ============================================

const CONFIG = {
    // Telegram API credentials
    apiId: parseInt(process.env.TELEGRAM_API_ID || '0'),
    apiHash: process.env.TELEGRAM_API_HASH || '',
    sessionString: process.env.TELEGRAM_SESSION || '',
    
    // Канал и настройки парсинга
    channelUsername: process.env.CHANNEL_USERNAME || 'StealthShopEU',
    postsLimit: parseInt(process.env.POSTS_LIMIT || '50'),
    
    // Telegram бот для уведомлений
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    
    // Путь к файлу products.js
    outputFile: './public/products.js'
};

// ============================================
// ГЛАВНАЯ ФУНКЦИЯ ПАРСИНГА
// ============================================

async function parseChannel() {
    console.log('🚀 Запуск парсера Telegram канала...\n');
    
    if (!CONFIG.apiId || !CONFIG.apiHash) {
        throw new Error('❌ Не указаны TELEGRAM_API_ID и TELEGRAM_API_HASH');
    }
    
    const stringSession = new StringSession(CONFIG.sessionString);
    
    const client = new TelegramClient(stringSession, CONFIG.apiId, CONFIG.apiHash, {
        connectionRetries: 5,
    });
    
    try {
        // Подключаемся (на Railway используем сохранённую сессию)
        await client.connect();
        
        if (!client.connected) {
            throw new Error('Не удалось подключиться к Telegram');
        }
        
        console.log('✅ Подключено к Telegram!\n');
        console.log('📡 Парсинг канала @' + CONFIG.channelUsername + '...\n');
        
        // Получаем канал
        const channel = await client.getEntity(CONFIG.channelUsername);
        
        // Получаем сообщения
        const messages = await client.getMessages(channel, {
            limit: CONFIG.postsLimit
        });
        
        console.log(`📦 Найдено ${messages.length} постов\n`);
        
        // Парсим товары
        const products = [];
        let productId = 1;
        let skippedSold = 0;
        
        for (const message of messages) {
            if (!message.message) continue;
            
            const text = message.message;
            const product = parseProduct(text, message, productId);
            
            if (product === 'SOLD') {
                skippedSold++;
                continue;
            }
            
            if (product) {
                products.push(product);
                productId++;
                console.log(`✅ Товар ${productId - 1}: ${product.brand} ${product.name} - $${product.price}`);
            }
        }
        
        console.log(`\n🎉 Найдено ${products.length} товаров!`);
        if (skippedSold > 0) {
            console.log(`⏭️  Пропущено ${skippedSold} проданных товаров`);
        }
        
        // Сохраняем в файл
        saveProductsFile(products);
        
        console.log(`✅ Файл сохранён: ${CONFIG.outputFile}\n`);
        
        // Отправляем уведомление в Telegram (опционально)
        if (CONFIG.telegramBotToken && CONFIG.telegramChatId) {
            await sendUpdateNotification(products.length, skippedSold);
        }
        
        await client.disconnect();
        
        return products;
        
    } catch (error) {
        console.error('❌ Ошибка парсинга:', error);
        await client.disconnect();
        throw error;
    }
}

// ============================================
// ПАРСИНГ ОДНОГО ТОВАРА
// ============================================

function parseProduct(text, message, id) {
    // ПРОВЕРКА НА ПРОДАННЫЙ ТОВАР
    const soldKeywords = [
        'продан', 'продано', 'sold', 'reserved', 'зарезервирован',
        'не в наличии', 'нет в наличии', 'out of stock', '❌', '✖️',
        'забронирован', 'бронь', 'занято', 'sold out'
    ];
    
    const lowerText = text.toLowerCase();
    
    for (const keyword of soldKeywords) {
        if (lowerText.includes(keyword)) {
            console.log(`⏭️  Пропущен (продан): "${text.substring(0, 50)}..."`);
            return 'SOLD';
        }
    }
    
    // Паттерны для поиска
    const pricePattern = /(\d+)\s*(?:€|EUR|USD|\$|руб)/i;
    const sizePattern = /(?:размер[ыа]?|size[s]?)\s*:?\s*([\d\-,\s]+)/i;
    
    const priceMatch = text.match(pricePattern);
    const sizeMatch = text.match(sizePattern);
    
    // Если не нашли цену - скорее всего не товар
    if (!priceMatch) return null;
    
    const price = parseInt(priceMatch[1]);
    
    // Извлекаем размеры
    let sizes = ['One Size'];
    if (sizeMatch) {
        const sizeText = sizeMatch[1];
        if (sizeText.includes('-')) {
            const [start, end] = sizeText.split('-').map(s => s.trim());
            sizes = [];
            const startNum = parseInt(start);
            const endNum = parseInt(end);
            if (!isNaN(startNum) && !isNaN(endNum)) {
                for (let i = startNum; i <= endNum; i++) {
                    sizes.push(i.toString());
                }
            }
        } else {
            sizes = sizeText.split(/[,\s]+/).map(s => s.trim()).filter(s => s);
        }
    }
    
    // Извлекаем название и бренд
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const firstLine = lines[0] || 'Товар';
    
    let brand = 'Brand';
    let name = firstLine;
    
    const brands = [
        'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance',
        'Supreme', 'Balenciaga', 'Gucci', 'Louis Vuitton',
        'Off-White', 'Yeezy', 'Jordan', 'Vans', 'Converse',
        'The North Face', 'Stone Island', 'CP Company', 'Palace',
        'BAPE', 'Stüssy', 'Carhartt', 'Dickies'
    ];
    
    for (const b of brands) {
        if (firstLine.toLowerCase().includes(b.toLowerCase())) {
            brand = b;
            name = firstLine.replace(new RegExp(b, 'gi'), '').trim();
            break;
        }
    }
    
    // Определяем категорию
    let category = 'clothing';
    
    if (lowerText.match(/кроссовки|ботинки|туфли|обувь|shoes|sneakers|boots/)) {
        category = 'shoes';
    } else if (lowerText.match(/сумка|рюкзак|часы|очки|шапка|кепка|bag|watch|cap|hat|accessory/)) {
        category = 'accessories';
    }
    
    // Извлекаем фото (placeholder на Railway)
    let imageUrl = 'https://via.placeholder.com/500x500/000000/FFFFFF?text=' + encodeURIComponent(brand);
    
    // Описание
    let description = lines.slice(0, 3).join(' ').substring(0, 200);
    
    return {
        id,
        name: name || 'Product',
        brand,
        category,
        price,
        currency: 'USD',
        image: imageUrl,
        description: description || 'Premium quality',
        sizes
    };
}

// ============================================
// СОХРАНЕНИЕ В ФАЙЛ
// ============================================

function saveProductsFile(products) {
    const fileContent = `// Товары из Telegram канала @${CONFIG.channelUsername}
// Автоматически обновлено: ${new Date().toLocaleString('ru-RU')}

const products = ${JSON.stringify(products, null, 4)};

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = products;
}
`;
    
    fs.writeFileSync(CONFIG.outputFile, fileContent, 'utf8');
}

// ============================================
// УВЕДОМЛЕНИЕ В TELEGRAM
// ============================================

async function sendUpdateNotification(productsCount, skippedCount) {
    try {
        const fetch = require('node-fetch');
        
        const message = `
🔄 <b>Каталог обновлён!</b>

✅ Товаров в наличии: ${productsCount}
⏭️ Проданных пропущено: ${skippedCount}

⏰ Время: ${new Date().toLocaleString('ru-RU')}
📡 Канал: @${CONFIG.channelUsername}
        `;
        
        const url = `https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`;
        
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CONFIG.telegramChatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        
    } catch (error) {
        console.error('Ошибка отправки уведомления:', error);
    }
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = { parseChannel };

// Если запущен напрямую
if (require.main === module) {
    parseChannel().catch(console.error);
}
