const mysql = require('mysql');

class Database{
  constructor(){
    this.pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user     : process.env.DB_USER,
      password : process.env.DB_PASSWORD,
      database: 'stock',
      connectionLimit : 10,
    });
  }
  query(query){
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, connection) => {
        if(err) return reject(err);
        connection.query(query, (err, results) => {
          if(err) reject(err);
          resolve(results);
          connection.release();
        })
      });
    });
  }
  end(){
    this.pool.end();
  }
}
// function dbConnection(query){
//   return new Promise((resolve, reject) => {
//     pool.getConnection((err, connection) => {
//       if(err) return reject(err);
//       connection.query(query, (err, results) => {
//         if(err) reject(err);
//         resolve(results);
//         connection.release();
//       })
//     });
//   });
// }

module.exports = Database;
