const Stock = require('./stock/stock.js');
const moment = require('moment');

dailyUpdate();

async function dailyUpdate(){
  const stock = new Stock();
  try{
    let date = moment().format("YYYYMMDD");
    await stock.updatePrices(date);
    await stock.updateChips(date);
    await stock.updateIndexes(date);
  }
  catch(e){
    console.log(e);
  }
}