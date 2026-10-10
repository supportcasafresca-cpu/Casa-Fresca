// Currency Manager Module
// Handles currency detection, formatting, and user preference persistence

const Currency = (function() {
    'use strict';

    // State
    let currentCurrency = 'USD'; // 'EUR' or 'USD'
    let userCountry = null;
    let isInitialized = false;
    const STORAGE_KEY = 'casafresca_currency';
    const IBAN_COUNTRIES_KEY = 'casafresca_iban_countries';
    let changeCallbacks = [];

    // Currency symbols and formatting
    const CURRENCY_CONFIG = {
        'EUR': { symbol: '€', position: 'prefix', space: true },
        'USD': { symbol: '$', position: 'prefix', space: true }
    };

    // Load IBAN countries from pay.json
    async function loadIbanCountries() {
        try {
            const response = await fetch('./Json/pay.json');
            if (!response.ok) throw new Error('Failed to load pay.json');
            const data = await response.json();
            return data.iban_countries || [];
        } catch (error) {
            console.warn('Could not load IBAN countries, using fallback:', error);
            // Fallback list
            return [
                "Alemania", "Andorra", "Austria", "Bélgica", "Chipre", "Croacia",
                "Eslovaquia", "Eslovenia", "España", "Estonia", "Finlandia",
                "Francia", "Grecia", "Irlanda", "Italia", "Letonia", "Lituania",
                "Luxemburgo", "Malta", "Mónaco", "Montenegro", "Países Bajos",
                "Portugal", "San Marino", "Suiza", "Ciudad del Vaticano"
            ];
        }
    }

    // Detect user country via ipapi.co
    async function detectUserCountry() {
        try {
            const response = await fetch('https://ipapi.co/json/');
            if (!response.ok) throw new Error('Failed to detect country');
            const data = await response.json();
            return data.country_name || 'Unknown';
        } catch (error) {
            console.warn('Could not detect user country:', error);
            return 'Unknown';
        }
    }

    // Determine default currency based on country
    function determineDefaultCurrency(country, ibanCountries) {
        return ibanCountries.includes(country) ? 'EUR' : 'USD';
    }

    // Format price with currency symbol
    function formatPrice(amount) {
        const config = CURRENCY_CONFIG[currentCurrency];
        const numericAmount = Number(amount);
        const formattedAmount = isNaN(numericAmount) ? '0.00' : numericAmount.toFixed(2);
        const symbol = config.symbol;
        
        if (config.position === 'prefix') {
            return config.space ? `${symbol} ${formattedAmount}` : `${symbol}${formattedAmount}`;
        } else {
            return config.space ? `${formattedAmount} ${symbol}` : `${formattedAmount}${symbol}`;
        }
    }

    // Get current currency symbol
    function getSymbol() {
        return CURRENCY_CONFIG[currentCurrency].symbol;
    }

    // Get current currency code
    function getCurrency() {
        return currentCurrency;
    }

    // Toggle between EUR and USD
    function toggle() {
        currentCurrency = currentCurrency === 'EUR' ? 'USD' : 'EUR';
        localStorage.setItem(STORAGE_KEY, currentCurrency);
        notifyChange();
        updateToggleButton();
    }

    // Set specific currency
    function setCurrency(currency) {
        if (currency === 'EUR' || currency === 'USD') {
            currentCurrency = currency;
            localStorage.setItem(STORAGE_KEY, currentCurrency);
            notifyChange();
            updateToggleButton();
        }
    }

    // Subscribe to currency changes
    function onChange(callback) {
        if (typeof callback === 'function') {
            changeCallbacks.push(callback);
        }
    }

    // Notify all subscribers
    function notifyChange() {
        changeCallbacks.forEach(cb => {
            try {
                cb(currentCurrency);
            } catch (e) {
                console.error('Currency change callback error:', e);
            }
        });
    }

    // Update the toggle button in header
    function updateToggleButton() {
        const symbolEl = document.getElementById('currencySymbol');
        const codeEl = document.getElementById('currencyCode');
        const toggleBtn = document.getElementById('currencyToggle');
        if (symbolEl) {
            symbolEl.textContent = getSymbol();
        }
        if (codeEl) {
            codeEl.textContent = currentCurrency;
        }
        if (toggleBtn) {
            toggleBtn.title = currentCurrency === 'EUR' ? 'Cambiar a Dólares (USD)' : 'Cambiar a Euros (EUR)';
            toggleBtn.setAttribute('aria-label', currentCurrency === 'EUR' ? 'Cambiar a Dólares estadounidenses' : 'Cambiar a Euros');
        }
    }

    // Re-render all visible prices
    function reRenderPrices() {
        // Trigger re-render of product grids
        if (typeof renderProducts === 'function' && typeof allProducts !== 'undefined') {
            const currentCategoryProducts = currentCategory === 'all' 
                ? allProducts 
                : allProducts.filter(p => p.categoria === currentCategory);
            renderProducts(currentCategoryProducts.filter(p => p.disponibilidad !== false));
        }
        
        // Re-render best sellers
        if (typeof renderBestSellers === 'function') {
            renderBestSellers();
        }
        
        // Re-render offers
        if (typeof renderOffers === 'function') {
            renderOffers();
        }
        
        // Update cart
        if (typeof updateCart === 'function') {
            updateCart();
        }
        
        // Update payment summary if open
        if (typeof updateOrderSummary === 'function') {
            const paymentSection = document.getElementById('payment-section');
            if (paymentSection && !paymentSection.classList.contains('hidden')) {
                updateOrderSummary();
            }
        }
        
        // Update product detail if open
        const detailPage = document.getElementById('product-detail-page');
        if (detailPage && detailPage.style.display !== 'none') {
            // The detail page will be re-rendered when reopened
        }
    }

    // Initialize currency system
    async function init() {
        if (isInitialized) return;
        
        try {
            // Load saved preference first
            const savedCurrency = localStorage.getItem(STORAGE_KEY);
            
            // Load IBAN countries
            const ibanCountries = await loadIbanCountries();
            localStorage.setItem(IBAN_COUNTRIES_KEY, JSON.stringify(ibanCountries));
            
            // Detect user country
            userCountry = await detectUserCountry();
            
            // Determine currency: saved preference > geo-detection > default USD
            if (savedCurrency && (savedCurrency === 'EUR' || savedCurrency === 'USD')) {
                currentCurrency = savedCurrency;
            } else {
                currentCurrency = determineDefaultCurrency(userCountry, ibanCountries);
                localStorage.setItem(STORAGE_KEY, currentCurrency);
            }
            
            isInitialized = true;
            updateToggleButton();
            
            // Subscribe to changes for auto re-render
            onChange(() => {
                reRenderPrices();
            });
            
            console.log(`Currency initialized: ${currentCurrency} (Country: ${userCountry})`);
            
        } catch (error) {
            console.error('Currency initialization failed:', error);
            // Fallback to USD
            currentCurrency = 'USD';
            isInitialized = true;
            updateToggleButton();
        }
    }

    // Public API
    return {
        init,
        formatPrice,
        getSymbol,
        getCurrency,
        setCurrency,
        toggle,
        onChange,
        reRenderPrices
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Currency.init();
});

// Global click/keyboard handler for currency toggle button
document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('#currencyToggle');
    if (toggleBtn) {
        Currency.toggle();
    }
});

document.addEventListener('keydown', (e) => {
    const toggleBtn = e.target.closest('#currencyToggle');
    if (toggleBtn && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        Currency.toggle();
    }
});

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Currency;
}