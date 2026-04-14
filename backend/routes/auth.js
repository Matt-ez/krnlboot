const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /register - Registrazione nuovo utente
router.post('/register', async (req, res) => {
  const { nome, cognome, email, password, ruolo, id_squadra_preferita } = req.body;

  if (!nome || !cognome || !email || !password || !ruolo) {
    return res.status(400).json({ error: 'Tutti i campi obbligatori devono essere compilati' });
  }

  const ruoliValidi = ['tifoso', 'allenatore', 'analista'];
  if (!ruoliValidi.includes(ruolo)) {
    return res.status(400).json({ error: 'Ruolo non valido' });
  }

  try {
    // Verifica se email già esistente
    const [existing] = await db.query('SELECT id_utente FROM utenti WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email già registrata' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const squadraId = id_squadra_preferita || null;

    const [result] = await db.query(
      'INSERT INTO utenti (nome, cognome, email, password_hash, ruolo, id_squadra_preferita) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, cognome, email, password_hash, ruolo, squadraId]
    );

    const token = jwt.sign(
      { id_utente: result.insertId, email, ruolo, nome, cognome },
      process.env.JWT_SECRET || 'sport_analytics_secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Registrazione avvenuta con successo',
      token,
      user: { id_utente: result.insertId, nome, cognome, email, ruolo }
    });
  } catch (err) {
    console.error('Errore registrazione:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// POST /login - Accesso utente
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password sono obbligatori' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM utenti WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const utente = rows[0];
    const passwordValida = await bcrypt.compare(password, utente.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const token = jwt.sign(
      { id_utente: utente.id_utente, email: utente.email, ruolo: utente.ruolo, nome: utente.nome, cognome: utente.cognome },
      process.env.JWT_SECRET || 'sport_analytics_secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login effettuato con successo',
      token,
      user: {
        id_utente: utente.id_utente,
        nome: utente.nome,
        cognome: utente.cognome,
        email: utente.email,
        ruolo: utente.ruolo,
        id_squadra_preferita: utente.id_squadra_preferita
      }
    });
  } catch (err) {
    console.error('Errore login:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
