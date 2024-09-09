// Function to check if the section is in the viewport
function isInView(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Function to trigger typing animation when in view
function handleScroll() {
    const welcomeText = document.getElementById('welcomeText');
    if (isInView(welcomeText)) {
        welcomeText.classList.add('active'); // Add 'active' class to trigger animation
        window.removeEventListener('scroll', handleScroll); // Remove the event listener after triggering
    }
}

// Add the scroll event listener
window.addEventListener('scroll', handleScroll);

// Call handleScroll in case the section is already in view on page load
window.addEventListener('load', handleScroll);


document.addEventListener('DOMContentLoaded', () => {
const tipsContainer = document.querySelector('.tips-container');
const observer = new IntersectionObserver(entries => {
entries.forEach(entry => {
if (entry.isIntersecting) {
tipsContainer.classList.add('animate');
}
});
});

observer.observe(tipsContainer);
});



// Fetching Market Data
const apiUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false';

fetch(apiUrl)
.then(response => {
if (!response.ok) {
throw new Error(`HTTP error! status: ${response.status}`);
}
return response.json();
})
.then(data => {
console.log("Data fetched:", data);
displayMarketData(data);
updateChart(data); // Update chart with fetched data
})
.catch(error => {
console.error('Error fetching data:', error);
document.getElementById('market-container').innerHTML = `<p>Unable to load market data. Please try again later.</p>`;
});

// Display Market Data
function displayMarketData(coins) {
const marketContainer = document.getElementById('market-container');
marketContainer.innerHTML = '';

coins.forEach(coin => {
const coinElement = document.createElement('div');
coinElement.classList.add('coin');
coinElement.innerHTML = `
<img src="${coin.image}" alt="${coin.name}" class="coin-image">
<h4>${coin.name} (${coin.symbol.toUpperCase()})</h4>
<p class="${coin.price_change_percentage_24h >= 0 ? 'price-up' : 'price-down'}">
Current Price: $${coin.current_price}
</p>
<p>Market Cap: $${coin.market_cap.toLocaleString()}</p>
<p>24h Change: ${coin.price_change_percentage_24h.toFixed(2)}%</p>
`;
marketContainer.appendChild(coinElement);
});
}

// Initialize Chart.js
const ctx = document.getElementById('price-chart').getContext('2d');
const priceChart = new Chart(ctx, {
type: 'line',
data: {
labels: [], // Fill with date/time labels
datasets: [{
label: 'Price Trend',
data: [], // Fill with price data
backgroundColor: 'rgba(87, 2, 183, 0.389)',
borderColor: 'rgba(87, 2, 183, 1)',
borderWidth: 1

}]
},
options: {
responsive: true,
scales: {
x: {
beginAtZero: true
},
y: {
beginAtZero: true
}
}
}
});

// Update Chart with Data
function updateChart(coins) {
const labels = coins.map(coin => coin.name);
const data = coins.map(coin => coin.current_price);

priceChart.data.labels = labels;
priceChart.data.datasets[0].data = data;
priceChart.update();
}
