// ============================================
// КОНФИГУРАЦИЯ - ЗАГРУЖАЕТСЯ АВТОМАТИЧЕСКИ
// ============================================

const CONFIG = {
    telegramBotToken: '',  // Загружается с сервера
    telegramChatId: '',    // Загружается с сервера
    sellerUsername: 'stealthshop'  // Default, загружается с сервера
};

// Загрузка конфигурации с сервера
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const serverConfig = await response.json();
        CONFIG.sellerUsername = serverConfig.sellerTelegram || 'stealthshop';
    } catch (error) {
        console.error('Config load error:', error);
    }
}

// ============================================
// ОСНОВНОЙ КОД
// ============================================

let currentProduct = null;
let selectedSize = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();  // Загружаем конфиг первым делом
    loadProducts();
    initializeEventListeners();
});

// Load and display products
function loadProducts(category = 'all') {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';
    
    const filteredProducts = category === 'all' 
        ? products 
        : products.filter(p => p.category === category);
    
    filteredProducts.forEach(product => {
        const card = createProductCard(product);
        grid.appendChild(card);
    });
}

// Create product card
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.onclick = () => openProductModal(product);
    
    card.innerHTML = `
        <div class="product-image">
            <img src="${product.image}" alt="${product.name}" loading="lazy">
        </div>
        <div class="product-info">
            <div class="product-brand">${product.brand}</div>
            <div class="product-name">${product.name}</div>
            <div class="product-price">${product.priceDisplay || '$' + product.price}</div>
        </div>
    `;
    
    return card;
}

// Open product modal
function openProductModal(product) {
    currentProduct = product;
    selectedSize = null;
    
    document.getElementById('modalImage').src = product.image;
    document.getElementById('modalTitle').textContent = `${product.brand} ${product.name}`;
    document.getElementById('modalDescription').textContent = product.description;
    document.getElementById('modalPrice').textContent = product.priceDisplay || `$${product.price}`;
    
    // Load sizes
    const sizesContainer = document.getElementById('modalSizes');
    sizesContainer.innerHTML = '';
    
    product.sizes.forEach(size => {
        const sizeBtn = document.createElement('button');
        sizeBtn.className = 'size-option';
        sizeBtn.textContent = size;
        sizeBtn.onclick = (e) => {
            e.stopPropagation();
            selectSize(size);
        };
        sizesContainer.appendChild(sizeBtn);
    });
    
    document.getElementById('productModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Select size
function selectSize(size) {
    selectedSize = size;
    
    // Update UI
    document.querySelectorAll('.size-option').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.textContent === size) {
            btn.classList.add('selected');
        }
    });
}

// Initialize event listeners
function initializeEventListeners() {
    // Category filters
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const category = e.target.dataset.category;
            loadProducts(category);
        });
    });
    
    // Buy button
    document.getElementById('buyButton').addEventListener('click', () => {
        if (!selectedSize) {
            alert('Пожалуйста, выберите размер');
            return;
        }
        openOrderModal();
    });
    
    // Contact seller buttons
    const contactButtons = [
        'contactSeller',
        'contactSellerFooter',
        'contactSellerLink',
        'contactSellerProduct'
    ];
    
    contactButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                window.open(`https://t.me/${CONFIG.sellerUsername}`, '_blank');
            });
        }
    });
    
    // Order form
    document.getElementById('orderForm').addEventListener('submit', handleOrderSubmit);
    
    // Go to Telegram button
    document.getElementById('goToTelegram').addEventListener('click', () => {
        window.open(`https://t.me/${CONFIG.sellerUsername}`, '_blank');
    });
    
    // Close modals
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            closeModal(closeBtn.closest('.modal'));
        });
    });
    
    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(modal => {
                if (modal.style.display === 'flex') {
                    closeModal(modal);
                }
            });
        }
    });
}

// Open order modal
function openOrderModal() {
    const orderDetails = `
        <p><strong>${currentProduct.brand} ${currentProduct.name}</strong></p>
        <p>Размер: <strong>${selectedSize}</strong></p>
        <p>Цена: <strong>${currentProduct.priceDisplay || '$' + currentProduct.price}</strong></p>
    `;
    
    document.getElementById('orderDetails').innerHTML = orderDetails;
    
    closeModal(document.getElementById('productModal'));
    document.getElementById('orderModal').style.display = 'flex';
}

// Handle order submission
async function handleOrderSubmit(e) {
    e.preventDefault();
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Отправка...';
    
    const orderId = 'ORDER_' + Date.now();
    
    const orderData = {
        orderId: orderId,
        product: {
            brand: currentProduct.brand,
            name: currentProduct.name,
            price: currentProduct.price,
            priceDisplay: currentProduct.priceDisplay,
            image: currentProduct.image,
            size: selectedSize
        },
        customer: {
            name: document.getElementById('customerName').value,
            telegram: document.getElementById('customerTelegram').value,
            phone: document.getElementById('customerPhone').value || 'Не указан',
            comment: document.getElementById('customerComment').value || 'Нет комментариев'
        },
        timestamp: new Date().toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    };
    
    try {
        // Send notification to Telegram
        await sendTelegramNotification(orderData);
        
        // Show success modal
        document.getElementById('orderNumber').textContent = orderId;
        closeModal(document.getElementById('orderModal'));
        document.getElementById('successModal').style.display = 'flex';
        
        // Reset form
        document.getElementById('orderForm').reset();
        
        // Auto redirect after 5 seconds
        setTimeout(() => {
            window.open(`https://t.me/${CONFIG.sellerUsername}`, '_blank');
        }, 5000);
        
    } catch (error) {
        console.error('Order error:', error);
        alert('Произошла ошибка при отправке заказа. Пожалуйста, свяжитесь с нами напрямую в Telegram: @' + CONFIG.sellerUsername);
        
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

// Send Telegram notification
async function sendTelegramNotification(orderData) {
    try {
        // Отправляем уведомление через наш сервер (безопаснее - токен не светится)
        const response = await fetch('/api/send-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send notification');
        }
        
        console.log('✅ Order notification sent successfully');
        return response.json();
        
    } catch (error) {
        console.error('❌ Failed to send Telegram notification:', error);
        // Не блокируем пользователя если уведомление не отправилось
        throw error;
    }
}

// Close modal
function closeModal(modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = document.querySelector(href);
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
