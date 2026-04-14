/**
 * SCRIPT DATA ENGINEERING - Sport Analytics
 * ==========================================
 * Raccolta dati da API-Football (RapidAPI) via chiamate HTTP
 * Parsing, pulizia e inserimento nel database MySQL
 *
 * Utilizzo: node scripts/dataEngineering.js
 * Richiede: RAPIDAPI_KEY nel file .env
 */

require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const db = require('../db');

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || 'YOUR_RAPIDAPI_KEY';
const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const SERIE_A_ID    = 135;  // ID Serie A su API-Football
const STAGIONE      = 2024;

const apiClient = axios.create({
  baseURL: 'https://api-football-v1.p.rapidapi.com/v3',
  headers: {
    'X-RapidAPI-Key':  RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
  },
  timeout: 10000,
});

// ============================================================
// 1. RACCOLTA DATI - Squadre
// ============================================================
async function fetchSquadre() {
  console.log('📡 Recupero squadre da API-Football...');
  const response = await apiClient.get('/standings', {
    params: { league: SERIE_A_ID, season: STAGIONE }
  });

  const standings = response.data.response?.[0]?.league?.standings?.[0] || [];

  return standings.map(s => ({
    nome:            s.team.name,
    citta:           s.team.name, // API non fornisce città separata
    anno_fondazione: null,
    stadio:          s.team.name + ' Stadium',
    logo_sigla:      s.team.name.substring(0, 3).toUpperCase(),
    colore:          '#1a8a2e',
  }));
}

// ============================================================
// 2. RACCOLTA DATI - Partite
// ============================================================
async function fetchPartite() {
  console.log('📡 Recupero partite da API-Football...');
  const response = await apiClient.get('/fixtures', {
    params: { league: SERIE_A_ID, season: STAGIONE, last: 20 }
  });

  return response.data.response || [];
}

// ============================================================
// 3. DATA CLEANING - Pulizia e normalizzazione dati
// ============================================================
function cleanSquadra(rawSquadra) {
  return {
    nome:            (rawSquadra.nome || '').trim().substring(0, 100),
    citta:           (rawSquadra.citta || 'N/D').trim().substring(0, 100),
    anno_fondazione: rawSquadra.anno_fondazione || null,
    stadio:          (rawSquadra.stadio || 'N/D').trim().substring(0, 100),
    logo_sigla:      (rawSquadra.logo_sigla || 'N/D').toUpperCase().substring(0, 10),
    colore:          rawSquadra.colore || '#1a8a2e',
  };
}

function cleanPartita(rawPartita, squadreMap) {
  const homeId = squadreMap[rawPartita.teams?.home?.name];
  const awayId = squadreMap[rawPartita.teams?.away?.name];

  if (!homeId || !awayId) return null;

  const stato = rawPartita.fixture?.status?.short === 'FT'  ? 'terminata'
               : rawPartita.fixture?.status?.short === 'LIVE' ? 'in_corso'
               : 'programmata';

  return {
    data_ora:             rawPartita.fixture?.date || new Date().toISOString(),
    gol_casa:             rawPartita.score?.fulltime?.home ?? null,
    gol_trasferta:        rawPartita.score?.fulltime?.away ?? null,
    stato,
    id_squadra_casa:      homeId,
    id_squadra_trasferta: awayId,
  };
}

// ============================================================
// 4. INSERIMENTO NEL DATABASE
// ============================================================
async function inserisciSquadre(squadre) {
  console.log(`💾 Inserimento ${squadre.length} squadre nel database...`);
  const ids = {};

  for (const squadra of squadre) {
    const s = cleanSquadra(squadra);
    const [existing] = await db.query('SELECT id_squadra FROM squadre WHERE nome = ?', [s.nome]);

    if (existing.length > 0) {
      ids[s.nome] = existing[0].id_squadra;
      console.log(`  ✓ Squadra già presente: ${s.nome}`);
    } else {
      const [result] = await db.query(
        'INSERT INTO squadre (nome, citta, anno_fondazione, stadio, logo_sigla, colore) VALUES (?, ?, ?, ?, ?, ?)',
        [s.nome, s.citta, s.anno_fondazione, s.stadio, s.logo_sigla, s.colore]
      );
      ids[s.nome] = result.insertId;
      console.log(`  ✓ Inserita squadra: ${s.nome} (ID: ${result.insertId})`);
    }
  }

  return ids;
}

async function inserisciPartite(rawPartite, squadreMap) {
  console.log(`💾 Inserimento partite nel database...`);
  let inserite = 0, saltate = 0;

  for (const raw of rawPartite) {
    const partita = cleanPartita(raw, squadreMap);
    if (!partita) { saltate++; continue; }

    try {
      await db.query(
        `INSERT INTO partite (data_ora, gol_casa, gol_trasferta, stato, id_squadra_casa, id_squadra_trasferta)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [partita.data_ora, partita.gol_casa, partita.gol_trasferta, partita.stato,
         partita.id_squadra_casa, partita.id_squadra_trasferta]
      );
      inserite++;
    } catch (err) {
      saltate++;
      // Ignora duplicati
    }
  }

  console.log(`  ✓ Partite inserite: ${inserite}, saltate: ${saltate}`);
}

// ============================================================
// MAIN - Esecuzione pipeline data engineering
// ============================================================
async function main() {
  console.log('🚀 Avvio pipeline Data Engineering - Sport Analytics');
  console.log('='.repeat(55));

  try {
    if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY') {
      console.warn('⚠️  RAPIDAPI_KEY non configurata. Utilizzo dati di esempio già presenti nel DB.');
      console.log('   Configurare RAPIDAPI_KEY nel file .env per abilitare il fetch automatico.');
      process.exit(0);
    }

    // Step 1: Raccolta dati
    const squadreRaw = await fetchSquadre();
    const partiteRaw = await fetchPartite();

    // Step 2+3: Cleaning + inserimento squadre
    const squadreMap = await inserisciSquadre(squadreRaw);

    // Step 4: Inserimento partite
    await inserisciPartite(partiteRaw, squadreMap);

    console.log('='.repeat(55));
    console.log('✅ Pipeline completata con successo!');
  } catch (err) {
    if (err.response?.status === 403) {
      console.error('❌ API Key non valida o quota esaurita. Controllare RAPIDAPI_KEY.');
    } else {
      console.error('❌ Errore pipeline:', err.message);
    }
  } finally {
    process.exit(0);
  }
}

main();
