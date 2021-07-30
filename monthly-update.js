const Stock = require('./stock/stock.js');
const moment = require('moment');

const stock = new Stock();

try{
  let date = moment().subtract(1, 'month').format('YYYYMM');
  stock.updateMonthlyRevenues(date);
}
catch(e){
  console.log(e);
}