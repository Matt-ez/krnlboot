require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes        = require('./routes/auth');
const teamsRoutes       = require('./routes/teams');
const matchesRoutes     = require('./routes/matches');
const predictionsRoutes = require('./routes/predictions');
const dashboardRoutes   = require('./routes/dashboard');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging semplice
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────
app.use('/register',    authRoutes);
app.use('/login',       authRoutes);
app.use('/teams',       teamsRoutes);
app.use('/matches',     matchesRoutes);
app.use('/predictions', predictionsRoutes);
app.use('/dashboard',   dashboardRoutes);


// ── Gestione errori ─────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Endpoint non trovato: ${req.path}` }));

app.use((err, _req, res, _next) => {
  console.error('Errore non gestito:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ── Avvio ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Sport Analytics Backend avviato su http://localhost:${PORT}`);
  console.log(`   Endpoint disponibili:`);
  console.log(`   POST /register | POST /login`);
  console.log(`   GET  /teams    | GET /teams/:id`);
  console.log(`   GET  /matches`);
  console.log(`   GET  /predictions/:id_casa/:id_trasferta`);
  console.log(`   GET  /dashboard\n`);
});

module.exports = app;
