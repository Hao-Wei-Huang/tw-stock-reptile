# TW Stock Reptile

Reptile stock data from Taiwan stock website, and transfrom this stock data into the indexes, e.g., kd, rsi, macd, etc. Make the users search stock information conveniently. Moreover, Use crontab app to update the stock data
automatically.

## Installation

Before installing, install Node.js and npm.

1. Download this project
    
    ```
    git clone https://github.com/Hao-Wei-Huang/tw-stock-api.git
    ```
2. Install the modules for the project
    
    ```
    cd tw-stock-api
    npm install
    ```
3. Setting environmental variables (optional)
    
    If you need to store the stock data into database, you must set these environmental variables.
    
    ```
    touch .env
    ```
    * Database account
      
      ```
      DB_HOST = { host }
      DB_PORT = { port }
      DB_USER = { user }
      DB_PASSWORD = { password }
      DB_NAME = { name }
      ```
    * Database table name
      
      ```
      DB_AUTH_TABLE = auth
      DB_COMPANY_TABLE = company
      DB_TECH_TABLE = technique
      DB_CHIP_TABLE = chip
      DB_FUNDAMENT_TABLE = fundament
      ```
4. Database table setting (optional)

    If you need to store the stock data into database, you must set these environmental variables.  
    
    First field is primary key on the table.

    * table name: auth

      Field | Type  | Default 
      ---  | --- | ---
      uuid   | VARCHAR(36) | not null 
      email | VARCHAR(45) | null 
      password   | VARCHAR(60) | null 
      name | VARCHAR(45) | null 
      tracked_stocks | TEXT | null 
      chose_stock_lists   | TEXT | null 
      chose_stock_email_notification | VARCHAR(45) | null 
      
    * table name: company

      Field | Type  | Default 
      ---  | --- | ---
      stock_no   | VARCHAR(45) | not null 
      stock_name | VARCHAR(45) | null 
      type   | VARCHAR(45) | null 
      industry_category | VARCHAR(45) | null 
      address | VARCHAR(60) | null 
      website   | TEXT | null 
  
    * table name: technique

      Field | Type  | Default 
      ---  | --- | ---
      stock_no   | VARCHAR(45) | not null 
      stock_name | VARCHAR(45) | null 
      prices   | TEXT | null 
      price_5ma | DECIMAL(6,2) | null 
      price_10ma | DECIMAL(6,2) | null 
      price_20ma   | DECIMAL(6,2) | null 
      capacity_5ma | INT | null 
      capacity_10ma | INT | null 
      capacity_20ma   | INT | null
      RSVs | TEXT | null 
      Ks | TEXT | null 
      Ds   | TEXT | null
      bollingerBands | TEXT | null 
      RSI6s | TEXT | null 
      RSI12s   | TEXT | null
      EMA12s | TEXT | null 
      EMA26s | TEXT | null 
      DIFs   | TEXT | null
      MACDs   | TEXT | null
      
    * table name: chip

      Field | Type  | Default 
      ---  | --- | ---
      stock_no   | VARCHAR(45) | not null 
      stock_name | VARCHAR(45) | null 
      chips   | TEXT | null 
      foreign_investors_cb_3 | TINYINT | null 
      foreign_investors_cb_5 | TINYINT | null 
      investment_trust_cb_3   | TINYINT | null 
      investment_trust_cb_5 | TINYINT | null 
      dealer_cb_3 | TINYINT | null 
      dealer_cb_5 | TINYINT | null 
      institutional_investors_cb_3 | TINYINT | null 
      institutional_investors_cb_5 | TINYINT | null
      updated_time | BIGINT | 0 
      
    * table name: fundament

      Field | Type  | Default 
      ---  | --- | ---
      stock_no   | VARCHAR(45) | not null 
      stock_name | VARCHAR(45) | null 
      monthly_revenues   | TEXT | null 
      EPSes | TEXT | null 
      incomes | TEXT | null 
      dividend_yield   | DECIMAL(6,2) | null 
      PER | DECIMAL(6,2) | null 
      PBR | DECIMAL(6,2) | null 

## Usage

Reptile the stock data:

```javascript
const Stock = require('stock.js');

const stock = new Stock();

// Get the stock prices of listed companies on 2021/08/08.
stock.getPrices('sii', 20210808);
// Get the stock prices of TPEx-listed companies on 2021/08/08.
stock.getPrices('otc', 20210808);
```

Initialize the stock data in the database: 

```
node initial-stock.js
```

Use crontab app to update the stock data automatically: 

Set shell script to execute these files.

```
// daily
node daily-update-1615.js
node daily-update-1800.js

// monthly
node monthly-update.js

// quarterly
node quarterly-update.js
```

## Features

* Reptile for Taiwan stock data.
* Transfrom the stock data into the indexes, e.g., kd, rsi, macd, etc.
* Automatically update the stock data.

## Technologies

* Node.js
* Use axios and cheerio to reptile.
* Database operation (CRUD)

## Notes
The data source of the website is from [台灣證券交易所](https://www.twse.com.tw/zh/), [櫃檯買賣中心](https://www.tpex.org.tw/web/index.php?l=zh-tw) ,and [公開資訊觀測站](https://mops.twse.com.tw/mops/web/index).