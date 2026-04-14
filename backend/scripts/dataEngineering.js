const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const axios = require('axios');
const db = require('../db');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST =
  process.env.RAPIDAPI_HOST || 'free-api-live-football-data.p.rapidapi.com';
const RAPIDAPI_BASE_URL =
  process.env.RAPIDAPI_BASE_URL || 'https://free-api-live-football-data.p.rapidapi.com';
const SEASON = Number(
  process.env.FOOTBALL_SEASON ||
    (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1)
);
const TARGET_COUNTRY = 'Italy';
const TARGET_LEAGUES = ['Serie A', 'Serie B'];
const FALLBACK_LEAGUE_IDS = String(process.env.FOOTBALL_LEAGUE_IDS || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const ONLY_ITALIAN_PLAYERS =
  String(process.env.ONLY_ITALIAN_PLAYER_NATIONALITY || 'true').toLowerCase() !== 'false';
const REQUEST_DELAY_MS = Number(process.env.FOOTBALL_REQUEST_DELAY_MS || 200);

const TEAM_COLORS = [
  '#1a9e3f',
  '#2563eb',
  '#dc2626',
  '#7c3aed',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#0f766e',
  '#4f46e5',
  '#9333ea',
  '#ca8a04',
  '#16a34a',
];

const apiClient = axios.create({
  baseURL: RAPIDAPI_BASE_URL,
  headers: {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
  },
  timeout: 15000,
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function slugifyToolPath(toolName) {
  return `/football-${toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

function pickValue(source, paths) {
  for (const pathParts of paths) {
    let current = source;

    for (const part of pathParts) {
      if (current == null) {
        current = undefined;
        break;
      }

      current = current[part];
    }

    if (
      current !== undefined &&
      current !== null &&
      !(typeof current === 'string' && current.trim() === '')
    ) {
      return current;
    }
  }

  return undefined;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized =
    typeof value === 'string' ? value.replace(/[^0-9.-]/g, '') : value;
  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(' ', 'T');
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function toMysqlDate(value) {
  const iso = toIsoDate(value) || new Date().toISOString();
  return iso.slice(0, 19).replace('T', ' ');
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
  const parts = cleanName.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return { nome: cleanName || 'N/D', cognome: '' };
  }

  return {
    nome: parts.slice(0, -1).join(' '),
    cognome: parts.slice(-1).join(' '),
  };
}

function mapFixtureStatus(statusValue) {
  const status = normalizeText(statusValue);

  if (
    ['ft', 'finished', 'full time', 'final', 'ended', 'end'].includes(status)
  ) {
    return 'terminata';
  }

  if (
    ['live', 'in play', 'inplay', '1h', '2h', 'ht', 'ongoing', 'playing'].includes(status)
  ) {
    return 'in_corso';
  }

  if (
    ['postponed', 'cancelled', 'canceled', 'suspended', 'abandoned'].includes(status)
  ) {
    return 'rinviata';
  }

  return 'programmata';
}

function maybeParseJson(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return value;
  }
}

function collectRecords(node, acc = []) {
  const parsed = maybeParseJson(node);

  if (Array.isArray(parsed)) {
    if (parsed.every((item) => item && typeof item === 'object')) {
      acc.push(parsed);
    }

    parsed.forEach((item) => collectRecords(item, acc));
    return acc;
  }

  if (!parsed || typeof parsed !== 'object') {
    return acc;
  }

  const nestedKeys = [
    'response',
    'data',
    'result',
    'results',
    'items',
    'list',
    'records',
    'teams',
    'players',
    'matches',
    'events',
    'leagues',
    'standings',
    'table',
  ];

  for (const key of nestedKeys) {
    if (key in parsed) {
      collectRecords(parsed[key], acc);
    }
  }

  Object.values(parsed).forEach((value) => {
    if (value && typeof value === 'object') {
      collectRecords(value, acc);
    }
  });

  return acc;
}

function unwrapResponseData(payload) {
  const arrays = collectRecords(payload);
  const best = arrays.sort((left, right) => right.length - left.length)[0];
  if (best) {
    return best;
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return [payload];
  }

  return [];
}

async function requestCandidate(label, candidates) {
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const response = await apiClient.get(candidate.path, { params: candidate.params });
      const records = unwrapResponseData(response.data);

      if (records.length > 0) {
        return { records, path: candidate.path };
      }

      lastError = new Error(`Risposta vuota da ${candidate.path}`);
    } catch (error) {
      lastError = error;
    }

    await wait(REQUEST_DELAY_MS);
  }

  throw lastError || new Error(`Nessun endpoint valido per ${label}`);
}

function normalizeLeague(rawLeague) {
  return {
    id: toNumber(
      pickValue(rawLeague, [
        ['id'],
        ['leagueid'],
        ['league_id'],
        ['leagueId'],
        ['league', 'id'],
      ])
    ),
    nome: pickValue(rawLeague, [
      ['nome'],
      ['league_name'],
      ['name'],
      ['leagueName'],
      ['league', 'name'],
    ]),
    paese: pickValue(rawLeague, [
      ['paese'],
      ['country_name'],
      ['country'],
      ['countryName'],
      ['league_country'],
      ['league', 'country'],
    ]),
  };
}

function normalizeTeam(rawTeam, leagueName, leagueId) {
  return {
    api_team_id: toNumber(
      pickValue(rawTeam, [
        ['teamid'],
        ['team_id'],
        ['teamId'],
        ['id'],
        ['team', 'id'],
      ])
    ),
    nome: pickValue(rawTeam, [
      ['team_name'],
      ['name'],
      ['team', 'name'],
      ['club_name'],
    ]),
    paese: pickValue(rawTeam, [
      ['country_name'],
      ['country'],
      ['team_country'],
      ['countryName'],
      ['team', 'country'],
    ]) || TARGET_COUNTRY,
    citta: pickValue(rawTeam, [
      ['city'],
      ['venue_city'],
      ['stadium_city'],
      ['location'],
    ]),
    anno_fondazione: toNumber(
      pickValue(rawTeam, [['founded'], ['team_founded'], ['foundation_year']])
    ),
    stadio: pickValue(rawTeam, [
      ['stadium_name'],
      ['venue_name'],
      ['stadium'],
      ['venue'],
      ['ground_name'],
    ]),
    logo_url: pickValue(rawTeam, [
      ['team_logo'],
      ['logo'],
      ['team_badge'],
      ['badge'],
      ['image'],
      ['team', 'logo'],
    ]),
    campionato: leagueName,
    league_id: leagueId,
  };
}

function normalizeFixture(rawFixture, league) {
  const eventId = toNumber(
    pickValue(rawFixture, [
      ['eventid'],
      ['event_id'],
      ['matchid'],
      ['match_id'],
      ['fixtureid'],
      ['fixture_id'],
      ['id'],
      ['event', 'id'],
    ])
  );

  const homeApiTeamId = toNumber(
    pickValue(rawFixture, [
      ['home_team_id'],
      ['hometeamid'],
      ['team_home_id'],
      ['home', 'id'],
      ['home_team', 'id'],
    ])
  );
  const awayApiTeamId = toNumber(
    pickValue(rawFixture, [
      ['away_team_id'],
      ['awayteamid'],
      ['team_away_id'],
      ['away', 'id'],
      ['away_team', 'id'],
    ])
  );

  return {
    api_fixture_id: eventId,
    league_id: league.id,
    stagione: SEASON,
    data_ora:
      toIsoDate(
        pickValue(rawFixture, [
          ['event_date'],
          ['match_date'],
          ['date'],
          ['kickoff'],
          ['kick_off'],
          ['start_time'],
          ['event', 'date'],
        ])
      ) ||
      toIsoDate(
        `${pickValue(rawFixture, [['match_day'], ['date']]) || ''} ${
          pickValue(rawFixture, [['match_time'], ['time']]) || ''
        }`
      ) ||
      new Date().toISOString(),
    venue: pickValue(rawFixture, [
      ['venue_name'],
      ['stadium_name'],
      ['location'],
      ['venue'],
      ['stadium'],
    ]),
    round_name: pickValue(rawFixture, [
      ['round'],
      ['round_name'],
      ['stage_name'],
      ['week'],
      ['event_round'],
    ]),
    gol_casa: toNumber(
      pickValue(rawFixture, [
        ['home_score'],
        ['score_home'],
        ['goals_home'],
        ['home', 'score'],
        ['scores', 'home'],
      ])
    ),
    gol_trasferta: toNumber(
      pickValue(rawFixture, [
        ['away_score'],
        ['score_away'],
        ['goals_away'],
        ['away', 'score'],
        ['scores', 'away'],
      ])
    ),
    stato: mapFixtureStatus(
      pickValue(rawFixture, [
        ['status'],
        ['match_status'],
        ['event_status'],
        ['state'],
        ['event', 'status'],
      ])
    ),
    home_api_team_id: homeApiTeamId,
    away_api_team_id: awayApiTeamId,
  };
}

function normalizePlayer(rawPlayer, localTeamId) {
  const nationality =
    pickValue(rawPlayer, [
      ['nationality'],
      ['player_country'],
      ['country_name'],
      ['country'],
      ['citizenship'],
      ['player', 'country'],
    ]) || null;

  const displayName = pickValue(rawPlayer, [
    ['player_name'],
    ['name'],
    ['player', 'name'],
    ['full_name'],
  ]);
  const nameParts = splitPlayerName(displayName);

  return {
    api_player_id: toNumber(
      pickValue(rawPlayer, [
        ['playerid'],
        ['player_id'],
        ['playerId'],
        ['id'],
        ['player', 'id'],
      ])
    ),
    nome: nameParts.nome,
    cognome: nameParts.cognome,
    ruolo:
      pickValue(rawPlayer, [
        ['position'],
        ['position_name'],
        ['role'],
        ['player_position'],
        ['player', 'position'],
      ]) || 'attaccante',
    eta: toNumber(
      pickValue(rawPlayer, [['age'], ['player_age'], ['player', 'age']])
    ),
    nazionalita: nationality,
    numero_maglia: toNumber(
      pickValue(rawPlayer, [
        ['shirt_number'],
        ['number'],
        ['player_number'],
        ['squad_number'],
      ])
    ),
    gol_fatti: 0,
    assist: 0,
    foto_url: pickValue(rawPlayer, [
      ['player_image'],
      ['photo'],
      ['image'],
      ['player_photo'],
      ['player', 'image'],
    ]),
    id_squadra: localTeamId,
  };
}

function isTargetLeague(rawLeague) {
  const league = normalizeLeague(rawLeague);
  const leagueName = normalizeText(league.nome);
  const countryName = normalizeText(league.paese);

  return (
    league.id &&
    TARGET_LEAGUES.some((target) => normalizeText(target) === leagueName) &&
    (!countryName || countryName.includes(normalizeText(TARGET_COUNTRY)))
  );
}

function isItalianPlayer(player) {
  if (!ONLY_ITALIAN_PLAYERS) {
    return true;
  }

  const nationality = normalizeText(player.nazionalita);
  return ['italy', 'italian', 'italia'].includes(nationality);
}

async function fetchTargetLeagues() {
  console.log('Ricerca leghe italiane Serie A e Serie B...');

  try {
    const { records, path: usedPath } = await requestCandidate('leghe', [
      { path: slugifyToolPath('get leagues list all with countries'), params: {} },
      { path: slugifyToolPath('get leagues list all'), params: {} },
      {
        path: slugifyToolPath('get search leagues'),
        params: { query: TARGET_COUNTRY },
      },
      {
        path: slugifyToolPath('get search leagues'),
        params: { search: TARGET_COUNTRY },
      },
    ]);

    const leagues = records.map(normalizeLeague).filter((league) =>
      isTargetLeague(league)
    );

    if (leagues.length > 0) {
      console.log(`Leghe trovate tramite ${usedPath}: ${leagues.map((league) => league.nome).join(', ')}`);
      return leagues;
    }
  } catch (error) {
    console.warn('Ricerca automatica leghe fallita:', error.message);
  }

  if (FALLBACK_LEAGUE_IDS.length > 0) {
    return FALLBACK_LEAGUE_IDS.map((id, index) => ({
      id,
      nome: TARGET_LEAGUES[index] || `League ${id}`,
      paese: TARGET_COUNTRY,
    }));
  }

  throw new Error(
    'Impossibile trovare Serie A e Serie B. Imposta FOOTBALL_LEAGUE_IDS con gli ID del provider.'
  );
}

async function fetchLeagueTeams(league) {
  console.log(`Recupero squadre per ${league.nome} (${league.id})...`);

  const { records } = await requestCandidate(`squadre ${league.nome}`, [
    {
      path: slugifyToolPath('get teams all list by league id'),
      params: { leagueid: league.id },
    },
    {
      path: slugifyToolPath('get teams home list by league id'),
      params: { leagueid: league.id },
    },
    {
      path: slugifyToolPath('get teams away list by league id'),
      params: { leagueid: league.id },
    },
    {
      path: slugifyToolPath('get standing all by league id'),
      params: { leagueid: league.id },
    },
  ]);

  const teams = records
    .map((record) => normalizeTeam(record, league.nome, league.id))
    .filter((team) => team.api_team_id && team.nome)
    .filter((team) => normalizeText(team.paese || TARGET_COUNTRY).includes('italy'));

  const dedupedTeams = new Map();
  teams.forEach((team) => {
    if (!dedupedTeams.has(team.api_team_id)) {
      dedupedTeams.set(team.api_team_id, team);
    }
  });

  return [...dedupedTeams.values()];
}

async function fetchLeagueFixtures(league) {
  console.log(`Recupero partite per ${league.nome} (${league.id})...`);

  const { records } = await requestCandidate(`partite ${league.nome}`, [
    {
      path: slugifyToolPath('get all matches events by league id'),
      params: { leagueid: league.id },
    },
    {
      path: slugifyToolPath('get search matches'),
      params: { leagueid: league.id },
    },
  ]);

  return records
    .map((record) => normalizeFixture(record, league))
    .filter(
      (fixture) =>
        fixture.api_fixture_id &&
        fixture.home_api_team_id &&
        fixture.away_api_team_id &&
        fixture.home_api_team_id !== fixture.away_api_team_id
    );
}

async function fetchLeagueTopPlayers(league, type) {
  const toolName =
    type === 'assists' ? 'get top players by assists' : 'get top players by goals';

  try {
    const { records } = await requestCandidate(`${type} ${league.nome}`, [
      { path: slugifyToolPath(toolName), params: { leagueid: league.id } },
    ]);

    const index = new Map();

    records.forEach((record) => {
      const playerId = toNumber(
        pickValue(record, [['playerid'], ['player_id'], ['id'], ['player', 'id']])
      );
      const playerName = normalizeText(
        pickValue(record, [['player_name'], ['name'], ['player', 'name']])
      );
      const value = toNumber(
        pickValue(record, [
          ['goals'],
          ['goal'],
          ['total_goals'],
          ['assists'],
          ['total_assists'],
          ['stat'],
          ['value'],
        ])
      );

      if (!playerId && !playerName) {
        return;
      }

      index.set(playerId || playerName, value || 0);
    });

    return index;
  } catch (_error) {
    return new Map();
  }
}

async function fetchTeamPlayers(team, statIndexes) {
  console.log(`Recupero giocatori per ${team.nome}...`);

  let records = [];

  try {
    const response = await requestCandidate(`giocatori ${team.nome}`, [
      {
        path: slugifyToolPath('get players list all by team id'),
        params: { teamid: team.api_team_id },
      },
      {
        path: slugifyToolPath('get team detail by team id'),
        params: { teamid: team.api_team_id },
      },
    ]);
    records = response.records;
  } catch (error) {
    console.warn(`Giocatori non disponibili per ${team.nome}: ${error.message}`);
    return [];
  }

  const players = records
    .map((record) => normalizePlayer(record, team.id_squadra))
    .filter((player) => player.api_player_id && player.nome)
    .filter(isItalianPlayer);

  const dedupedPlayers = new Map();

  players.forEach((player) => {
    const key = player.api_player_id;
    const goals =
      statIndexes.goals.get(player.api_player_id) ||
      statIndexes.goals.get(normalizeText(`${player.nome} ${player.cognome}`));
    const assists =
      statIndexes.assists.get(player.api_player_id) ||
      statIndexes.assists.get(normalizeText(`${player.nome} ${player.cognome}`));

    player.gol_fatti = goals || 0;
    player.assist = assists || 0;

    if (!dedupedPlayers.has(key)) {
      dedupedPlayers.set(key, player);
    }
  });

  return [...dedupedPlayers.values()];
}

async function upsertTeam(connection, team, index) {
  const paletteIndex = Math.abs((team.api_team_id || index) % TEAM_COLORS.length);

  await connection.query(
    `
      INSERT INTO squadre (
        api_team_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nome = VALUES(nome),
        citta = VALUES(citta),
        anno_fondazione = VALUES(anno_fondazione),
        stadio = VALUES(stadio),
        logo_url = VALUES(logo_url),
        logo_sigla = VALUES(logo_sigla),
        colore = VALUES(colore),
        campionato = VALUES(campionato),
        paese = VALUES(paese)
    `,
    [
      team.api_team_id,
      team.nome,
      team.citta || null,
      team.anno_fondazione || null,
      team.stadio || null,
      team.logo_url || null,
      makeShortCode(team.nome),
      TEAM_COLORS[paletteIndex],
      team.campionato,
      team.paese || TARGET_COUNTRY,
    ]
  );
}

async function mapLocalTeams(connection, apiTeamIds) {
  if (apiTeamIds.length === 0) {
    return new Map();
  }

  const placeholders = apiTeamIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_squadra, api_team_id FROM squadre WHERE api_team_id IN (${placeholders})`,
    apiTeamIds
  );

  return new Map(rows.map((row) => [row.api_team_id, row.id_squadra]));
}

async function cleanupNonItalianScope(connection, localTeamIds) {
  const placeholders = localTeamIds.map(() => '?').join(', ');

  await connection.query(
    `DELETE FROM giocatori WHERE id_squadra NOT IN (${placeholders})`,
    localTeamIds
  );
  await connection.query(
    `DELETE FROM partite
     WHERE id_squadra_casa NOT IN (${placeholders})
        OR id_squadra_trasferta NOT IN (${placeholders})`,
    [...localTeamIds, ...localTeamIds]
  );
  await connection.query(
    `DELETE FROM squadre WHERE id_squadra NOT IN (${placeholders})`,
    localTeamIds
  );
}

async function replacePlayers(connection, players, allTeamIds) {
  const targetTeamIds = [...new Set(allTeamIds)];

  if (targetTeamIds.length > 0) {
    const placeholders = targetTeamIds.map(() => '?').join(', ');
    await connection.query(
      `DELETE FROM giocatori WHERE id_squadra IN (${placeholders})`,
      targetTeamIds
    );
  }

  let inserted = 0;

  for (const player of players) {
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
          eta = VALUES(eta),
          nazionalita = VALUES(nazionalita),
          numero_maglia = VALUES(numero_maglia),
          gol_fatti = VALUES(gol_fatti),
          assist = VALUES(assist),
          foto_url = VALUES(foto_url),
          id_squadra = VALUES(id_squadra)
      `,
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
        player.id_squadra,
      ]
    );
    inserted += 1;
  }

  return inserted;
}

async function replaceFixtures(connection, fixtures, teamMap) {
  let inserted = 0;

  for (const fixture of fixtures) {
    const homeTeamId = teamMap.get(fixture.home_api_team_id);
    const awayTeamId = teamMap.get(fixture.away_api_team_id);

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
          venue = VALUES(venue),
          round_name = VALUES(round_name),
          gol_casa = VALUES(gol_casa),
          gol_trasferta = VALUES(gol_trasferta),
          stato = VALUES(stato),
          id_squadra_casa = VALUES(id_squadra_casa),
          id_squadra_trasferta = VALUES(id_squadra_trasferta)
      `,
      [
        fixture.api_fixture_id,
        fixture.league_id,
        fixture.stagione,
        toMysqlDate(fixture.data_ora),
        fixture.venue || null,
        fixture.round_name || null,
        fixture.gol_casa,
        fixture.gol_trasferta,
        fixture.stato,
        homeTeamId,
        awayTeamId,
      ]
    );
    inserted += 1;
  }

  return inserted;
}

async function writeSyncLog(connection, stato, messaggio, counters) {
  await connection.query(
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
      RAPIDAPI_HOST,
      0,
      SEASON,
      stato,
      counters.teams || 0,
      counters.fixtures || 0,
      counters.players || 0,
      messaggio || null,
    ]
  );
}

async function syncLeagueData() {
  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your_rapidapi_key_here') {
    throw new Error('RAPIDAPI_KEY non configurata nel file .env');
  }

  await db.ensureSchema();

  const leagues = await fetchTargetLeagues();
  if (leagues.length === 0) {
    throw new Error('Nessuna lega italiana target trovata');
  }

  const allTeams = [];
  const allFixtures = [];
  const allPlayers = [];

  for (const league of leagues) {
    const teams = await fetchLeagueTeams(league);
    allTeams.push(...teams);
    await wait(REQUEST_DELAY_MS);

    const fixtures = await fetchLeagueFixtures(league);
    allFixtures.push(...fixtures);
    await wait(REQUEST_DELAY_MS);
  }

  const dedupedTeams = [...new Map(allTeams.map((team) => [team.api_team_id, team])).values()];

  if (dedupedTeams.length === 0) {
    throw new Error('Nessuna squadra italiana trovata per Serie A e Serie B');
  }

  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const [index, team] of dedupedTeams.entries()) {
      await upsertTeam(connection, team, index);
    }

    const teamMap = await mapLocalTeams(
      connection,
      dedupedTeams.map((team) => team.api_team_id)
    );

    const teamsWithLocalIds = dedupedTeams
      .map((team) => ({ ...team, id_squadra: teamMap.get(team.api_team_id) }))
      .filter((team) => team.id_squadra);

    if (teamsWithLocalIds.length === 0) {
      throw new Error('Nessuna squadra mappata nel database dopo l import');
    }

    await cleanupNonItalianScope(
      connection,
      teamsWithLocalIds.map((team) => team.id_squadra)
    );

    const importedFixtures = await replaceFixtures(connection, allFixtures, teamMap);

    for (const league of leagues) {
      const statIndexes = {
        goals: await fetchLeagueTopPlayers(league, 'goals'),
        assists: await fetchLeagueTopPlayers(league, 'assists'),
      };

      for (const team of teamsWithLocalIds.filter((entry) => entry.league_id === league.id)) {
        const players = await fetchTeamPlayers(team, statIndexes);
        allPlayers.push(...players);
        await wait(REQUEST_DELAY_MS);
      }
    }

    const importedPlayers = await replacePlayers(
      connection,
      allPlayers,
      teamsWithLocalIds.map((team) => team.id_squadra)
    );

    const counters = {
      teams: teamsWithLocalIds.length,
      fixtures: importedFixtures,
      players: importedPlayers,
    };

    await writeSyncLog(
      connection,
      'success',
      `Sync completata per ${TARGET_COUNTRY}: ${leagues.map((league) => league.nome).join(', ')}`,
      counters
    );
    await connection.commit();

    return counters;
  } catch (error) {
    await connection.rollback();
    try {
      await writeSyncLog(connection, 'error', error.message, {});
    } catch (_secondaryError) {
      // Ignore secondary log failures.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  console.log('Avvio pipeline Data Engineering');
  console.log(`Provider: ${RAPIDAPI_HOST}`);
  console.log(`Country: ${TARGET_COUNTRY}`);
  console.log(`Leagues: ${TARGET_LEAGUES.join(', ')}`);
  console.log(`Season reference: ${SEASON}`);

  try {
    const counters = await syncLeagueData();
    console.log(
      `Sync completata: ${counters.teams} squadre, ${counters.fixtures} partite, ${counters.players} giocatori`
    );
    process.exit(0);
  } catch (error) {
    const apiMessage = error.response?.data?.message;
    console.error('Sync fallita:', apiMessage || error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  syncLeagueData,
};
