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

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function dropIndexesForColumn(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT DISTINCT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND INDEX_NAME <> 'PRIMARY'
    `,
    [tableName, columnName]
  );

  for (const row of rows) {
    await pool.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${row.INDEX_NAME}\``);
  }
}

async function addColumnIfMissing(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) {
    return;
  }

  await pool.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
  );
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );

  return rows.length > 0;
}

async function addIndexIfMissing(tableName, indexName, definition) {
  if (await indexExists(tableName, indexName)) {
    return;
  }

  await pool.query(
    `ALTER TABLE \`${tableName}\` ADD ${definition}`
  );
}

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

    if (await columnExists('squadre', 'api_team_id')) {
      await dropIndexesForColumn('squadre', 'api_team_id');
      await pool.query('ALTER TABLE squadre DROP COLUMN api_team_id');
    }

    await addColumnIfMissing('squadre', 'citta', 'VARCHAR(120) DEFAULT NULL');
    await addColumnIfMissing('squadre', 'anno_fondazione', 'INT DEFAULT NULL');
    await addColumnIfMissing('squadre', 'stadio', 'VARCHAR(160) DEFAULT NULL');
    await addColumnIfMissing('squadre', 'logo_url', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('squadre', 'logo_sigla', "VARCHAR(10) NOT NULL DEFAULT 'N/A'");
    await addColumnIfMissing('squadre', 'colore', "VARCHAR(7) NOT NULL DEFAULT '#1a8a2e'");
    await addColumnIfMissing('squadre', 'campionato', 'VARCHAR(120) DEFAULT NULL');
    await addColumnIfMissing('squadre', 'paese', 'VARCHAR(80) DEFAULT NULL');
    await addColumnIfMissing('squadre', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing('squadre', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

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

    await addColumnIfMissing('giocatori', 'api_player_id', 'INT DEFAULT NULL');
    await addColumnIfMissing('giocatori', 'cognome', "VARCHAR(120) DEFAULT ''");
    await addColumnIfMissing('giocatori', 'ruolo', "VARCHAR(60) DEFAULT 'attaccante'");
    await addColumnIfMissing('giocatori', 'eta', 'INT DEFAULT NULL');
    await addColumnIfMissing('giocatori', 'nazionalita', 'VARCHAR(80) DEFAULT NULL');
    await addColumnIfMissing('giocatori', 'numero_maglia', 'INT DEFAULT NULL');
    await addColumnIfMissing('giocatori', 'assist', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('giocatori', 'foto_url', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('giocatori', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    await addIndexIfMissing('giocatori', 'api_player_id', 'UNIQUE INDEX `api_player_id` (`api_player_id`)');
    await addIndexIfMissing('giocatori', 'idx_giocatori_squadra', 'INDEX `idx_giocatori_squadra` (`id_squadra`)');
    await addIndexIfMissing('giocatori', 'idx_giocatori_gol', 'INDEX `idx_giocatori_gol` (`gol_fatti`)');

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

    await addColumnIfMissing('partite', 'api_fixture_id', 'INT DEFAULT NULL');
    await addColumnIfMissing('partite', 'league_id', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('partite', 'stagione', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('partite', 'venue', 'VARCHAR(160) DEFAULT NULL');
    await addColumnIfMissing('partite', 'round_name', 'VARCHAR(120) DEFAULT NULL');
    await addColumnIfMissing('partite', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    await addIndexIfMissing('partite', 'api_fixture_id', 'UNIQUE INDEX `api_fixture_id` (`api_fixture_id`)');
    await addIndexIfMissing('partite', 'idx_partite_data', 'INDEX `idx_partite_data` (`data_ora`)');
    await addIndexIfMissing('partite', 'idx_partite_stato', 'INDEX `idx_partite_stato` (`stato`)');
    await addIndexIfMissing('partite', 'idx_partite_squadre', 'INDEX `idx_partite_squadre` (`id_squadra_casa`, `id_squadra_trasferta`)');

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

    await addColumnIfMissing('sync_log', 'sorgente', "VARCHAR(80) NOT NULL DEFAULT 'manual'");
    await addColumnIfMissing('sync_log', 'league_id', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('sync_log', 'stagione', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('sync_log', 'stato', "VARCHAR(20) NOT NULL DEFAULT 'unknown'");
    await addColumnIfMissing('sync_log', 'squadre_importate', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('sync_log', 'partite_importate', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('sync_log', 'giocatori_importati', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('sync_log', 'messaggio', 'TEXT DEFAULT NULL');
    await addColumnIfMissing('sync_log', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await addIndexIfMissing('sync_log', 'idx_sync_latest', 'INDEX `idx_sync_latest` (`created_at`)');

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
