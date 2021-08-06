require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');  
const moment = require('moment');
const Database = require('../connections/database');

class Stock{
  constructor(){
    this.company = DB_COMPANY_TABLE;
    this.techTable = DB_TECH_TABLE;
    this.chipTable = DB_CHIP_TABLE;
    this.fundamentTable = DB_FUNDAMENT_TABLE;
    this.initDayCount = 35;
    this.initMonthCount = 6;
    this.initSeasonCount = 9;
    this.dayCountLimit = 240;
    this.monthCountLimit = 12;
    this.seasonCountLimit = 16;
  }
  /*
  technique
  */
  // Initialize the technique.
  async initTech(startDate){
    const database = new Database();
    let day = this.initDayCount;
    let date = startDate;

    try{
      // Get all companies.
      const siiCompanies = await this.getAllCompanies('sii');
      const otcCompanies = await this.getAllCompanies('otc');
      const companies = [...siiCompanies, ...otcCompanies];

      for(let i = 0; i < companies.length; i++){
        await database.query(`INSERT INTO ${this.techTable} 
          SET stock_no="${companies[i].no}", stock_name="${companies[i].name}", 
          prices='[]',
          RSVs='[]',Ks='[50]', Ds='[50]', bollingerBands='[]', RSI6s='[]', RSI12s='[]',
          EMA12s='[]', EMA26s='[]', DIFs='[]', MACDs='[]'`);
      }
      // Get stock prices for many days.
      while(day){
        const siiPrices = await this.getPrices('sii', date);
        const otcPrices = await this.getPrices('otc', date);
        const totalPrices = [...siiPrices, ...otcPrices];
        // true: The stock was opened on this date.
        // false: oppsite
        if(!totalPrices.length){
          date = moment(date).subtract(1, 'day').format("YYYYMMDD");
          continue;
        }
        for(let i = 0; i < totalPrices.length; i++){
          let stockNo = totalPrices[i].no;
          delete totalPrices[i].no;
          // Get the stock price from database.
          let result = await database.query(`SELECT prices FROM ${this.techTable} WHERE stock_no="${stockNo}"`);
          // Check if the stock price is exist.
          if(!result.length) continue;
          // deserialization 
          let prices = JSON.parse(result[0].prices);
          // Add new stock price.
          prices.push(totalPrices[i]);
          // Save the stock price to database.
          await database.query(`UPDATE ${this.techTable} SET prices='${JSON.stringify(prices)}' WHERE stock_no="${stockNo}"`);
        }
        day--;
        date = moment(date).subtract(1, 'day').format("YYYYMMDD");
        await this.sleep(3000);
      }

      // Initialize RSI
      await this.initRSIs();
      // Initialize MACD
      await this.initMACDs();
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  // Update the stock prices.
  updatePrices(date){
    return new Promise(async (resolve, reject) => {
      const database = new Database();
      
      try{
        const siiPrices = await this.getPrices('sii', date);
        const otcPrices = await this.getPrices('otc', date);
        const totalPrices = [...siiPrices, ...otcPrices];
        // true: The stock was opened on this date.
        // false: oppsite
        if(!totalPrices.length){
          database.end();
          return resolve();
        }
        for(let i = 0; i < totalPrices.length; i++){
          let stockNo = totalPrices[i].no;
          delete totalPrices[i].no;
          // Get the stock price from database.
          let result = await database.query(`SELECT prices FROM ${this.techTable} WHERE stock_no="${stockNo}"`);
          // Check if the stock price is exist.
          if(!result.length) continue;
          // deserialization 
          let prices = JSON.parse(result[0].prices);
          if(prices.length >= this.dayCountLimit){
            // Remove old stock price.
            prices.pop();
          }
          // Add new stock price.
          prices.unshift(totalPrices[i]);
          // Calculate the moveing average of the prices.
          let price_5ma = this.movingAverage(prices, 'closingPrice', 5);
          let price_10ma = this.movingAverage(prices, 'closingPrice', 10);
          let price_20ma = this.movingAverage(prices, 'closingPrice', 20);
          // Calculate the moveing average of the capacities.
          let capacity_5ma = parseInt(this.movingAverage(prices, 'capacity', 5));
          let capacity_10ma = parseInt(this.movingAverage(prices, 'capacity', 10));
          let capacity_20ma = parseInt(this.movingAverage(prices, 'capacity', 20));
          // Save the stock price to database.
          await database.query(`UPDATE ${this.techTable} SET prices='${JSON.stringify(prices)}', 
            price_5ma="${price_5ma}", price_10ma="${price_10ma}", price_20ma="${price_20ma}",
            capacity_5ma="${capacity_5ma}", capacity_10ma="${capacity_10ma}", capacity_20ma="${capacity_20ma}"  
            WHERE stock_no="${stockNo}"`);
        }
        resolve();
      }
      catch(e){
        reject(e);
      }
      database.end();
    })
  }
  // Update the stock RSVs and KDs
  updateIndexes(date){
    return new Promise(async (resolve, reject) => {
      const database = new Database();

      try{
        let stocks = await database.query(`SELECT stock_no, prices,
          RSVs, Ks, Ds, RSI6s, RSI12s, bollingerBands, EMA12s, EMA26s,
          DIFs, MACDs FROM ${this.techTable}`);
        for(let i = 0; i < stocks.length; i++){
          const stockPrices = JSON.parse(stocks[i].prices);
          const RSVs = JSON.parse(stocks[i].RSVs);
          const Ks = JSON.parse(stocks[i].Ks);
          const Ds = JSON.parse(stocks[i].Ds);
          const RSI6s = JSON.parse(stocks[i].RSI6s);
          const RSI12s = JSON.parse(stocks[i].RSI12s);
          const bollingerBands = JSON.parse(stocks[i].bollingerBands);
          const EMA12s = JSON.parse(stocks[i].EMA12s);
          const EMA26s = JSON.parse(stocks[i].EMA26s);
          const DIFs = JSON.parse(stocks[i].DIFs);
          const MACDs = JSON.parse(stocks[i].MACDs);
          // Check if the prices exist.
          if(!stockPrices.length) continue;
          // Check if the stock prices were successfully updated or weren't opened.
          if(stockPrices[0].date !== date) continue;
          const RSV = this.getRSV(9, stockPrices);
          const [K, D] = this.getKD(RSV, Ks[0], Ds[0]);
          const RSI6 = this.getRSI(6, stockPrices, RSI6s[0]);
          const RSI12 = this.getRSI(12, stockPrices, RSI12s[0]);
          const bollingerBand = this.getBollingerBand(20, stockPrices);
          const DI = this.getDI(stockPrices[0]);
          const EMA12 = this.getEMA(12, EMA12s[0], DI);
          const EMA26 = this.getEMA(26, EMA26s[0], DI);
          const DIF = this.getDIF(EMA12, EMA26);
          const MACD = this.getMACD(9, MACDs[0], DIF);
          if(RSVs.length >= this.dayCountLimit){
            RSVs.pop();
            Ks.pop();
            Ds.pop();
            RSI6s.pop();
            RSI12s.pop();
            bollingerBands.pop();
            EMA12s.pop();
            EMA26s.pop();
            DIFs.pop();
            MACDs.pop();
          }
          RSVs.unshift(RSV);
          Ks.unshift(K);
          Ds.unshift(D);
          RSI6s.unshift(RSI6);
          RSI12s.unshift(RSI12);
          bollingerBands.unshift(bollingerBand);
          EMA12s.unshift(EMA12);
          EMA26s.unshift(EMA26);
          DIFs.unshift(DIF);
          MACDs.unshift(MACD);
          await database.query(`UPDATE ${this.techTable} 
            SET RSVs='${JSON.stringify(RSVs)}', Ks='${JSON.stringify(Ks)}', 
            Ds='${JSON.stringify(Ds)}', RSI6s='${JSON.stringify(RSI6s)}',
            RSI12s='${JSON.stringify(RSI12s)}',
            bollingerBands='${JSON.stringify(bollingerBands)}', 
            EMA12s='${JSON.stringify(EMA12s)}', EMA26s='${JSON.stringify(EMA26s)}',
            DIFs='${JSON.stringify(DIFs)}', MACDs='${JSON.stringify(MACDs)}'
            WHERE stock_no="${stocks[i].stock_no}"`);
        }
        resolve();
      }
      catch(e){
        reject(e);
      }
      database.end();
    })
  }
  // Get the stock prices on date.
  // input : date (ex : 20210601)
  // output : the all stock prices on date
  getPrices(type, date){
    return new Promise((resolve, reject) => {
      if(type === 'sii'){
        const priceUrl = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${date}&type=ALLBUT0999`;
        axios.post(priceUrl)
          .then(res => {
            let data = [];
            // The stock wasn't opened on this date.
            if(res.data.stat !== "OK") return resolve(data);
            let stockInfo = res.data.data9;
            for(let i = 0; i < stockInfo.length; i++){
              let stock = {};
              stock.no = stockInfo[i][0];
              stock.capacity = Math.round(stockInfo[i][2].replace(/,/g, '') / 1000);
              stock.openingPrice = Number(stockInfo[i][5].replace(/,/g, ''));
              stock.highestPrice = Number(stockInfo[i][6].replace(/,/g, ''));
              stock.lowestPrice = Number(stockInfo[i][7].replace(/,/g, ''));
              stock.closingPrice = Number(stockInfo[i][8].replace(/,/g, ''));
              const $ = cheerio.load(stockInfo[i][9]);
              let upDown = Number(stockInfo[i][10].replace(/,/g, ''));
              if($('p').text() === '-'){
                upDown = upDown * -1;
              }
              stock.upDown = upDown;
              stock.date = date;
              // Check if the stock price is exist.
              if(!isNaN(stock.closingPrice)){
                data.push(stock);
              }
            }
            resolve(data);
          })
          .catch(err => {
            reject(err);
          })
      }
      else{
        const transformDate = `${date.slice(0,4) - 1911}/${date.slice(4,6)}/${date.slice(6)}`;
        const priceUrl = `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?l=zh-tw&d=${transformDate}&se=EW`;
        axios.get(priceUrl)
        .then(res => {
          let data = [];
          // The stock wasn't opened on this date.
          if(!res.data.aaData.length) return resolve(data);
          let stockInfo = res.data.aaData;
          for(let i = 0; i < stockInfo.length; i++){
            let stock = {};
            stock.no = stockInfo[i][0];
            stock.capacity = Math.round(stockInfo[i][7].replace(/,/g, '') / 1000);
            stock.openingPrice = Number(stockInfo[i][4].replace(/,/g, ''));
            stock.highestPrice = Number(stockInfo[i][5].replace(/,/g, ''));
            stock.lowestPrice = Number(stockInfo[i][6].replace(/,/g, ''));
            stock.closingPrice = Number(stockInfo[i][2].replace(/,/g, ''));
            stock.upDown = Number(stockInfo[i][3].replace(/,/g, ''));
            stock.date = date;
            // Check if the stock price is exist.
            if(!isNaN(stock.closingPrice)){
              data.push(stock);
            }
          }
          resolve(data);
        })
        .catch(err => {
          reject(err);
        })
      }
    })
  }
  getRSV(N, stockPrices){
    if(stockPrices.length < N) return -1;
    let highestPrice = -Infinity;
    let lowestPrice = Infinity;
    for(let i = 0; i < N; i++){
      highestPrice = stockPrices[i].highestPrice > highestPrice ? stockPrices[i].highestPrice : highestPrice;
      lowestPrice = stockPrices[i].lowestPrice < lowestPrice ? stockPrices[i].lowestPrice : lowestPrice;
    }
    let RSV = Math.round((stockPrices[0].closingPrice - lowestPrice) / (highestPrice - lowestPrice) * 100 * 100) / 100;
    return RSV;
  }
  getKD(RSV, lastK, lastD){
    const K = Math.round((lastK * 2 / 3 + RSV / 3) * 100) / 100;
    const D = Math.round((lastD * 2 / 3 + K / 3) * 100) / 100;
    return [K, D];
  }
  getRSI(N, stockPrices, lastRSI){
    if(stockPrices.length < N) return -1;
    let upAverage;
    let downAverage;
  
    if(stockPrices[0].upDown > 0){
      upAverage = (lastRSI.upAverage * (N - 1) + stockPrices[0].upDown) / N;
      downAverage = lastRSI.downAverage * (N - 1) / N;
    }
    else if(stockPrices[0].upDown < 0){
      upAverage = lastRSI.upAverage * (N - 1) / N;
      downAverage = (lastRSI.downAverage * (N - 1) + Math.abs(stockPrices[0].upDown)) / N;
    }
    else{
      upAverage = lastRSI.upAverage * (N - 1) / N;
      downAverage = lastRSI.downAverage * (N - 1) / N;
    }
    const RSI = Math.round(upAverage / (upAverage + downAverage) * 100 * 100) / 100;
    upAverage = Math.round(upAverage * 100) / 100;  
    downAverage = Math.round(downAverage * 100) / 100;
    return {upAverage, downAverage, RSI};
  }
  initRSI(N, stockPrices){
    if(stockPrices.length < N) return -1;
    let up = 0;
    let down = 0;
    for(let i = 0; i < N; i++){
      if(stockPrices[i].upDown > 0) up += stockPrices[i].upDown;
      if(stockPrices[i].upDown < 0) down += Math.abs(stockPrices[i].upDown);
    }
    let upAverage = up / N;
    let downAverage = down / N;
    const RSI = Math.round(upAverage / (upAverage + downAverage) * 100 * 100) / 100;
    upAverage = Math.round(upAverage * 100) / 100;  
    downAverage = Math.round(downAverage * 100) / 100;
    return {upAverage, downAverage, RSI};
  }
  initRSIs(){
    return new Promise(async (resolve, reject) => {
      const database = new Database();

      try{
        let stocks = await database.query(`SELECT stock_no, prices FROM ${this.techTable}`);
        for(let i = 0; i < stocks.length; i++){
          let stockPrices = JSON.parse(stocks[i].prices);
          // Check if the prices exist.
          if(!stockPrices.length) continue;
          const RSI6 = this.initRSI(6, stockPrices);
          const RSI12 = this.initRSI(12, stockPrices);
          const RSI6s = [RSI6];
          const RSI12s = [RSI12];
          await database.query(`UPDATE ${this.techTable} 
            SET RSI6s='${JSON.stringify(RSI6s)}', RSI12s='${JSON.stringify(RSI12s)}' 
            WHERE stock_no="${stocks[i].stock_no}"`);
        }
        resolve();
      }
      catch(e){
        reject(e);
      }
      database.end();
    });
  }
  getBollingerBand(N, stockPrices){
    let sum = 0;
    let average = 0;
    let squareSum = 0;

    if(stockPrices.length < N) return -1;
    // Caculate average.
    for(let i = 0; i < N; i++){
      sum += stockPrices[i].closingPrice;
    }
    average = sum / N;
    for(let i = 0; i < N; i++){
      squareSum += Math.pow(stockPrices[i].closingPrice - average, 2);
    }
    let standardDeviation = Math.round(Math.pow(squareSum / N, 0.5) * 100) / 100;
    average = Math.round(average * 100) / 100;
    return {
      top: average + 2 * standardDeviation,
      middle: average,
      bottom: average - 2 * standardDeviation,
    };
  }
  initMACDs(){
    return new Promise(async (resolve, reject) => {
      const database = new Database();

      try{
        let initMACDNumber = 9;
        while(initMACDNumber > 0){
          const stocks = await database.query(`SELECT stock_no, prices, EMA12s, EMA26s, DIFs FROM ${this.techTable}`);
          for(let i = 0; i < stocks.length; i++){
            let stockPrices = JSON.parse(stocks[i].prices);
            stockPrices = stockPrices.slice(initMACDNumber - 1);
            const EMA12s = JSON.parse(stocks[i].EMA12s);
            const EMA26s = JSON.parse(stocks[i].EMA26s);
            const DIFs = JSON.parse(stocks[i].DIFs);
            // Check if the prices exist.
            if(!stockPrices.length) continue;
            const EMA12 = this.initEMA(12, stockPrices);
            const EMA26 = this.initEMA(26, stockPrices);
            const DIF = this.getDIF(EMA12, EMA26);
            EMA12s.unshift(EMA12);
            EMA26s.unshift(EMA26);
            DIFs.unshift(DIF);
            await database.query(`UPDATE ${this.techTable} 
              SET EMA12s='${JSON.stringify(EMA12s)}', EMA26s='${JSON.stringify(EMA26s)}',
              DIFs='${JSON.stringify(DIFs)}'
              WHERE stock_no="${stocks[i].stock_no}"`);
          }
          initMACDNumber--;
        }
        // init MACDs
        const stocks = await database.query(`SELECT stock_no, DIFs, MACDs FROM ${this.techTable}`);
        for(let i = 0; i < stocks.length; i++){
          const DIFs = JSON.parse(stocks[i].DIFs);
          const MACDs = JSON.parse(stocks[i].MACDs);
          // Check if the prices exist.
          if(!DIFs.length) continue;
          const MACD = this.initMACD(9, DIFs);
          MACDs.unshift(MACD);
          await database.query(`UPDATE ${this.techTable} 
            SET MACDs='${JSON.stringify(MACDs)}' WHERE stock_no="${stocks[i].stock_no}"`);
        }
        resolve();
      }
      catch(e){
        reject(e);
      }
      database.end();
    });
  }
  getDI(stockPrice){
    const DI = (stockPrice.highestPrice + stockPrice.lowestPrice + 
      stockPrice.closingPrice * 2) / 4;
    return DI;
  }
  initEMA(N, stockPrices){
    if(stockPrices.length < N) return -1;
    let DISum = 0;
    for(let i = 0; i < N; i++){
      DISum += this.getDI(stockPrices[i]);
    }
    const EMA = Math.round(DISum / N * 100) / 100;
    return EMA;
  }
  getEMA(N, lastEMA, todayDI){
    const EMA = Math.round((lastEMA * (N - 1) / (N + 1) + todayDI * 2 / (N + 1)) * 100) / 100;
    return EMA;
  }
  getDIF(EMA1, EMA2){
    const DIF = Math.round((EMA1 - EMA2) * 100) / 100;
    return DIF;
  }
  initMACD(N, DIFs){
    if(DIFs.length < N) return -1;
    let DIFSum = 0;
    for(let i = 0; i < N; i++){
      DIFSum += DIFs[i];
    }
    const MACD = Math.round(DIFSum / N * 100) / 100; 
    return MACD;
  } 
  getMACD(N, lastMACD, todayDIF){
    const MACD = Math.round((lastMACD * (N - 1) / (N + 1) + todayDIF * 2 / (N + 1)) * 100) / 100;
    return MACD;
  }
  // Get single stock prices for many days.
  // input :
  //  stockNo : the stock no
  //  day : the day count of stock prices
  // output : the single stock prices 
  getSingleStockPrice(stockNo, day){
    return new Promise(async (resolve, reject) => {
      // the date is monthly starting.
      let currentDate = `${moment().format('YYYYMM')}01`;
      let singleStock = {
        stockNo,
        prices: [],
      };
      try{
        while(day > 0){
          const singleStockUrl = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${currentDate}&stockNo=${stockNo}&_=${new Date().getTime()}`;
          let res = await axios.post(singleStockUrl)
          let prices = res.data.data;
          if(!prices){
            currentDate = moment(currentDate).subtract(1, 'month').format('YYYYMMDD');
            continue;
          }
          for(let i = prices.length - 1; i >= 0; i--){
            let price = Number(prices[i][6]);
            if(isNaN(price)) continue;
            singleStock.prices.push(price);
            day--;
            if(day === 0){
              resolve(singleStock);
              break;
            }
          }
          currentDate = moment(currentDate).subtract(1, 'month').format('YYYYMMDD');
        }
      }
      catch(e){
        throw e
      }
    })
  }
  // Calculate moving average.
  // input : 
  //  stockInfo : the stock info
  //  property : The type was calculate. (ex : closing price)
  //  count : the count of moving average
  // output : the value of moving average includes two decimal places. (ex : 123.55)
  movingAverage(data, property, count){
    if(data.length < count) return -1;
    let sum = 0;
    for(let i = 0; i < count; i++){
      sum += data[i][property];
    }
    return Math.round((sum / count) * 100) / 100;
  }
  /*
  chip
  */
  // Initialize the chip.
  async initChip(startDate){
    const database = new Database();
    let day = this.initDayCount;
    let date = startDate;
    let updatedTime;
    
    try{
      // Get all companies.
      const siiCompanies = await this.getAllCompanies('sii');
      const otcCompanies = await this.getAllCompanies('otc');
      const companies = [...siiCompanies, ...otcCompanies];
      for(let i = 0; i < companies.length; i++){
        await database.query(`INSERT INTO ${this.chipTable} SET stock_no="${companies[i].no}", stock_name="${companies[i].name}", chips='[]'`);
      }
    
      // Get stock chips for many days
      while(day){
        const siiChips = await this.getChips('sii', date);
        const otcChips = await this.getChips('otc', date);
        const totalChips = [...siiChips, ...otcChips];
        // true: The stock was opened on this date.
        // false: oppsite
        if(!totalChips.length){
          date = moment(date).subtract(1, 'day').format("YYYYMMDD");
          continue;
        }
        updatedTime = new Date().getTime();
        for(let i = 0; i < totalChips.length; i++){
          let stockNo = totalChips[i].no;
          delete totalChips[i].no;
          // Get the stock price from database.
          let result = await database.query(`SELECT chips FROM ${this.chipTable} WHERE stock_no="${stockNo}"`);
          // Check if the stock price is exist.
          if(!result.length) continue;
          // deserialization 
          let chips = JSON.parse(result[0].chips);
          // Add new stock price.
          chips.push(totalChips[i]);
          // Save the stock price to database.
          await database.query(`UPDATE ${this.chipTable} SET chips='${JSON.stringify(chips)}',updated_time="${updatedTime}" WHERE stock_no="${stockNo}"`);
        }
        // Compensate zero.
        let nonchipStocks = await database.query(`SELECT stock_no FROM ${this.chipTable} WHERE updated_time<${updatedTime}`)
        for(let i = 0; i < nonchipStocks.length; i++){
          let result = await database.query(`SELECT chips FROM ${this.chipTable} WHERE stock_no="${nonchipStocks[i].stock_no}"`);
          let chips = JSON.parse(result[0].chips);
          chips.push({
            foreignInvestorsBS: 0,
            investmentTrustBS: 0,
            dealerBS: 0,
            institutionalInvestorsBS: 0,
            date
          });
          // Save the stock price to database.
          await database.query(`UPDATE ${this.chipTable} SET chips='${JSON.stringify(chips)}',updated_time="${updatedTime}" WHERE stock_no="${nonchipStocks[i].stock_no}"`);
        }
        day--;
        date = moment(date).subtract(1, 'day').format("YYYYMMDD");
        await this.sleep(2500);
      }
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  // Update the stock chips.
  updateChips(date){
    return new Promise(async (resolve, reject) => {
      const database = new Database();
      let updatedTime;
      
      try{
        const siiChips = await this.getChips('sii', date);
        const otcChips = await this.getChips('otc', date);
        const totalChips = [...siiChips, ...otcChips];
        // true: The stock was opened on this date.
        // false: oppsite
        if(!totalChips.length){
          database.end();
          return resolve();
        }
        updatedTime = new Date().getTime();
        for(let i = 0; i < totalChips.length; i++){
          let stockNo = totalChips[i].no;
          delete totalChips[i].no;
          // Get the stock price from database.
          let result = await database.query(`SELECT chips FROM ${this.chipTable} WHERE stock_no="${stockNo}"`);
          // Check if the stock price is exist.
          if(!result.length) continue;
          // deserialization 
          let chips = JSON.parse(result[0].chips);
          // Delete the old chip.
          if(chips.length >= this.dayCountLimit){
            chips.pop();
          }
          // Add the new chip.
          chips.unshift(totalChips[i]);
          // Check if the chip status is bought continuously. 
          let foreignInvestorsCB3 = this.isContinuousBuy("foreignInvestors", 3, chips);
          let foreignInvestorsCB5 = this.isContinuousBuy("foreignInvestors", 5, chips);
          let investmentTrustCB3 = this.isContinuousBuy("investmentTrust", 3, chips);
          let investmentTrustCB5 = this.isContinuousBuy("investmentTrust", 5, chips);
          let dealerCB3 = this.isContinuousBuy("dealer", 3, chips);
          let dealerCB5 = this.isContinuousBuy("dealer", 5, chips);
          let institutionalInvestorsCB3 = this.isContinuousBuy("institutionalInvestors", 3, chips);
          let institutionalInvestorsCB5 = this.isContinuousBuy("institutionalInvestors", 5, chips);
          // Save the stock price to database.
          await database.query(`UPDATE ${this.chipTable} SET chips='${JSON.stringify(chips)}',
          foreign_investors_cb_3="${foreignInvestorsCB3}",
          foreign_investors_cb_5="${foreignInvestorsCB5}",
          investment_trust_cb_3="${investmentTrustCB3}",
          investment_trust_cb_5="${investmentTrustCB5}",
          dealer_cb_3="${dealerCB3}",
          dealer_cb_5="${dealerCB5}",
          institutional_investors_cb_3="${institutionalInvestorsCB3}",
          institutional_investors_cb_5="${institutionalInvestorsCB5}",
          updated_time="${updatedTime}" WHERE stock_no="${stockNo}"`);
        }
        // Compensate zero.
        let nonchipStocks = await database.query(`SELECT stock_no FROM ${this.chipTable} WHERE updated_time<${updatedTime}`)
        for(let i = 0; i < nonchipStocks.length; i++){
          let result = await database.query(`SELECT chips FROM ${this.chipTable} WHERE stock_no="${nonchipStocks[i].stock_no}"`);
          let chips = JSON.parse(result[0].chips);
          // Delete the old chip.
          if(chips.length >= this.dayCountLimit){
            chips.pop();
          }
          // Add the new chip.
          chips.unshift({
            foreignInvestorsBS: 0,
            investmentTrustBS: 0,
            dealerBS: 0,
            institutionalInvestorsBS: 0,
            date
          });
          // Save the stock price to database.
          await database.query(`UPDATE ${this.chipTable} SET chips='${JSON.stringify(chips)}',
          foreign_investors_cb_3="0",
          foreign_investors_cb_5="0",
          investment_trust_cb_3="0",
          investment_trust_cb_5="0",
          dealer_cb_3="0",
          dealer_cb_5="0",
          institutional_investors_cb_3="0",
          institutional_investors_cb_5="0",
          updated_time="${updatedTime}" WHERE stock_no="${nonchipStocks[i].stock_no}"`);
        }
        resolve();
      }
      catch(e){
        reject(e);
      }
      database.end();
    });
  }
  // Get the stock chips incluing institutional investors.
  // input : date (ex : 20210601)
  // output : the stock chips
  getChips(type, date){
    return new Promise((resolve, reject) => {
      if(type === 'sii'){
        const chipUrl = `https://www.twse.com.tw/fund/T86?response=json&date=${date}&selectType=ALLBUT0999`;
        axios.get(chipUrl)
          .then(res => {
            let data = [];
            if(res.data.stat !== 'OK') return resolve(data);
            let chipInfo = res.data.data;
            data = chipInfo.map(item => {
              let chip = {};
              chip.no = item[0];
              chip.foreignInvestorsBS = Math.round(item[4].replace(/,/g, '') / 1000);
              chip.investmentTrustBS = Math.round(item[10].replace(/,/g, '') / 1000);
              chip.dealerBS = Math.round(item[11].replace(/,/g, '') / 1000);
              chip.institutionalInvestorsBS = chip.foreignInvestorsBS + chip.investmentTrustBS + chip.dealerBS;
              chip.date = date;
              return chip;
            })
            resolve(data);
          })
          .catch(err => {
            reject(err);
          })
      }
      else{
        const transformDate = `${date.slice(0,4) - 1911}/${date.slice(4,6)}/${date.slice(6)}`;
        const chipUrl = `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&se=EW&t=D&d=${transformDate}`;
        axios.get(chipUrl)
          .then(res => {
            let data = [];
            if(!res.data.aaData.length) return resolve(data);
            let chipInfo = res.data.aaData;
            data = chipInfo.map(item => {
              let chip = {};
              chip.no = item[0];
              chip.foreignInvestorsBS = Math.round(item[4].replace(/,/g, '') / 1000);
              chip.investmentTrustBS = Math.round(item[13].replace(/,/g, '') / 1000);
              chip.dealerBS = Math.round(item[22].replace(/,/g, '') / 1000);
              chip.institutionalInvestorsBS = Math.round(item[23].replace(/,/g, '') / 1000);
              chip.date = date;
              return chip;
            })
            resolve(data);
          })
          .catch(err => {
            reject(err);
          })
      }
    })
  }
  // Check if the inventor purchases continuously chips.
  // input : 
  //  inventor : foreign investor or investment trust or dealer or institutional investor
  //  dayCount : the dayCount of continuous purchasing
  //  chips : the stock chips
  // output : true : coutinuous purchasing, false : noncontinuous purchasing 
  isContinuousBuy(inventor, dayCount, chips){
    if(chips.length < dayCount) return 0;
    let inventorProperty;
    switch(inventor){
      case 'foreignInvestors':{
        inventorProperty = "foreignInvestorsBS";
        break;
      }
      case 'investmentTrust':{
        inventorProperty = "investmentTrustBS";
        break;
      }
      case 'dealer':{
        inventorProperty = "dealerBS";
        break;
      }
      case 'institutionalInvestors':{
        inventorProperty = "institutionalInvestorsBS";
        break;
      }
    }
    for(let i = 0; i < dayCount; i++){
      if(chips[i][inventorProperty] <= 0){
        return 0;
      }
    }
    return 1;
  }  
  /*
  fundament
  */
  // Initialize the fundament.
  async initFundament(startDate){
    const database = new Database();

    try{
      // Get all companies.
      const siiCompanies = await this.getAllCompanies('sii');
      const otcCompanies = await this.getAllCompanies('otc');
      const companies = [...siiCompanies, ...otcCompanies];
      for(let i = 0; i < companies.length; i++){
        await database.query(`INSERT INTO ${this.fundamentTable} SET stock_no="${companies[i].no}", stock_name="${companies[i].name}",
        monthly_revenues='[]', EPSes='[]', incomes='[]'`);
      }
      // Initalize stock monthly revenues.
      let monthlyRevenueCount = this.initMonthCount;
      let date = startDate.slice(0,6);       
      // Get the monthly revenue for all companies in six months.
      while(monthlyRevenueCount){
        let year = date.substring(0, 4);
        let month = date.substring(4);
        const siiMonthlyRevenues = await this.getMonthlyRevenues('sii', year, month);
        const otcMonthlyRevenues = await this.getMonthlyRevenues('otc', year, month);
        const totalMonthlyRevenues = [...siiMonthlyRevenues, ...otcMonthlyRevenues];

        if(!totalMonthlyRevenues.length){
          date = moment(date).subtract(1, 'month').format("YYYYMM");
          continue;
        } 
        for(let i = 0; i < totalMonthlyRevenues.length; i++){
          let stockNo = totalMonthlyRevenues[i].no;
          delete totalMonthlyRevenues[i].no;
          let result = await database.query(`SELECT monthly_revenues FROM ${this.fundamentTable} WHERE stock_no="${stockNo}"`);
          // Check if the monthly revenue is exist.
          if(!result.length) continue;
          let monthlyRevenues = JSON.parse(result[0].monthly_revenues);
          monthlyRevenues.push(totalMonthlyRevenues[i]);
          await database.query(`UPDATE ${this.fundamentTable} SET monthly_revenues='${JSON.stringify(monthlyRevenues)}' WHERE stock_no="${stockNo}"`);
        }
        date = moment(date).subtract(1, 'month').format("YYYYMM");
        monthlyRevenueCount--;
      }

      // Initalize stock epses.
      let EPSSeasonCount = this.initSeasonCount;
      date = startDate;
      let [year, season] = this.getSeason(date);
    
      while(EPSSeasonCount){
        const siiEPSes = await this.getEPSes('sii', year, season);
        const otcEPSes = await this.getEPSes('otc', year, season);
        const totalEPSes = [...siiEPSes, ...otcEPSes];

        if(!totalEPSes.length){
          if(season === 1){
            season = 4;
            year--;
          }
          else{
            season--;
          }
          continue; 
        }
        for(let i = 0; i < totalEPSes.length; i++){
          let stockNo = totalEPSes[i].no;
          delete totalEPSes[i].no;
          let result = await database.query(`SELECT EPSes FROM ${this.fundamentTable} WHERE stock_no="${stockNo}"`);
          // Check if the monthly revenue is exist.
          if(!result.length) continue;
          let EPSes = JSON.parse(result[0].EPSes);
          let EPSLength = EPSes.length;
          if(EPSLength && totalEPSes[i].season !== 4){
            EPSes[EPSLength - 1].EPS = Math.round((EPSes[EPSLength - 1].EPS - totalEPSes[i].EPS) * 100) / 100;
          }
          EPSes.push(totalEPSes[i]);
          await database.query(`UPDATE ${this.fundamentTable} SET EPSes='${JSON.stringify(EPSes)}' WHERE stock_no="${stockNo}"`);
        }
        if(season === 1){
          season = 4;
          year--;
        }
        else{
          season--;
        }
        EPSSeasonCount--;
      }

      // Initalize stock income.
      let incomeSeasonCount = this.initSeasonCount;
      date = startDate;
      [year, season] = this.getSeason(date);
    
      while(incomeSeasonCount){
        const siiIncomes = await this.getIncomes('sii', year, season);
        const otcIncomes = await this.getIncomes('otc', year, season);
        const totalIncomes = [...siiIncomes, ...otcIncomes];

        if(!totalIncomes.length){
          if(season === 1){
            season = 4;
            year--;
          }
          else{
            season--;
          }
          continue; 
        }
        for(let i = 0; i < totalIncomes.length; i++){
          let stockNo = totalIncomes[i].no;
          delete totalIncomes[i].no;
          let result = await database.query(`SELECT incomes FROM ${this.fundamentTable} WHERE stock_no="${stockNo}"`);
          // Check if the monthly revenue is exist.
          if(!result.length) continue;
          let incomes = JSON.parse(result[0].incomes);
          incomes.push(totalIncomes[i]);
          await database.query(`UPDATE ${this.fundamentTable} SET incomes='${JSON.stringify(incomes)}' WHERE stock_no="${stockNo}"`)
        }
        if(season === 1){
          season = 4;
          year--;
        }
        else{
          season--;
        }
        incomeSeasonCount--;
      }
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  // Update monthly revenues.
  async updateMonthlyRevenues(date){
    const database = new Database();
    let year = date.substring(0, 4);
    let month = date.substring(4);

    try{
      const siiMonthlyRevenues = await this.getMonthlyRevenues('sii', year, month);
      const otcMonthlyRevenues = await this.getMonthlyRevenues('otc', year, month);
      const totalMonthlyRevenues = [...siiMonthlyRevenues, ...otcMonthlyRevenues];
      // The last month revenue dosen't apear.
      if(!totalMonthlyRevenues.length) return database.end();
      // Add the month revenues.
      for(let i = 0; i < totalMonthlyRevenues.length; i++){
        let stockNo = totalMonthlyRevenues[i].no;
        delete totalMonthlyRevenues[i].no;
        let result = await database.query(`SELECT monthly_revenues FROM ${this.fundamentTable} WHERE stock_no="${stockNo}"`);
        // Check if the monthly revenue is exist.
        if(!result.length) continue;
        let monthlyRevenues = JSON.parse(result[0].monthly_revenues);
        // Check if the month revenue had been added.
        if(monthlyRevenues[0].date === date) continue;
        if(monthlyRevenues.length >= this.monthCountLimit) monthlyRevenues.pop();
        monthlyRevenues.unshift(totalMonthlyRevenues[i]);
        await database.query(`UPDATE ${this.fundamentTable} SET monthly_revenues='${JSON.stringify(monthlyRevenues)}' WHERE stock_no="${stockNo}"`)
      }
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  // Update espes.
  async updateEPSes(date){
    const database = new Database();
    let [year, season] = this.getSeason(date);
    
    try{
      const siiEPSes = await this.getEPSes('sii', year, season);
      const otcEPSes = await this.getEPSes('otc', year, season);
      const totalEPSes = [...siiEPSes, ...otcEPSes];
      // The eps dosen't apear.
      if(!totalEPSes.length) return database.end();
      // Add the epses.
      for(let i = 0; i < totalEPSes.length; i++){
        let stockNo = totalEPSes[i].no;
        delete totalEPSes[i].no;
        let result = await database.query(`SELECT EPSes FROM ${this.fundamentTable} WHERE stock_no="${stockNo}"`);
        // Check if the eps is exist.
        if(!result.length) continue;
        let EPSes = JSON.parse(result[0].EPSes);
        // Check if the eps had been added.
        if(EPSes[0].year == year && EPSes[0].season == season) continue;
        if(totalEPSes[i].season !== 1 && EPSes.length){
          let count = EPSes.length >= totalEPSes[i].season - 1 ? totalEPSes[i].season - 1 : EPSes.length;
          for(let j = 0; j < count; j++){
            totalEPSes[i].EPS -= EPSes[j].EPS;
          }
          totalEPSes[i].EPS = Math.round(totalEPSes[i].EPS * 100) / 100;
        }
        if(EPSes.length >= this.seasonCountLimit) EPSes.pop();
        EPSes.unshift(totalEPSes[i]);
        await database.query(`UPDATE ${this.fundamentTable} SET EPSes='${JSON.stringify(EPSes)}' WHERE stock_no="${stockNo}"`);
      }
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  // Update income.
  async updateIncomes(date){
    const database = new Database();
    let [year, season] = this.getSeason(date);
    
    try{
      const siiIncomes = await this.getIncomes('sii', year, season);
      const otcIncomes = await this.getIncomes('otc', year, season);
      const totalIncomes = [...siiIncomes, ...otcIncomes];
      // The income dosen't apear.
      if(!totalIncomes.length) return database.end();
      // Add incomes. 
      for(let i = 0; i < totalIncomes.length; i++){
        let stockNo = totalIncomes[i].no;
        delete totalIncomes[i].no;
        let result = await database.query(`SELECT incomes FROM ${this.fundamentTable} WHERE stock_no="${stockNo}"`);
        // Check if the monthly revenue is exist.
        if(!result.length) continue;
        let incomes = JSON.parse(result[0].incomes);
        // Check if the income had been added.
        if(incomes[0].year == year && incomes[0].season == season) continue;
        if(incomes.length >= this.seasonCountLimit) incomes.pop();
        incomes.unshift(totalIncomes[i]);
        await database.query(`UPDATE ${this.fundamentTable} SET incomes='${JSON.stringify(incomes)}' WHERE stock_no="${stockNo}"`);
      }
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  async updatePERs(date){
    const database = new Database();

    try{
      const siiPERS = await this.getPERs('sii', date);
      const otcPERS = await this.getPERs('otc', date);
      const totalPERS = [...siiPERS, ...otcPERS];

      // true: The stock was opened on this date.
      // false: oppsite
      if(!totalPERS.length) return database.end();
      for(let i = 0; i < totalPERS.length; i++){
        await database.query(`UPDATE ${this.fundamentTable} SET 
        dividend_yield="${totalPERS[i].dividendYield}",
        PER = "${totalPERS[i].PER}",
        PBR = "${totalPERS[i].PBR}"
        WHERE stock_no="${totalPERS[i].no}"`);
      }
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  // Get the monthly revenues.
  // input : year, month (ex : 2021, 06)
  // output : the monthly revenues of all stocks 
  getMonthlyRevenues(type, year, month){
    return new Promise((resolve, reject) => {
      let date = `${year}${month}`;
      if(year > 1990) year -= 1911;
      if(month < 10) month = month.substring(1);
      const monthlyRevenueUrl = `https://mops.twse.com.tw/nas/t21/${type}/t21sc03_${year}_${month}_0.html`;
      axios.get(monthlyRevenueUrl)
        .then(res => {
          let data = [];
          const $ = cheerio.load(res.data);
          let trTags = $('tr[align=right]');
          if(!trTags.length) return resolve(data);
          for(let i = 0; i < trTags.length; i++){
            if($(trTags[i]).find('th').length) continue;
            let tdTags = $(trTags[i]).find('td');
            let stock = {};
            stock.no = $(tdTags[0]).text();
            stock.revenue = Number($(tdTags[2]).text().replace(/,/g, ''));
            stock.MoM = Number($(tdTags[5]).text().replace(/,/g, ''));
            stock.YoY = Number($(tdTags[6]).text().replace(/,/g, ''));
            stock.totalYoY = Number($(tdTags[9]).text().replace(/,/g, ''));
            stock.date = date;
            data.push(stock);
          }
          resolve(data);
        })
        .catch(err => {
          reject(err);
        })
    })
  }
  // Get the espes.
  // input : year, season (ex : 2021, 1)
  // output : the epses of all stocks
  getEPSes(type, year, season){
    return new Promise((resolve, reject) => {
      if(year > 1990) year -= 1911;
      const params = new URLSearchParams();
      params.append('encodeURIComponent', 1);
      params.append('step', 1);
      params.append('firstin', 1);
      params.append('off', 1);
      params.append('isQuery', 'Y');
      params.append('TYPEK', type);
      params.append('year', year);
      params.append('season', season);
      const config = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
      axios.post('https://mops.twse.com.tw/mops/web/t163sb04', params, config)
        .then(res => {
          let data = [];
          const $ = cheerio.load(res.data);
          let trTags = $('tr.even, tr.odd');
          if(!trTags.length) return resolve(data);
          for(let i = 0; i < trTags.length; i++){
            let tdTags = $(trTags[i]).find('td');
            let stock = {};
            stock.no = $(tdTags[0]).text();
            stock.EPS = Number($(tdTags[tdTags.length - 1]).text().replace(/,/g, ''));
            stock.year = year + 1911;
            stock.season = season;
            data.push(stock);
          }
          resolve(data);
        })
        .catch(err => {
          reject(err);
        })
    })
  }
  // Get the income.
  // input : year, season (ex : 2021, 1)
  // output : the income of all stocks
  getIncomes(type, year, season){
    return new Promise((resolve, reject) => {
      if(year > 1990) year -= 1911;
      const params = new URLSearchParams();
      params.append('encodeURIComponent', 1);
      params.append('step', 1);
      params.append('firstin', 1);
      params.append('off', 1);
      params.append('isQuery', 'Y');
      params.append('TYPEK', type);
      params.append('year', year);
      params.append('season', season);
      const config = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
      axios.post('https://mops.twse.com.tw/mops/web/ajax_t163sb06', params, config)
        .then(res => {
          let data = [];
          const $ = cheerio.load(res.data);
          let trTags = $('tr.even, tr.odd');
          if(!trTags.length) return resolve(data);
          for(let i = 0; i < trTags.length; i++){
            let tdTags = $(trTags[i]).find('td');
            let stock = {};
            stock.no = $(tdTags[0]).text();
            stock.grossProfitRatio = Number($(tdTags[3]).text().replace(/,/g, ''));
            stock.operatingIncomeRatio = Number($(tdTags[4]).text().replace(/,/g, ''));
            stock.netIncomeBeforeTaxRatio = Number($(tdTags[5]).text().replace(/,/g, ''));
            stock.netIncomeAfterTaxRatio = Number($(tdTags[6]).text().replace(/,/g, ''));
            stock.year = year + 1911;
            stock.season = season;
            data.push(stock);
          }
          resolve(data);
        })
        .catch(err => {
          reject(err);
        })
    })
  }
  getPERs(type, date){
    return new Promise((resolve, reject) => {
      if(type === 'sii'){
        const url = `https://www.twse.com.tw/exchangeReport/BWIBBU_d?response=json&date=${date}&selectType=ALL`
        axios.get(url)
          .then(res => {
            let data = [];
            // The stock wasn't opened on this date.
            if(res.data.stat !== "OK") return resolve(data);
            let PERInfo = res.data.data;
            for(let i = 0; i < PERInfo.length; i++){
              let stock ={};
              stock.no = PERInfo[i][0];
              stock.dividendYield = Number(PERInfo[i][2].replace(/,/g, ''));
              stock.PER = Number(PERInfo[i][4].replace(/,/g, ''));
              stock.PBR = Number(PERInfo[i][5].replace(/,/g, ''));
              // Check if the stock price is exist.
              if(!isNaN(stock.PER)){
                data.push(stock);
              }
            }
            resolve(data);
          })
          .catch(err => reject(err));
      }
      else{
        const transformDate = `${date.slice(0,4) - 1911}/${date.slice(4,6)}/${date.slice(6)}`;
        const url = `https://www.tpex.org.tw/web/stock/aftertrading/peratio_analysis/pera_result.php?l=zh-tw&d=${transformDate}`;
        axios.get(url)
          .then(res => {
            let data = [];
            // The stock wasn't opened on this date.
            if(!res.data.aaData.length) return resolve(data);
            let stockInfo = res.data.aaData;
            for(let i = 0; i < stockInfo.length; i++){
              let stock ={};
              stock.no = stockInfo[i][0];
              stock.dividendYield = Number(stockInfo[i][5].replace(/,/g, ''));
              stock.PER = Number(stockInfo[i][2].replace(/,/g, ''));
              stock.PBR = Number(stockInfo[i][6].replace(/,/g, ''));
              // Check if the stock price is exist.
              if(!isNaN(stock.PER)){
                data.push(stock);
              }
            }
            resolve(data);
          })
          .catch(err => reject(err));
      }
    })
  }
  // Get year and season.
  // output : year, season (ex : 2021, 1)
  getSeason(date){
    let year = date.substring(0, 4);
    date = Number(date.substring(4));
    let season;
  
    // {date: '0331',season:4},{date: '0515',season: 1},{date: '0814',season: 2},{date: '1114',season:3}
    if(date < 331){
      season = 3;
      year--;
    }
    else if(date < 515){
      season = 4;
      year--;
    }
    else if(date < 814){
      season = 1;
    }
    else if(date < 1114){
      season = 2;
    }
    else{
      season = 3;
    }
    return [year, season];
  }
  async initCompany(){
    const database = new Database();
    try{
      const siiCompanies = await this.getAllCompanies('sii');
      const otcCompanies = await this.getAllCompanies('otc');
      const companies = [...siiCompanies, ...otcCompanies];
      for(let i = 0; i < companies.length; i++){
        await database.query(`INSERT INTO ${this.company} SET
        stock_no="${companies[i].no}",
        stock_name="${companies[i].name}",
        type="${companies[i].type}",
        industry_category="${companies[i].industryCategory}",
        address="${companies[i].address}",
        website="${companies[i].website}"`);
      }
    }
    catch(e){
      throw e;
    }
    database.end();
  }
  // Get all companies.
  // input : the type of companies (ex : sii or otc)
  // output : the name and no of companies in sii or otc. 
  getAllCompanies(type){
    return new Promise((resolve, reject) => {
      const companiesUrl = 'https://mops.twse.com.tw/mops/web/ajax_t51sb01'
      const params = new URLSearchParams();
      params.append('encodeURIComponent', 1);
      params.append('step', 1);
      params.append('firstin', 1);
      params.append('TYPEK', type);
      const config = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
      axios.post(companiesUrl, params, config)
        .then(res => {
          let companies = [];
          const $ = cheerio.load(res.data);
          let trTags = $('.odd, .even');
          for(let i = 0; i < trTags.length; i++){
            let company = {};
            company.no = $(trTags[i]).find('td').eq(0).text().trim();
            company.name = $(trTags[i]).find('td').eq(2).text().trim();
            company.type = type === 'sii' ? '上市' : '上櫃';
            company.industryCategory = $(trTags[i]).find('td').eq(3).text().trim();
            company.address = $(trTags[i]).find('td').eq(5).text().trim();
            company.website = $(trTags[i]).find('td').eq(33).text().trim();
            companies.push(company);
          }
          resolve(companies);
        })
        .catch(err => {
          reject(err);
        })
    })
  }
  // Sleep
  sleep(ms){
    return new Promise(resolve => setTimeout(() => resolve(), ms));
  }
}

module.exports = Stock;