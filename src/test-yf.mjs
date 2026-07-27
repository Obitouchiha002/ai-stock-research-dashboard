import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
yahooFinance.search('AAPL').then(x => console.log('OK', x.quotes.length)).catch(console.error);
