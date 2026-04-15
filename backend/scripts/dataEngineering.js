
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const axios = require('axios');
const db    = require('../db');

// ─── Configurazione ────────────────────────────────────────────────────────────

const API_KEY  = process.env.FOOTBALL_DATA_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

// Competizioni target (codici football-data.org)
// Piano gratuito: SA (Serie A), PL, BL1, PD, FL1, CL, EC, WC
const TARGET_COMPETITIONS = [
  { code: 'SA', name: 'Serie A', id: 2019, countryCode: 'ITA' },
];

const SEASON = Number(
  process.env.FOOTBALL_SEASON ||
    (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1)
);

// Il free tier consente ~10 req/min → delay minimo 700ms per stare sotto al limite
const REQUEST_DELAY_MS     = Number(process.env.FOOTBALL_REQUEST_DELAY_MS     || 700);
const MATCH_LOOKBACK_DAYS  = Number(process.env.FOOTBALL_MATCH_LOOKBACK_DAYS  || 60);
const MATCH_LOOKAHEAD_DAYS = Number(process.env.FOOTBALL_MATCH_LOOKAHEAD_DAYS || 14);
const TOP_SCORERS_LIMIT    = Number(process.env.FOOTBALL_TOP_SCORERS_LIMIT    || 20);

const TEAM_COLORS = [
  '#1a9e3f', '#2563eb', '#dc2626', '#7c3aed', '#ea580c',
  '#0891b2', '#be123c', '#0f766e', '#4f46e5', '#9333ea',
  '#ca8a04', '#16a34a', '#b45309', '#0e7490', '#7e22ce',
  '#15803d', '#b91c1c', '#1d4ed8', '#6d28d9', '#c2410c',
];

// ─── Client HTTP ───────────────────────────────────────────────────────────────

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Auth-Token': API_KEY,
    'Accept':       'application/json',
  },
  timeout: 20000,
});

// ─── Utilità generali ──────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMysqlDate(value) {
  const date     = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toISOString().slice(0, 19).replace('T', ' ');
}

function makeShortCode(teamName) {
  const words = String(teamName || '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}${words[1].slice(1, 2)}`.toUpperCase().slice(0, 3);
  }

  return String(teamName || 'N/D')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3) || 'N/D';
}

function splitPlayerName(fullName) {
  const cleanName = String(fullName || '').trim();
  const parts     = cleanName.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return { nome: cleanName || 'N/D', cognome: '' };
  }

  return {
    nome:    parts.slice(0, -1).join(' '),
    cognome: parts.slice(-1).join(' '),
  };
}

/**
 * Mappa lo stato partita da football-data.org al nostro ENUM
 * FDO status: SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED,
 *             SUSPENDED, POSTPONED, CANCELLED, AWARDED
 */
function mapStatus(fdoStatus) {
  const s = String(fdoStatus || '').toUpperCase();

  if (['FINISHED', 'AWARDED'].includes(s))                  return 'terminata';
  if (['IN_PLAY', 'PAUSED'].includes(s))                    return 'in_corso';
  if (['SUSPENDED', 'POSTPONED', 'CANCELLED'].includes(s))  return 'rinviata';

  return 'programmata'; // SCHEDULED, TIMED
}

/** Mappa la posizione football-data.org al nostro vocabolario */
function mapPosition(pos) {
  const map = {
    Goalkeeper: 'portiere',
    Defence:    'difensore',
    Midfield:   'centrocampista',
    Offence:    'attaccante',
    Forward:    'attaccante',
  };
  return map[pos] || 'attaccante';
}

// ─── Fetch con retry automatico su 429 ────────────────────────────────────────

async function fetchEndpoint(urlPath, params = {}, attempt = 1) {
  try {
    const response = await apiClient.get(urlPath, { params });
    return response.data;
  } catch (err) {
    const status = err.response?.status;

    if (status === 429 && attempt <= 3) {
      const retryAfter = Number(err.response?.headers?.['retry-after'] || 70);
      console.warn(`  ⏳ Rate limit 429 – attendo ${retryAfter}s (tentativo ${attempt}/3)...`);
      await wait(retryAfter * 1000);
      return fetchEndpoint(urlPath, params, attempt + 1);
    }

    throw err;
  }
}

// ─── Raccolta dati: Squadre ────────────────────────────────────────────────────

/**
 * GET /v4/competitions/{code}/standings
 * Risposta: { standings: [ { table: [ { team: {id, name, shortName, tla, crest}, ... } ] } ] }
 */
async function fetchStandings(competition) {
  console.log(`  📡 Standings ${competition.code} stagione ${SEASON}...`);
  const data = await fetchEndpoint(`/competitions/${competition.code}/standings`, {
    season: SEASON,
  });
  await wait(REQUEST_DELAY_MS);

  const table = data?.standings?.[0]?.table || [];

  return table.map((row) => ({
    api_team_id:      row.team.id,
    nome:             row.team.name,
    tla:              row.team.tla  || null,
    crest_url:        row.team.crest || null,
    competition_code: competition.code,
    competition_name: competition.name,
    competition_id:   competition.id,
    // dettagli extra arricchiti in seguito con fetchTeamDetail
    citta:            null,
    anno_fondazione:  null,
    stadio:           null,
    paese:            null,
  }));
}

/**
 * GET /v4/teams/{id}
 * Arricchisce la squadra con stadio, città e anno fondazione.
 */
async function fetchTeamDetail(teamId) {
  try {
    const data = await fetchEndpoint(`/teams/${teamId}`);
    await wait(REQUEST_DELAY_MS);

    // L'indirizzo è una stringa libera tipo "Via X, Città, CAP"
    const addressParts = (data.address || '').split(',');
    const citta        = addressParts.length >= 2
      ? addressParts[addressParts.length - 2]?.trim() || null
      : null;

    return {
      citta:           citta,
      anno_fondazione: data.founded    || null,
      stadio:          data.venue      || null,
      paese:           data.area?.name || null,
    };
  } catch (err) {
    // Alcuni team non sono disponibili nel piano free → gestiamo silenziosamente
    console.warn(`  ⚠️  Dettaglio team ${teamId} non disponibile (${err.response?.status ?? err.message})`);
    await wait(REQUEST_DELAY_MS);
    return { citta: null, anno_fondazione: null, stadio: null, paese: null };
  }
}

// ─── Raccolta dati: Partite ────────────────────────────────────────────────────

/**
 * GET /v4/competitions/{code}/matches
 * Risposta: { matches: [ { id, utcDate, status, matchday, venue,
 *                          homeTeam: {id}, awayTeam: {id},
 *                          score: { fullTime: {home, away} } } ] }
 */
async function fetchMatches(competition) {
  const today    = new Date();
  const dateFrom = new Date(today);
  dateFrom.setDate(today.getDate() - MATCH_LOOKBACK_DAYS);
  const dateTo   = new Date(today);
  dateTo.setDate(today.getDate() + MATCH_LOOKAHEAD_DAYS);

  const fmt = (d) => d.toISOString().slice(0, 10);

  console.log(`  📡 Partite ${competition.code} dal ${fmt(dateFrom)} al ${fmt(dateTo)}...`);

  const data = await fetchEndpoint(`/competitions/${competition.code}/matches`, {
    season:   SEASON,
    dateFrom: fmt(dateFrom),
    dateTo:   fmt(dateTo),
  });
  await wait(REQUEST_DELAY_MS);

  return (data?.matches || []).map((m) => ({
    api_fixture_id:   m.id,
    league_id:        competition.id,
    stagione:         SEASON,
    data_ora:         m.utcDate,
    venue:            m.venue || null,
    round_name:       m.matchday ? `Giornata ${m.matchday}` : null,
    stato:            mapStatus(m.status),
    gol_casa:         m.score?.fullTime?.home  ?? null,
    gol_trasferta:    m.score?.fullTime?.away  ?? null,
    home_api_team_id: m.homeTeam.id,
    away_api_team_id: m.awayTeam.id,
  }));
}

// ─── Raccolta dati: Marcatori ──────────────────────────────────────────────────

/**
 * GET /v4/competitions/{code}/scorers?limit=N
 * Risposta: { scorers: [ { player: {id, name, position, nationality,
 *                                   dateOfBirth, shirtNumber},
 *                          team: {id}, goals, assists, penalties } ] }
 */
async function fetchScorers(competition) {
  console.log(`  📡 Top marcatori ${competition.code}...`);
  const data = await fetchEndpoint(`/competitions/${competition.code}/scorers`, {
    season: SEASON,
    limit:  TOP_SCORERS_LIMIT,
  });
  await wait(REQUEST_DELAY_MS);

  return (data?.scorers || []).map((s) => {
    const nameParts = splitPlayerName(s.player?.name || '');

    const eta = s.player?.dateOfBirth
      ? Math.floor((Date.now() - new Date(s.player.dateOfBirth)) / (365.25 * 24 * 3600 * 1000))
      : null;

    return {
      api_player_id: s.player?.id,
      nome:          nameParts.nome,
      cognome:       nameParts.cognome,
      ruolo:         mapPosition(s.player?.position),
      nazionalita:   s.player?.nationality  || null,
      eta:           eta,
      numero_maglia: s.player?.shirtNumber  || null,
      gol_fatti:     s.goals   || 0,
      assist:        s.assists || 0,
      foto_url:      null,
      api_team_id:   s.team?.id,
    };
  });
}

// ─── Orchestrazione ────────────────────────────────────────────────────────────

async function collectAll() {
  const allTeamsMap   = new Map();
  const allMatches    = [];
  const allPlayersMap = new Map();

  for (const competition of TARGET_COMPETITIONS) {
    console.log(`\n🏆 Elaborazione: ${competition.name} (${competition.code})`);

    // 1. Squadre dalla classifica
    const standingTeams = await fetchStandings(competition);

    // 2. Arricchimento con dettagli squadra
    console.log(`  🔍 Arricchimento ${standingTeams.length} squadre...`);
    for (const team of standingTeams) {
      const detail = await fetchTeamDetail(team.api_team_id);
      allTeamsMap.set(team.api_team_id, { ...team, ...detail });
    }

    // 3. Partite
    const matches = await fetchMatches(competition);
    allMatches.push(...matches);

    // 4. Top marcatori
    const players = await fetchScorers(competition);
    for (const p of players) {
      if (p.api_player_id) allPlayersMap.set(p.api_player_id, p);
    }
  }

  return {
    teams:   [...allTeamsMap.values()],
    matches: allMatches,
    players: [...allPlayersMap.values()],
  };
}

// ─── Scrittura DB ──────────────────────────────────────────────────────────────

async function upsertTeam(connection, team, index) {
  const paletteIndex = Math.abs((team.api_team_id || index) % TEAM_COLORS.length);
  const sigla        = team.tla || makeShortCode(team.nome);

  await connection.query(
    `INSERT INTO squadre (
        api_team_id, nome, citta, anno_fondazione, stadio,
        logo_url, logo_sigla, colore, campionato, paese
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        nome            = VALUES(nome),
        citta           = VALUES(citta),
        anno_fondazione = VALUES(anno_fondazione),
        stadio          = VALUES(stadio),
        logo_url        = VALUES(logo_url),
        logo_sigla      = VALUES(logo_sigla),
        campionato      = VALUES(campionato),
        paese           = VALUES(paese)`,
    [
      team.api_team_id,
      team.nome,
      team.citta,
      team.anno_fondazione,
      team.stadio,
      team.crest_url,
      sigla,
      TEAM_COLORS[paletteIndex],
      team.competition_name,
      team.paese || 'Italy',
    ]
  );
}

async function mapLocalTeams(connection, apiTeamIds) {
  if (apiTeamIds.length === 0) return new Map();

  const ph = apiTeamIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_squadra, api_team_id FROM squadre WHERE api_team_id IN (${ph})`,
    apiTeamIds
  );
  return new Map(rows.map((row) => [row.api_team_id, row.id_squadra]));
}

async function cleanupScope(connection, localTeamIds) {
  if (localTeamIds.length === 0) return;

  const ph = localTeamIds.map(() => '?').join(', ');

  await connection.query(
    `DELETE FROM giocatori WHERE id_squadra NOT IN (${ph})`,
    localTeamIds
  );
  await connection.query(
    `DELETE FROM partite
     WHERE id_squadra_casa NOT IN (${ph})
        OR id_squadra_trasferta NOT IN (${ph})`,
    [...localTeamIds, ...localTeamIds]
  );
}

async function replaceMatches(connection, matches, teamMap) {
  const leagueIds = [...new Set(matches.map((m) => m.league_id))];

  if (leagueIds.length > 0) {
    const ph = leagueIds.map(() => '?').join(', ');
    await connection.query(
      `DELETE FROM partite WHERE league_id IN (${ph}) AND stagione = ?`,
      [...leagueIds, SEASON]
    );
  }

  let inserted = 0;

  for (const match of matches) {
    const homeId = teamMap.get(match.home_api_team_id);
    const awayId = teamMap.get(match.away_api_team_id);

    if (!homeId || !awayId) continue;

    await connection.query(
      `INSERT INTO partite (
          api_fixture_id, league_id, stagione, data_ora, venue,
          round_name, gol_casa, gol_trasferta, stato,
          id_squadra_casa, id_squadra_trasferta
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          league_id            = VALUES(league_id),
          stagione             = VALUES(stagione),
          data_ora             = VALUES(data_ora),
          venue                = VALUES(venue),
          round_name           = VALUES(round_name),
          gol_casa             = VALUES(gol_casa),
          gol_trasferta        = VALUES(gol_trasferta),
          stato                = VALUES(stato),
          id_squadra_casa      = VALUES(id_squadra_casa),
          id_squadra_trasferta = VALUES(id_squadra_trasferta)`,
      [
        match.api_fixture_id,
        match.league_id,
        match.stagione,
        toMysqlDate(match.data_ora),
        match.venue,
        match.round_name,
        match.gol_casa,
        match.gol_trasferta,
        match.stato,
        homeId,
        awayId,
      ]
    );
    inserted++;
  }

  return inserted;
}

async function replacePlayers(connection, players, teamMap) {
  const localTeamIds = [...new Set([...teamMap.values()])];

  if (localTeamIds.length > 0) {
    const ph = localTeamIds.map(() => '?').join(', ');
    await connection.query(
      `DELETE FROM giocatori WHERE id_squadra IN (${ph})`,
      localTeamIds
    );
  }

  let inserted = 0;

  for (const player of players) {
    const localTeamId = teamMap.get(player.api_team_id);
    if (!localTeamId || !player.api_player_id) continue;

    await connection.query(
      `INSERT INTO giocatori (
          api_player_id, nome, cognome, ruolo, eta,
          nazionalita, numero_maglia, gol_fatti, assist,
          foto_url, id_squadra
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          nome          = VALUES(nome),
          cognome       = VALUES(cognome),
          ruolo         = VALUES(ruolo),
          eta           = VALUES(eta),
          nazionalita   = VALUES(nazionalita),
          numero_maglia = VALUES(numero_maglia),
          gol_fatti     = VALUES(gol_fatti),
          assist        = VALUES(assist),
          foto_url      = VALUES(foto_url),
          id_squadra    = VALUES(id_squadra)`,
      [
        player.api_player_id,
        player.nome,
        player.cognome,
        player.ruolo,
        player.eta,
        player.nazionalita,
        player.numero_maglia,
        player.gol_fatti,
        player.assist,
        player.foto_url,
        localTeamId,
      ]
    );
    inserted++;
  }

  return inserted;
}

async function writeSyncLog(connection, stato, messaggio, counters) {
  await connection.query(
    `INSERT INTO sync_log (
        sorgente, league_id, stagione, stato,
        squadre_importate, partite_importate, giocatori_importati, messaggio
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'football-data.org',
      TARGET_COMPETITIONS[0]?.id || 0,
      SEASON,
      stato,
      counters.teams    || 0,
      counters.fixtures || 0,
      counters.players  || 0,
      messaggio,
    ]
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function syncLeagueData() {
  if (!API_KEY || API_KEY === 'your_football_data_api_key_here') {
    throw new Error('FOOTBALL_DATA_API_KEY non configurata nel file .env');
  }

  await db.ensureSchema();

  const { teams, matches, players } = await collectAll();

  console.log(`\n📊 Raccolti: ${teams.length} squadre, ${matches.length} partite, ${players.length} giocatori`);
  console.log('💾 Scrittura sul database...');

  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const [i, team] of teams.entries()) {
      await upsertTeam(connection, team, i);
    }

    const teamMap = await mapLocalTeams(connection, teams.map((t) => t.api_team_id));
    const localTeamIds = [...teamMap.values()];

    await cleanupScope(connection, localTeamIds);

    const importedFixtures = await replaceMatches(connection, matches, teamMap);
    const importedPlayers  = await replacePlayers(connection, players, teamMap);

    const counters = { teams: teams.length, fixtures: importedFixtures, players: importedPlayers };

    await writeSyncLog(
      connection,
      'success',
      `Sync da football-data.org: ${TARGET_COMPETITIONS.map((c) => c.name).join(', ')}`,
      counters
    );

    await connection.commit();
    return counters;

  } catch (error) {
    await connection.rollback();
    try { await writeSyncLog(connection, 'error', error.message, {}); } catch (_) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Sport Analytics – Data Engineering Pipeline        ║');
  console.log('║   Sorgente: football-data.org (API v4)               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Competizioni : ${TARGET_COMPETITIONS.map((c) => `${c.name} (${c.code})`).join(', ')}`);
  console.log(`Stagione     : ${SEASON}`);
  console.log(`Finestra     : -${MATCH_LOOKBACK_DAYS} / +${MATCH_LOOKAHEAD_DAYS} giorni`);
  console.log(`Delay req.   : ${REQUEST_DELAY_MS}ms`);
  console.log('');

  try {
    const counters = await syncLeagueData();
    console.log('');
    console.log('✅ Sync completata con successo!');
    console.log(`   Squadre importate  : ${counters.teams}`);
    console.log(`   Partite importate  : ${counters.fixtures}`);
    console.log(`   Giocatori importati: ${counters.players}`);
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Sync fallita:', error.response?.data?.message || error.message);
    if (error.response?.status === 403) {
      console.error('   → Verifica che FOOTBALL_DATA_API_KEY sia corretta e attiva.');
      console.error('   → Registrati su https://www.football-data.org/client/register');
    }
    if (error.response?.status === 400) {
      console.error('   → Stagione o codice competizione non validi per il tuo piano.');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { syncLeagueData };