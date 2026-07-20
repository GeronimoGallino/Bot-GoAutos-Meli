const { Pool } = require('pg');
require('dotenv').config();

// Configuramos el pool usando las variables del .env
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Probamos la conexión apenas arranca el servidor
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('[Base de Datos] ❌ Error crítico de conexión:', err.message);
    } else {
        console.log('[Base de Datos]  Conexión exitosa a PostgreSQL establecida.');
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};