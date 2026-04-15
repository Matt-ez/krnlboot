const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /matches - Tutte le partite (live, future, passate)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [partite] = await db.query(
      `SELECT p.*,
              s1.nome AS nome_casa, s1.logo_sigla AS logo_casa, s1.logo_url AS logo_casa_url, s1.colore AS colore_casa,
              s2.nome AS nome_trasferta, s2.logo_sigla AS logo_trasferta, s2.logo_url AS logo_trasferta_url, s2.colore AS colore_trasferta
       FROM partite p
       JOIN squadre s1 ON p.id_squadra_casa = s1.id_squadra
       JOIN squadre s2 ON p.id_squadra_trasferta = s2.id_squadra
       ORDER BY p.data_ora DESC`
    );

    const inCorso    = partite.filter(p => p.stato === 'in_corso');
    const future     = partite.filter(p => p.stato === 'programmata').reverse();
    const terminate  = partite.filter(p => p.stato === 'terminata');

    res.json({ inCorso, future, terminate });
  } catch (err) {
    console.error('Errore GET /matches:', err);
    res.status(500).json({ error: 'Errore nel recupero delle partite' });
  }
});

module.exports = router;
