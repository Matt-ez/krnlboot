require('dotenv').config();
const express = require('express');
const cors = require('cors');

const db = require('./db');
const authRoutes = require('./routes/auth');
const teamsRoutes = require('./routes/teams');
const matchesRoutes = require('./routes/matches');
const predictionsRoutes = require('./routes/predictions');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = Number(process.env.PORT || 3006);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', async (_req, res, next) => {
  try {
    await db.ensureSchema();
    res.json({ ok: true, database: 'ready' });
  } catch (error) {
    next(error);
  }
});

app.use('/', authRoutes);
app.use('/teams', teamsRoutes);
app.use('/matches', matchesRoutes);
app.use('/predictions', predictionsRoutes);
app.use('/dashboard', dashboardRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Endpoint non trovato: ${req.path}` });
});

app.use((err, _req, res, _next) => {
  console.error('Errore non gestito:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

async function startServer() {
  await db.ensureSchema();

  app.listen(PORT, () => {
    console.log(`Sport Analytics Backend avviato su http://localhost:${PORT}`);
    console.log('Endpoint disponibili:');
    console.log('POST /register | POST /login');
    console.log('GET  /teams    | GET /teams/:id');
    console.log('GET  /matches');
    console.log('GET  /predictions | GET /predictions/:id_casa/:id_trasferta');
    console.log('GET  /dashboard | GET /health');
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Impossibile avviare il server:', error.message);
    process.exit(1);
  });
}

module.exports = app;
