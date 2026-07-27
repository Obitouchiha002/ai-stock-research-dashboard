import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function run() {
  const symbol = 'AAPL';
  const now = new Date();
  
  try {
     const h = await yahooFinance.chart(symbol, {
         period1: new Date(now.getTime() - 720 * 24 * 3600 * 1000).toISOString().split('T')[0],
         interval: '1h'
     });
     console.log('1h res:', h.quotes.length);
  } catch (e) {
     console.error('1h failed:', e.message);
  }
}
run();
