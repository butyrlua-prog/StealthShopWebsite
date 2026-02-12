// ============================================
// TELEGRAM CHANNEL PARSER - МОДУЛЬНАЯ ВЕРСИЯ
// Автоматически парсит товары из канала
// ============================================

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const https = require('https');
const FormData = require('form-data');

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
// ЗАГРУЗКА ФОТО НА TELEGRAPH
// ============================================

async function uploadToTelegraph(buffer) {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('file', buffer, { filename: 'photo.jpg' });
        
        const req = https.request({
            hostname: 'telegra.ph',
            path: '/upload',
            method: 'POST',
            headers: form.getHeaders()
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result && result[0] && result[0].src) {
                        resolve('https://telegra.ph' + result[0].src);
                    } else {
                        reject(new Error('Telegraph upload failed'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        form.pipe(req);
        req.on('error', reject);
    });
}

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
            const product = await parseProduct(text, message, productId, client);
            
            if (product === 'SOLD') {
                skippedSold++;
                continue;
            }
            
            if (product) {
                products.push(product);
                productId++;
                console.log(`✅ Товар ${productId - 1}: ${product.brand} ${product.name} - ${product.priceDisplay || product.price}`);
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

async function parseProduct(text, message, id, client) {
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
    
    // УЛУЧШЕННЫЙ ПАРСИНГ ЦЕН - берём ВСЕ валюты
    const pricePatterns = {
        byn: /(\d+[\s,]?\d*)\s*(?:BYN|byn|б\.р|руб\.бел)/i,
        usd: /(\d+[\s,]?\d*)\s*(?:USD|\$|usd|долл)/i,
        rub: /(\d+[\s,]?\d*)\s*(?:₽|руб|rub|рублей)/i,
        eur: /(\d+[\s,]?\d*)\s*(?:€|EUR|eur|евро)/i
    };
    
    let prices = {};
    let foundPrice = false;
    
    for (const [currency, pattern] of Object.entries(pricePatterns)) {
        const match = text.match(pattern);
        if (match) {
            const priceValue = parseInt(match[1].replace(/[\s,]/g, ''));
            prices[currency.toUpperCase()] = priceValue;
            foundPrice = true;
        }
    }
    
    // Если не нашли ни одной цены - это не товар
    if (!foundPrice) return null;
    
    // Формируем строку с ценами
    const priceDisplay = Object.entries(prices)
        .map(([curr, val]) => `${val} ${curr}`)
        .join(' / ');
    
    // Основная цена для сортировки (USD если есть, иначе первая найденная)
    const mainPrice = prices.USD || Object.values(prices)[0];
    
    // УЛУЧШЕННЫЙ ПАРСИНГ РАЗМЕРОВ
    // Ищем "Размер: L" или "Размеры: 40-44" или "Size: M"
    const sizePattern = /(?:размер[ыа]?|size[s]?)\s*:?\s*([^\n]+)/i;
    const sizeMatch = text.match(sizePattern);
    
    let sizes = ['One Size'];
    if (sizeMatch) {
        const sizeText = sizeMatch[1].trim();
        
        // Диапазон типа "40-44"
        if (sizeText.match(/^\d+\s*-\s*\d+$/)) {
            const [start, end] = sizeText.split('-').map(s => parseInt(s.trim()));
            sizes = [];
            for (let i = start; i <= end; i++) {
                sizes.push(i.toString());
            }
        }
        // Буквенные размеры или одиночные
        else if (sizeText.match(/^[A-Z0-9]+$/i)) {
            sizes = [sizeText.toUpperCase()];
        }
        // Несколько размеров через запятую "S, M, L"
        else if (sizeText.includes(',') || sizeText.includes('/')) {
            sizes = sizeText.split(/[,\/]/).map(s => s.trim().toUpperCase()).filter(s => s);
        }
        else {
            sizes = [sizeText];
        }
    }
    
    // УЛУЧШЕННОЕ РАСПОЗНАВАНИЕ БРЕНДОВ
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const firstLine = lines[0] || 'Товар';
    
    let brand = 'Brand';
    let name = firstLine;
    
    const brands = [
        'C.P. Company', 'CP Company', 'Stone Island', 'The North Face',
        'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance',
        'Supreme', 'Balenciaga', 'Gucci', 'Louis Vuitton',
        'Off-White', 'Yeezy', 'Jordan', 'Vans', 'Converse',
        'Palace', 'BAPE', 'Stüssy', 'Carhartt', 'Dickies',
        'Ralph Lauren', 'Tommy Hilfiger', 'Lacoste', 'Hugo Boss'
    ];
    
    for (const b of brands) {
        const regex = new RegExp(b.replace('.', '\\.'), 'gi');
        if (firstLine.match(regex)) {
            brand = b;
            name = firstLine.replace(regex, '').trim();
            break;
        }
    }
    
    // Определяем категорию
    let category = 'clothing';
    
    if (lowerText.match(/кроссовки|ботинки|туфли|обувь|shoes|sneakers|boots/)) {
        category = 'shoes';
    } else if (lowerText.match(/сумка|рюкзак|часы|очки|шапка|кепка|bag|watch|cap|hat|accessory/)) {
        category = 'accessories';
    } else if (lowerText.match(/куртка|jacket|ветровка|пуховик|пальто/)) {
        category = 'clothing';
    }
    
    // ЗАГРУЗКА ФОТО ИЗ TELEGRAM
    let imageUrl = 'https://via.placeholder.com/500x500/1a1a1a/FFFFFF?text=' + encodeURIComponent(brand);
    
    if (message.media && message.media.photo && client) {
        try {
            console.log(`  📸 Скачивание фото из сообщения ${message.id}...`);
            
            // Скачиваем фото через Telegram Client
            const buffer = await client.downloadMedia(message.media, { workers: 1 });
            
            if (buffer) {
                // Загружаем на Telegraph
                const telegraphUrl = await uploadToTelegraph(buffer);
                imageUrl = telegraphUrl;
                console.log(`  ☁️  Фото загружено: ${telegraphUrl}`);
            }
            
        } catch (e) {
            console.log(`  ⚠️  Не удалось загрузить фото: ${e.message}`);
        }
    }
    
    // Описание - берём текст до цены
    let description = lines.slice(0, 4).join(' ').substring(0, 250);
    
    return {
        id,
        name: name || 'Product',
        brand,
        category,
        price: mainPrice,
        priceDisplay: priceDisplay, // Все валюты
        currency: 'Multi',
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
