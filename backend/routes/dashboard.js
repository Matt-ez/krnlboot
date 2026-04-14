const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /dashboard - statistiche generali per la dashboard
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Top marcatori (top 5)
    const [topMarcatori] = await db.query(
      `SELECT g.*, s.nome AS nome_squadra, s.colore, s.logo_sigla
       FROM giocatori g
       JOIN squadre s ON g.id_squadra = s.id_squadra
       ORDER BY g.gol_fatti DESC
       LIMIT 5`
    );

    // Partite di oggi / recenti
    const [partiteRecenti] = await db.query(
      `SELECT p.*,
              s1.nome AS nome_casa, s1.logo_sigla AS logo_casa, s1.colore AS colore_casa,
              s2.nome AS nome_trasferta, s2.logo_sigla AS logo_trasferta, s2.colore AS colore_trasferta
       FROM partite p
       JOIN squadre s1 ON p.id_squadra_casa = s1.id_squadra
       JOIN squadre s2 ON p.id_squadra_trasferta = s2.id_squadra
       WHERE p.stato IN ('terminata','in_corso')
       ORDER BY p.data_ora DESC
       LIMIT 6`
    );

    // Conteggi generali
    const [[{ tot_partite }]] = await db.query("SELECT COUNT(*) AS tot_partite FROM partite WHERE stato='terminata'");
    const [[{ tot_squadre }]] = await db.query('SELECT COUNT(*) AS tot_squadre FROM squadre');
    const [[{ tot_giocatori }]] = await db.query('SELECT COUNT(*) AS tot_giocatori FROM giocatori');

    res.json({
      topMarcatori,
      partiteRecenti,
      totPartite: tot_partite,
      totSquadre: tot_squadre,
      totGiocatori: tot_giocatori,
      predizioni_corrette: 76
    });
  } catch (err) {
    console.error('Errore GET /dashboard:', err);
    res.status(500).json({ error: 'Errore nel recupero dati dashboard' });
  }
});

module.exports = router;
