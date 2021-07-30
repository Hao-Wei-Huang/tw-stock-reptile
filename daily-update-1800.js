const Stock = require('./stock/stock.js');
const moment = require('moment');

const stock = new Stock();

try{
  let date = moment().format("YYYYMMDD");
  stock.updatePERs(date);
}
catch(e){
  console.log(e);
}