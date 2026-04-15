const axios = require('axios');
const db = require('../db');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || 'SA';
const DEFAULT_COLOR = '#1a8a2e';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: {
    'X-Auth-Token': API_KEY,
  },
});

const COLOR_MAP = [
  ['sky blue', '#7dc8f7'],
  ['light blue', '#7dc8f7'],
  ['dark blue', '#1d4ed8'],
  ['navy blue', '#1e3a8a'],
  ['royal blue', '#2563eb'],
  ['blue', '#2563eb'],
  ['red', '#dc2626'],
  ['green', '#16a34a'],
  ['yellow', '#eab308'],
  ['orange', '#f97316'],
  ['black', '#111827'],
  ['white', '#e5e7eb'],
  ['purple', '#7c3aed'],
  ['gold', '#ca8a04'],
  ['silver', '#94a3b8'],
  ['grey', '#6b7280'],
  ['gray', '#6b7280'],
  ['brown', '#92400e'],
  ['pink', '#ec4899'],
  ['maroon', '#7f1d1d'],
  ['claret', '#7f1d1d'],
  ['burgundy', '#7f1d1d'],
];

function mapStatus(status) {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'FINISHED') return 'terminata';
  if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(normalized)) return 'in_corso';
  if (['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(normalized)) return 'rinviata';

  return 'programmata';
}

function initialsFromName(name) {
  if (!name) return 'N/A';

  const compact = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (compact.length === 0) return 'N/A';
  if (compact.length === 1) return compact[0].slice(0, 3).toUpperCase();

  return compact
    .slice(0, 3)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function inferColor(clubColors) {
  const value = String(clubColors || '').toLowerCase();
  if (!value) return DEFAULT_COLOR;

  for (const [label, hex] of COLOR_MAP) {
    if (value.includes(label)) {
      return hex;
    }
  }

  return DEFAULT_COLOR;
}

function extractCity(address) {
  if (!address) return null;

  const segments = address
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const candidate = segments.length > 0 ? segments[segments.length - 1] : address.trim();

  return candidate
    .replace(/\b\d{4,6}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
}

function splitName(fullName, firstName, lastName) {
  if (firstName || lastName) {
    return {
      nome: firstName || fullName || 'Sconosciuto',
      cognome: lastName || '',
    };
  }

  const parts = String(fullName || 'Sconosciuto')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    nome: parts.slice(0, -1).join(' ') || parts[0] || 'Sconosciuto',
    cognome: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

function normalizeRole(role) {
  if (!role) return 'attaccante';
  return String(role).trim().toLowerCase() || 'attaccante';
}

function buildRoundName(match) {
  if (match.matchday) {
    return `Giornata ${match.matchday}`;
  }

  if (match.stage) {
    return String(match.stage).replace(/_/g, ' ');
  }

  return null;
}

function seasonFromSeasonObject(season) {
  if (!season) return new Date().getFullYear();
  if (season.startDate) return Number(String(season.startDate).slice(0, 4));
  if (season.id) return season.id;
  return new Date().getFullYear();
}

function extractScore(score, side) {
  const fullTime = score?.fullTime;
  if (!fullTime) return null;

  return fullTime?.[side]
    ?? fullTime?.[side === 'home' ? 'homeTeam' : 'awayTeam']
    ?? null;
}

async function fetchCompetitionTeams() {
  const res = await api.get(`/competitions/${COMPETITION}/teams`);
  return res.data;
}

async function fetchMatches() {
  const res = await api.get(`/competitions/${COMPETITION}/matches`);
  return res.data.matches || [];
}

async function fetchScorers() {
  const res = await api.get(`/competitions/${COMPETITION}/scorers`);
  return res.data.scorers || [];
}

async function upsertTeams(connection, payload) {
  const teams = payload.teams || [];
  const competitionName = payload.competition?.name || COMPETITION;
  let imported = 0;
  const byApiId = new Map();

  for (const team of teams) {
    const teamValues = [
      team.name,
      extractCity(team.address),
      team.founded || null,
      team.venue || null,
      team.crest || null,
      team.tla || initialsFromName(team.shortName || team.name),
      inferColor(team.clubColors),
      competitionName,
      team.area?.name || null,
    ];

    const [existingRows] = await connection.query(
      'SELECT id_squadra FROM squadre WHERE nome = ? LIMIT 1',
      [team.name]
    );

    let teamId;

    if (existingRows.length > 0) {
      teamId = existingRows[0].id_squadra;

      await connection.query(
        `
          UPDATE squadre
          SET nome = ?,
              citta = COALESCE(?, citta),
              anno_fondazione = COALESCE(?, anno_fondazione),
              stadio = COALESCE(?, stadio),
              logo_url = COALESCE(?, logo_url),
              logo_sigla = ?,
              colore = ?,
              campionato = COALESCE(?, campionato),
              paese = COALESCE(?, paese)
          WHERE id_squadra = ?
        `,
        [...teamValues, teamId]
      );
    } else {
      const [insertResult] = await connection.query(
        `
          INSERT INTO squadre (
            nome,
            citta,
            anno_fondazione,
            stadio,
            logo_url,
            logo_sigla,
            colore,
            campionato,
            paese
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        teamValues
      );

      teamId = insertResult.insertId;
    }

    byApiId.set(team.id, teamId);
    imported += 1;
  }

  return { imported, byApiId };
}

async function getTeamMap(connection, byApiId = new Map()) {
  const [rows] = await connection.query(
    'SELECT id_squadra, nome FROM squadre'
  );

  const byName = new Map();

  for (const row of rows) {
    byName.set(row.nome, row.id_squadra);
  }

  return { byApiId, byName };
}

async function upsertMatches(connection, matches, teamMap) {
  let imported = 0;

  for (const match of matches) {
    const homeTeamId = teamMap.byApiId.get(match.homeTeam?.id) || teamMap.byName.get(match.homeTeam?.name);
    const awayTeamId = teamMap.byApiId.get(match.awayTeam?.id) || teamMap.byName.get(match.awayTeam?.name);

    if (!homeTeamId || !awayTeamId) {
      continue;
    }

    await connection.query(
      `
        INSERT INTO partite (
          api_fixture_id,
          league_id,
          stagione,
          data_ora,
          venue,
          round_name,
          gol_casa,
          gol_trasferta,
          stato,
          id_squadra_casa,
          id_squadra_trasferta
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          league_id = VALUES(league_id),
          stagione = VALUES(stagione),
          data_ora = VALUES(data_ora),
          venue = COALESCE(VALUES(venue), venue),
          round_name = COALESCE(VALUES(round_name), round_name),
          gol_casa = VALUES(gol_casa),
          gol_trasferta = VALUES(gol_trasferta),
          stato = VALUES(stato),
          id_squadra_casa = VALUES(id_squadra_casa),
          id_squadra_trasferta = VALUES(id_squadra_trasferta)
      `,
      [
        match.id,
        match.competition?.id || 0,
        seasonFromSeasonObject(match.season),
        match.utcDate,
        match.venue || null,
        buildRoundName(match),
        extractScore(match.score, 'home'),
        extractScore(match.score, 'away'),
        mapStatus(match.status),
        homeTeamId,
        awayTeamId,
      ]
    );

    imported += 1;
  }

  return imported;
}

async function upsertPlayers(connection, scorers, teamMap) {
  let imported = 0;

  for (const scorer of scorers) {
    const teamId = teamMap.byApiId.get(scorer.team?.id) || teamMap.byName.get(scorer.team?.name);
    if (!teamId || !scorer.player?.id) {
      continue;
    }

    const identity = splitName(
      scorer.player.name,
      scorer.player.firstName,
      scorer.player.lastName
    );

    await connection.query(
      `
        INSERT INTO giocatori (
          api_player_id,
          nome,
          cognome,
          ruolo,
          eta,
          nazionalita,
          numero_maglia,
          gol_fatti,
          assist,
          foto_url,
          id_squadra
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nome = VALUES(nome),
          cognome = VALUES(cognome),
          ruolo = VALUES(ruolo),
          eta = COALESCE(VALUES(eta), eta),
          nazionalita = COALESCE(VALUES(nazionalita), nazionalita),
          numero_maglia = COALESCE(VALUES(numero_maglia), numero_maglia),
          gol_fatti = VALUES(gol_fatti),
          assist = VALUES(assist),
          foto_url = COALESCE(VALUES(foto_url), foto_url),
          id_squadra = VALUES(id_squadra)
      `,
      [
        scorer.player.id,
        identity.nome,
        identity.cognome,
        normalizeRole(scorer.player.position),
        calculateAge(scorer.player.dateOfBirth),
        scorer.player.nationality || null,
        scorer.player.shirtNumber || null,
        scorer.goals || 0,
        scorer.assists || 0,
        scorer.player.photo || null,
        teamId,
      ]
    );

    imported += 1;
  }

  return imported;
}

async function writeSyncLog({ leagueId, season, status, teams, matches, players, message }) {
  await db.query(
    `
      INSERT INTO sync_log (
        sorgente,
        league_id,
        stagione,
        stato,
        squadre_importate,
        partite_importate,
        giocatori_importati,
        messaggio
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      'football-data.org',
      leagueId,
      season,
      status,
      teams,
      matches,
      players,
      message || null,
    ]
  );
}

async function syncData() {
  if (!API_KEY) {
    throw new Error('FOOTBALL_DATA_API_KEY non configurata nel file .env');
  }

  await db.ensureSchema();

  const connection = await db.pool.getConnection();
  const counters = {
    teams: 0,
    matches: 0,
    players: 0,
  };

  let leagueId = 0;
  let season = new Date().getFullYear();

  try {
    await connection.beginTransaction();

    console.log('Scarico dati da football-data.org...');

    const teamsPayload = await fetchCompetitionTeams();
    const matches = await fetchMatches();
    const scorers = await fetchScorers();

    leagueId = teamsPayload.competition?.id || matches[0]?.competition?.id || 0;
    season = seasonFromSeasonObject(teamsPayload.season || matches[0]?.season);

    const teamSync = await upsertTeams(connection, teamsPayload);
    counters.teams = teamSync.imported;
    const teamMap = await getTeamMap(connection, teamSync.byApiId);
    counters.matches = await upsertMatches(connection, matches, teamMap);
    counters.players = await upsertPlayers(connection, scorers, teamMap);

    await connection.commit();

    await writeSyncLog({
      leagueId,
      season,
      status: 'success',
      teams: counters.teams,
      matches: counters.matches,
      players: counters.players,
      message: `Sync completata per ${teamsPayload.competition?.name || COMPETITION}`,
    });

    console.log('Sync completata con successo.');
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Rollback fallito:', rollbackError.message);
    }

    await writeSyncLog({
      leagueId,
      season,
      status: 'error',
      teams: counters.teams,
      matches: counters.matches,
      players: counters.players,
      message: error.message,
    });

    console.error('Errore durante la sync:', error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
  }
}

syncData().catch((error) => {
  console.error('Errore fatale durante la sync:', error.message);
  process.exitCode = 1;
});
