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

let currentCategory = 'all';
let currentSize = 'all';
let searchQuery = '';
let sortBy = 'newest';
let priceRange = { min: null, max: null };

// Load and display products
function loadProducts(category = 'all', size = 'all') {
    currentCategory = category;
    currentSize = size;
    
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';
    
    let filteredProducts = products;
    
    // Filter by category
    if (category !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === category);
    }
    
    // Filter by size
    if (size !== 'all') {
        filteredProducts = filteredProducts.filter(p => 
            p.sizes && p.sizes.includes(size)
        );
    }
    
    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(query) ||
            p.brand.toLowerCase().includes(query) ||
            (p.description && p.description.toLowerCase().includes(query))
        );
    }
    
    // Filter by price range
    if (priceRange.min !== null || priceRange.max !== null) {
        filteredProducts = filteredProducts.filter(p => {
            const price = p.price || 0;
            const minOk = priceRange.min === null || price >= priceRange.min;
            const maxOk = priceRange.max === null || price <= priceRange.max;
            return minOk && maxOk;
        });
    }
    
    // Sort products
    if (sortBy === 'price-asc') {
        filteredProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === 'price-desc') {
        filteredProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === 'name-asc') {
        filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
    }
    // 'newest' - keep original order (last parsed first)
    
    // Update counter
    const counter = document.getElementById('productCount');
    if (counter) {
        counter.textContent = filteredProducts.length;
    }
    
    filteredProducts.forEach(product => {
        const card = createProductCard(product);
        grid.appendChild(card);
    });
    
    // Show message if no products found
    if (filteredProducts.length === 0) {
        grid.innerHTML = '<div class="no-products">Товары не найдены. Попробуйте изменить фильтры.</div>';
    }
}

// Create product card
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.onclick = () => openProductModal(product);
    
    // Status badge
    let statusBadge = '';
    if (product.status) {
        const statusConfig = {
            'new': { label: '🔥 НОВИНКА', class: 'status-new' },
            'sale': { label: '💰 SALE', class: 'status-sale' },
            'exclusive': { label: '⭐ ЭКСКЛЮЗИВ', class: 'status-exclusive' },
            'hot': { label: '🔥 ХИТ', class: 'status-hot' }
        };
        const config = statusConfig[product.status];
        if (config) {
            statusBadge = `<div class="status-badge ${config.class}">${config.label}</div>`;
        }
    }
    
    card.innerHTML = `
        <div class="product-image">
            ${statusBadge}
            <img src="${product.image}" alt="${product.name}" loading="lazy">
        </div>
        <div class="product-info">
            <div class="product-brand">${product.brand}</div>
            <div class="product-name">${product.name}</div>
            <div class="product-price">${product.priceDisplay || '$' + product.price}</div>
            <div class="product-sizes">Размер: ${product.sizes.join(', ')}</div>
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

// Update size filters visibility based on category
function updateSizeFilters(category) {
    const clothingFilter = document.getElementById('clothingSizeFilter');
    const shoesFilter = document.getElementById('shoesSizeFilter');
    const accessoriesFilter = document.getElementById('accessoriesSizeFilter');
    
    // Hide all first
    clothingFilter.style.display = 'none';
    shoesFilter.style.display = 'none';
    accessoriesFilter.style.display = 'none';
    
    // Show appropriate filters
    if (category === 'all') {
        clothingFilter.style.display = 'block';
        shoesFilter.style.display = 'block';
    } else if (category === 'clothing') {
        clothingFilter.style.display = 'block';
    } else if (category === 'shoes') {
        shoesFilter.style.display = 'block';
    } else if (category === 'accessories') {
        accessoriesFilter.style.display = 'block';
    }
}

// Update filter sidebar size visibility
function updateFilterSizeVisibility(category) {
    const clothingFilter = document.getElementById('filterClothingSize');
    const shoesFilter = document.getElementById('filterShoesSize');
    const accessoriesFilter = document.getElementById('filterAccessoriesSize');
    
    // Hide all first
    if (clothingFilter) clothingFilter.style.display = 'none';
    if (shoesFilter) shoesFilter.style.display = 'none';
    if (accessoriesFilter) accessoriesFilter.style.display = 'none';
    
    // Show appropriate filters
    if (category === 'all') {
        if (clothingFilter) clothingFilter.style.display = 'block';
        if (shoesFilter) shoesFilter.style.display = 'block';
    } else if (category === 'clothing') {
        if (clothingFilter) clothingFilter.style.display = 'block';
    } else if (category === 'shoes') {
        if (shoesFilter) shoesFilter.style.display = 'block';
    } else if (category === 'accessories') {
        if (accessoriesFilter) accessoriesFilter.style.display = 'block';
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Category filters
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const category = e.target.dataset.category;
            
            // Show/hide appropriate size filters based on category
            updateSizeFilters(category);
            
            // Reset size filter to "all"
            currentSize = 'all';
            document.querySelectorAll('.size-filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.size-filter-btn[data-size="all"]').forEach(b => b.classList.add('active'));
            
            loadProducts(category, currentSize);
        });
    });
    
    // Size filters
    document.querySelectorAll('.size-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active from the same group
            const group = e.target.closest('.size-filter-group');
            group.querySelectorAll('.size-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const size = e.target.dataset.size;
            loadProducts(currentCategory, size);
        });
    });
    
    // Search input - update on typing for live search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            // Apply immediately for better UX
            loadProducts(currentCategory, currentSize);
        });
    }
    
    // Sort select - apply immediately
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortBy = e.target.value;
            // Apply immediately
            loadProducts(currentCategory, currentSize);
        });
    }
    
    // Price inputs - only store values, apply on button click
    const priceMinInput = document.getElementById('priceMin');
    const priceMaxInput = document.getElementById('priceMax');
    
    if (priceMinInput) {
        priceMinInput.addEventListener('change', (e) => {
            priceRange.min = e.target.value ? parseFloat(e.target.value) : null;
        });
    }
    
    if (priceMaxInput) {
        priceMaxInput.addEventListener('change', (e) => {
            priceRange.max = e.target.value ? parseFloat(e.target.value) : null;
        });
    }
    
    // Filter Sidebar Controls
    const filterToggle = document.getElementById('filterToggle');
    const filterSidebar = document.getElementById('filterSidebar');
    const filterOverlay = document.getElementById('filterOverlay');
    const filterClose = document.getElementById('filterClose');
    const filterApply = document.getElementById('filterApply');
    const filterReset = document.getElementById('filterReset');
    
    // Open sidebar
    if (filterToggle) {
        filterToggle.addEventListener('click', () => {
            filterSidebar.classList.add('active');
            filterOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Close sidebar function
    function closeFilterSidebar() {
        filterSidebar.classList.remove('active');
        filterOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    if (filterClose) {
        filterClose.addEventListener('click', closeFilterSidebar);
    }
    
    if (filterOverlay) {
        filterOverlay.addEventListener('click', closeFilterSidebar);
    }
    
    // Apply filters and close
    if (filterApply) {
        filterApply.addEventListener('click', () => {
            // Get values from sidebar inputs
            const minInput = document.getElementById('priceMin');
            const maxInput = document.getElementById('priceMax');
            
            priceRange.min = minInput.value ? parseFloat(minInput.value) : null;
            priceRange.max = maxInput.value ? parseFloat(maxInput.value) : null;
            
            loadProducts(currentCategory, currentSize);
            closeFilterSidebar();
        });
    }
    
    // Reset filters
    if (filterReset) {
        filterReset.addEventListener('click', () => {
            // Reset all filters
            searchQuery = '';
            sortBy = 'newest';
            priceRange = { min: null, max: null };
            currentSize = 'all';
            
            // Reset inputs
            document.getElementById('searchInput').value = '';
            document.getElementById('sortSelect').value = 'newest';
            document.getElementById('priceMin').value = '';
            document.getElementById('priceMax').value = '';
            
            // Reset size buttons
            document.querySelectorAll('.filter-size-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.size === 'all') {
                    btn.classList.add('active');
                }
            });
            
            // Reset category to all
            currentCategory = 'all';
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.category === 'all') {
                    btn.classList.add('active');
                }
            });
            document.querySelectorAll('.filter-cat-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.category === 'all') {
                    btn.classList.add('active');
                }
            });
            
            loadProducts('all', 'all');
        });
    }
    
    // Filter sidebar category buttons
    document.querySelectorAll('.filter-cat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-cat-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const category = e.target.dataset.category;
            currentCategory = category;
            
            // Update main category buttons too
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('active');
                if (b.dataset.category === category) {
                    b.classList.add('active');
                }
            });
            
            // Update size filter visibility
            updateFilterSizeVisibility(category);
        });
    });
    
    // Filter sidebar size buttons
    document.querySelectorAll('.filter-size-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const group = e.target.closest('.filter-section');
            group.querySelectorAll('.filter-size-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentSize = e.target.dataset.size;
        });
    });
    
    // Collapsible filter sections (for mobile)
    document.querySelectorAll('.filter-section.collapsible label').forEach(label => {
        label.addEventListener('click', (e) => {
            const section = e.target.closest('.filter-section');
            section.classList.toggle('collapsed');
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
