const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sportanalytics',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

let schemaReady = false;
let schemaPromise = null;

async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS squadre (
        id_squadra INT AUTO_INCREMENT PRIMARY KEY,
        api_team_id INT NOT NULL UNIQUE,
        nome VARCHAR(120) NOT NULL,
        citta VARCHAR(120) DEFAULT NULL,
        anno_fondazione INT DEFAULT NULL,
        stadio VARCHAR(160) DEFAULT NULL,
        logo_url TEXT DEFAULT NULL,
        logo_sigla VARCHAR(10) NOT NULL,
        colore VARCHAR(7) NOT NULL DEFAULT '#1a8a2e',
        campionato VARCHAR(120) DEFAULT NULL,
        paese VARCHAR(80) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS utenti (
        id_utente INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        cognome VARCHAR(100) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        ruolo ENUM('tifoso', 'allenatore', 'analista') NOT NULL,
        id_squadra_preferita INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_utenti_squadra
          FOREIGN KEY (id_squadra_preferita) REFERENCES squadre(id_squadra)
          ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS giocatori (
        id_giocatore INT AUTO_INCREMENT PRIMARY KEY,
        api_player_id INT NOT NULL UNIQUE,
        nome VARCHAR(120) NOT NULL,
        cognome VARCHAR(120) DEFAULT '',
        ruolo VARCHAR(60) DEFAULT 'attaccante',
        eta INT DEFAULT NULL,
        nazionalita VARCHAR(80) DEFAULT NULL,
        numero_maglia INT DEFAULT NULL,
        gol_fatti INT NOT NULL DEFAULT 0,
        assist INT NOT NULL DEFAULT 0,
        foto_url TEXT DEFAULT NULL,
        id_squadra INT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_giocatori_squadra
          FOREIGN KEY (id_squadra) REFERENCES squadre(id_squadra)
          ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_giocatori_squadra (id_squadra),
        INDEX idx_giocatori_gol (gol_fatti)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS partite (
        id_partita INT AUTO_INCREMENT PRIMARY KEY,
        api_fixture_id INT NOT NULL UNIQUE,
        league_id INT NOT NULL,
        stagione INT NOT NULL,
        data_ora DATETIME NOT NULL,
        venue VARCHAR(160) DEFAULT NULL,
        round_name VARCHAR(120) DEFAULT NULL,
        gol_casa INT DEFAULT NULL,
        gol_trasferta INT DEFAULT NULL,
        stato ENUM('programmata', 'in_corso', 'terminata', 'rinviata') NOT NULL DEFAULT 'programmata',
        id_squadra_casa INT NOT NULL,
        id_squadra_trasferta INT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_partite_squadra_casa
          FOREIGN KEY (id_squadra_casa) REFERENCES squadre(id_squadra)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_partite_squadra_trasferta
          FOREIGN KEY (id_squadra_trasferta) REFERENCES squadre(id_squadra)
          ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_partite_data (data_ora),
        INDEX idx_partite_stato (stato),
        INDEX idx_partite_squadre (id_squadra_casa, id_squadra_trasferta)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id_sync INT AUTO_INCREMENT PRIMARY KEY,
        sorgente VARCHAR(80) NOT NULL,
        league_id INT NOT NULL,
        stagione INT NOT NULL,
        stato VARCHAR(20) NOT NULL,
        squadre_importate INT NOT NULL DEFAULT 0,
        partite_importate INT NOT NULL DEFAULT 0,
        giocatori_importati INT NOT NULL DEFAULT 0,
        messaggio TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sync_latest (created_at)
      )
    `);

    schemaReady = true;
  })();

  try {
    await schemaPromise;
  } finally {
    if (schemaReady) {
      schemaPromise = null;
    }
  }
}

async function query(sql, params = []) {
  await ensureSchema();
  return pool.query(sql, params);
}

module.exports = {
  pool,
  query,
  ensureSchema,
};
