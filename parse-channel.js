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
    postsLimit: parseInt(process.env.POSTS_LIMIT || '500'),  // Увеличен лимит до 500
    
    // ImgBB API для загрузки фото
    imgbbApiKey: process.env.IMGBB_API_KEY || '',
    
    // Telegram бот для уведомлений
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    
    // Путь к файлу products.js
    outputFile: './public/products.js'
};

// ============================================
// ЗАГРУЗКА ФОТО НА IMGBB
// ============================================

async function uploadToImgBB(buffer) {
    const apiKey = CONFIG.imgbbApiKey || process.env.IMGBB_API_KEY;
    
    if (!apiKey) {
        throw new Error('IMGBB_API_KEY not configured');
    }
    
    return new Promise((resolve, reject) => {
        const FormData = require('form-data');
        const form = new FormData();
        
        // ImgBB требует base64
        const base64Image = buffer.toString('base64');
        form.append('image', base64Image);
        
        const req = https.request({
            hostname: 'api.imgbb.com',
            path: `/1/upload?key=${apiKey}`,
            method: 'POST',
            headers: form.getHeaders()
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.success && result.data && result.data.url) {
                        resolve(result.data.url);
                    } else {
                        reject(new Error('ImgBB: ' + (result.error?.message || 'Upload failed')));
                    }
                } catch (e) {
                    reject(new Error('ImgBB parse error: ' + e.message));
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
        let skippedOther = 0;
        
        for (const message of messages) {
            if (!message.message) continue;
            
            const text = message.message;
            const product = await parseProduct(text, message, productId, client);
            
            if (product === 'SOLD') {
                skippedSold++;
                continue;
            }
            
            if (product === 'SKIP') {
                skippedOther++;
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
        if (skippedOther > 0) {
            console.log(`⏭️  Пропущено ${skippedOther} объявлений/розыгрышей`);
        }
        
        // Сохраняем в файл
        saveProductsFile(products);
        
        console.log(`✅ Файл сохранён: ${CONFIG.outputFile}\n`);
        
        // Отправляем уведомление в Telegram (опционально)
        if (CONFIG.telegramBotToken && CONFIG.telegramChatId) {
            await sendUpdateNotification(products.length, skippedSold);
        }
        
        // Правильное отключение клиента
        console.log('🔌 Отключение от Telegram...');
        try {
            await client.disconnect();
            await client.destroy();
        } catch (e) {
            console.log('Клиент уже отключен');
        }
        
        return products;
        
    } catch (error) {
        console.error('❌ Ошибка парсинга:', error);
        
        // Отключаем клиент даже при ошибке
        try {
            await client.disconnect();
            await client.destroy();
        } catch (e) {
            // Игнорируем ошибки отключения
        }
        
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
    
    // ПРОВЕРКА НА РОЗЫГРЫШИ И ОБЪЯВЛЕНИЯ
    const skipKeywords = [
        'розыгрыш', 'giveaway', 'конкурс', 'contest', 'раздача',
        'сертификат', 'certificate', 'подарок', 'gift',
        'участвуй', 'participate', 'инстаграм', 'instagram',
        'внимание', 'attention', 'объявление', 'announcement',
        'скидка до', 'sale up to', 'акция', 'promotion',
        'открытие', 'opening', 'поступление', 'new arrival'
    ];
    
    for (const keyword of skipKeywords) {
        if (lowerText.includes(keyword)) {
            console.log(`⏭️  Пропущен (объявление/розыгрыш): "${text.substring(0, 50)}..."`);
            return 'SKIP';
        }
    }
    
    // УЛУЧШЕННЫЙ ПАРСИНГ ЦЕН - берём ВСЕ валюты
    const pricePatterns = {
        byn: /(\d+[\s,.]?\d*)\s*(?:BYN|byn|б\.р|руб\.бел)/i,
        usd: /(\d+[\s,.]?\d*)\s*(?:USD|\$|usd|долл)/i,
        rub: /(\d+[\s,.]?\d*)\s*(?:₽|руб|rub|рублей)/i,
        eur: /(\d+[\s,.]?\d*)\s*(?:€|EUR|eur|евро)/i
    };
    
    let prices = {};
    let foundPrice = false;
    
    for (const [currency, pattern] of Object.entries(pricePatterns)) {
        const match = text.match(pattern);
        if (match) {
            // ВАЖНО: Убираем ВСЕ пробелы, запятые И точки внутри числа
            const priceValue = parseInt(match[1].replace(/[\s,.]/g, ''));
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
    
    // ОГРОМНАЯ БАЗА БРЕНДОВ (100+ популярных мировых брендов)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const firstLine = lines[0] || 'Товар';
    
    let brand = 'Brand';
    let name = firstLine;
    
    // МАКСИМАЛЬНАЯ база брендов - сначала длинные названия!
    const brands = [
        // Премиум дизайнерские (длинные названия первыми!)
        'COSTUME NATIONAL', 'BEVERLY HILLS POLO CLUB', 'Vivienne Westwood', 
        'Alexander McQueen', 'Dolce & Gabbana', 'Brunello Cucinelli',
        
        // Премиум и дизайнерские
        'The North Face', 'C.P. Company', 'CP Company', 'Stone Island', 
        'Ralph Lauren', 'Tommy Hilfiger', 'Hugo Boss', 'Polo Ralph Lauren',
        'Louis Vuitton', 'Balenciaga', 'Off-White', 'Bottega Veneta',
        'Maison Margiela', 'Acne Studios', 'AMI Paris', 'Moncler',
        'Burberry', 'Givenchy', 'Valentino', 'Versace', 'Armani',
        'Giorgio Armani', 'Emporio Armani', 'Prada', 'Fendi', 'Dior',
        'Saint Laurent', 'YSL', 'Celine', 'Gucci', 'Hermès',
        
        // Спортивные бренды
        'U.S. POLO ASSN.', 'U.S. POLO', 'New Balance', 'Reebok', 'Asics',
        'Nike', 'Adidas', 'Puma', 'Jordan', 'Air Jordan', 'Yeezy', 
        'Converse', 'Vans', 'Saucony', 'Brooks', 'Mizuno', 'Under Armour',
        'Salomon', 'Arc\'teryx', 'Hoka One One', 'On Running',
        
        // Streetwear
        'Supreme', 'Palace', 'BAPE', 'A Bathing Ape', 'Stüssy', 'Stussy',
        'Carhartt WIP', 'Carhartt', 'Dickies', 'Obey', 'HUF', 'Primitive',
        'Anti Social Social Club', 'ASSC', 'Brain Dead', 'Pleasures',
        
        // Спортивные бренды средний сегмент
        'Champion', 'Fila', 'Kappa', 'Ellesse', 'Umbro', 'Lotto',
        'Diadora', 'Le Coq Sportif', 'Sergio Tacchini',
        
        // Outdoor/спорт
        'Napapijri', 'Patagonia', 'Columbia', 'Helly Hansen', 'Timberland',
        'The Northface', 'Fjällräven', 'Mammut', 'Black Diamond',
        
        // Casual/lifestyle
        'Lacoste', 'Fred Perry', 'Paul Smith', 'Ted Baker', 'COS',
        'Uniqlo', 'Massimo Dutti', 'Zara', 'H&M', 'GAP', 'Levi\'s',
        'Wrangler', 'Lee', 'Calvin Klein', 'Diesel', 'G-Star RAW',
        
        // Скейт/уличные бренды
        'Thrasher', 'Santa Cruz', 'Independent', 'Spitfire', 'Baker',
        'Girl', 'Chocolate', 'Element', 'Volcom', 'DC', 'Etnies',
        'DVS', 'Emerica', 'Globe',
        
        // Workwear
        'Dickies', 'Carhartt', 'Walls', 'Red Kap', 'Ben Davis',
        
        // Другие популярные
        'Pierre Balmain', 'Balmain', 'DONDUP', 'Jacob Cohen', 'PT01',
        'Eleventy', 'Boglioli', 'Lardini', 'Tagliatore', 'Ring Jacket'
    ];
    
    // Ищем бренд (сначала точное совпадение как отдельное слово)
    for (const b of brands) {
        // Создаём регулярное выражение для поиска бренда
        // Экранируем специальные символы
        const escapedBrand = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('\\b' + escapedBrand + '\\b', 'gi');
        
        if (firstLine.match(regex)) {
            brand = b;
            name = firstLine.replace(regex, '').trim();
            break;
        }
    }
    
    // Если не нашли в первой строке - ищем во всём тексте
    if (brand === 'Brand') {
        const fullTextLower = text.toLowerCase();
        for (const b of brands) {
            if (fullTextLower.includes(b.toLowerCase())) {
                brand = b;
                break;
            }
        }
    }
    
    // Определяем категорию
    let category = 'clothing';
    
    if (lowerText.match(/кроссовки|ботинки|туфли|обувь|shoes|sneakers|boots/)) {
        category = 'shoes';
    } else if (lowerText.match(/сумка|клатч|рюкзак|кошелёк|кошелек|портмоне|часы|очки|шапка|кепка|ремень|пояс|серьги|подвеска|цепь|браслет|кольцо|перчатки|шарф|платок|галстук|бабочка|bag|clutch|wallet|purse|backpack|watch|glasses|sunglasses|cap|hat|belt|earrings|pendant|chain|bracelet|ring|gloves|scarf|tie|accessory/)) {
        category = 'accessories';
    } else if (lowerText.match(/куртка|jacket|ветровка|пуховик|пальто/)) {
        category = 'clothing';
    }
    
    // ЗАГРУЗКА ФОТО ИЗ TELEGRAM НА IMGBB
    let imageUrl = `https://via.placeholder.com/500x500/1a1a1a/FFFFFF?text=${encodeURIComponent(brand)}`;
    
    if (message.media && message.media.photo && client && CONFIG.imgbbApiKey) {
        try {
            console.log(`  📸 Скачивание фото из сообщения ${message.id}...`);
            
            // Скачиваем фото через Telegram Client
            const buffer = await client.downloadMedia(message.media, { 
                workers: 1,
                progressCallback: null
            });
            
            if (buffer && Buffer.isBuffer(buffer)) {
                // Небольшая задержка чтобы не перегружать API
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Загружаем на ImgBB
                const imgbbUrl = await uploadToImgBB(buffer);
                imageUrl = imgbbUrl;
                console.log(`  ☁️  Фото загружено на ImgBB: ${imgbbUrl}`);
            } else {
                console.log(`  ⚠️  Фото не скачалось (пустой буфер)`);
            }
            
        } catch (e) {
            console.log(`  ⚠️  Ошибка фото: ${e.message}`);
            // Используем placeholder если фото не загрузилось
        }
    } else if (!CONFIG.imgbbApiKey) {
        console.log(`  ⚠️  IMGBB_API_KEY не настроен - используем placeholder`);
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
