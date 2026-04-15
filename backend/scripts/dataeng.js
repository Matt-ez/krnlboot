const axios = require('axios');
const db = require('../db');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// CONFIG
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION = 'SA'; // Serie A

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'X-Auth-Token': API_KEY }
});

// ===============================
// FUNZIONI UTILI
// ===============================

function mapStatus(status) {
  if (status === 'FINISHED') return 'terminata';
  if (status === 'IN_PLAY') return 'in_corso';
  return 'programmata';
}

function splitName(fullName) {
  const parts = fullName.split(' ');
  return {
    nome: parts.slice(0, -1).join(' ') || parts[0],
    cognome: parts.slice(-1).join('')
  };
}

// ===============================
// FETCH DATI
// ===============================

async function fetchTeams() {
  const res = await api.get(`/competitions/${COMPETITION}/standings`);
  return res.data.standings[0].table.map(t => t.team);
}

async function fetchMatches() {
  const res = await api.get(`/competitions/${COMPETITION}/matches`);
  return res.data.matches;
}

async function fetchScorers() {
  const res = await api.get(`/competitions/${COMPETITION}/scorers`);
  return res.data.scorers;
}

// ===============================
// INSERT DATABASE
// ===============================

async function insertTeams(connection, teams) {
  for (const t of teams) {
    await connection.query(`
      INSERT INTO squadre (nome, citta, anno_fondazione, stadio, logo_sigla, colore)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE nome = VALUES(nome)
    `, [
      t.name,
      'Sconosciuta',
      null,
      null,
      t.tla || t.name.slice(0,3).toUpperCase(),
      '#1a8a2e'
    ]);
  }
}

async function getTeamMap(connection) {
  const [rows] = await connection.query(`SELECT id_squadra, nome FROM squadre`);
  const map = new Map();
  rows.forEach(r => map.set(r.nome, r.id_squadra));
  return map;
}

async function insertMatches(connection, matches, teamMap) {
  for (const m of matches) {
    const home = teamMap.get(m.homeTeam.name);
    const away = teamMap.get(m.awayTeam.name);

    if (!home || !away) continue;

    await connection.query(`
      INSERT INTO partite (
        data_ora, gol_casa, gol_trasferta, stato,
        id_squadra_casa, id_squadra_trasferta
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      m.utcDate,
      m.score.fullTime.home,
      m.score.fullTime.away,
      mapStatus(m.status),
      home,
      away
    ]);
  }
}

async function insertPlayers(connection, scorers, teamMap) {
  for (const s of scorers) {
    const teamId = teamMap.get(s.team.name);
    if (!teamId) continue;

    const name = splitName(s.player.name);

    await connection.query(`
      INSERT INTO giocatori (nome, cognome, ruolo, gol_fatti, assist, id_squadra)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      name.nome,
      name.cognome,
      s.player.position || 'Attaccante',
      s.goals || 0,
      s.assists || 0,
      teamId
    ]);
  }
}

// ===============================
// MAIN
// ===============================

async function syncData() {
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();

    console.log('📡 Scaricando dati...');

    const teams = await fetchTeams();
    const matches = await fetchMatches();
    const scorers = await fetchScorers();

    console.log('💾 Inserimento squadre...');
    await insertTeams(connection, teams);

    const teamMap = await getTeamMap(connection);

    console.log('💾 Inserimento partite...');
    await insertMatches(connection, matches, teamMap);

    console.log('💾 Inserimento giocatori...');
    await insertPlayers(connection, scorers, teamMap);

    await connection.commit();
    console.log('✅ Sync completata');

  } catch (err) {
    await connection.rollback();
    console.error('❌ Errore:', err.message);
  } finally {
    connection.release();
  }
}

// AVVIO
syncData();