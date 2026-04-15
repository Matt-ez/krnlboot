const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /teams - Lista squadre con classifica calcolata
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [squadre] = await db.query('SELECT * FROM squadre ORDER BY nome');

    // Calcola classifica per ogni squadra
    const squadreConClassifica = await Promise.all(
      squadre.map(async (squadra) => {
        const [partite] = await db.query(
          `SELECT * FROM partite 
           WHERE stato = 'terminata' 
           AND (id_squadra_casa = ? OR id_squadra_trasferta = ?)`,
          [squadra.id_squadra, squadra.id_squadra]
        );

        let vittorie = 0, pareggi = 0, sconfitte = 0, gol_fatti = 0, gol_subiti = 0;

        partite.forEach(p => {
          const isCasa = p.id_squadra_casa === squadra.id_squadra;
          const gF = isCasa ? p.gol_casa : p.gol_trasferta;
          const gS = isCasa ? p.gol_trasferta : p.gol_casa;
          gol_fatti += gF;
          gol_subiti += gS;
          if (gF > gS) vittorie++;
          else if (gF === gS) pareggi++;
          else sconfitte++;
        });

        const punti = vittorie * 3 + pareggi;
        const partite_giocate = vittorie + pareggi + sconfitte;

        return { ...squadra, punti, vittorie, pareggi, sconfitte, gol_fatti, gol_subiti, partite_giocate };
      })
    );

    // Ordina per punti (classifica)
    squadreConClassifica.sort((a, b) => {
      if (b.punti !== a.punti) return b.punti - a.punti;
      return (b.gol_fatti - b.gol_subiti) - (a.gol_fatti - a.gol_subiti);
    });

    res.json(squadreConClassifica);
  } catch (err) {
    console.error('Errore GET /teams:', err);
    res.status(500).json({ error: 'Errore nel recupero delle squadre' });
  }
});

// GET /teams/:id - Dettaglio singola squadra
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const [squadre] = await db.query('SELECT * FROM squadre WHERE id_squadra = ?', [id]);
    if (squadre.length === 0) {
      return res.status(404).json({ error: 'Squadra non trovata' });
    }
    const squadra = squadre[0];

    // Giocatori della squadra
    const [giocatori] = await db.query(
      'SELECT * FROM giocatori WHERE id_squadra = ? ORDER BY gol_fatti DESC',
      [id]
    );

    // Ultime 10 partite
    const [partite] = await db.query(
      `SELECT p.*, 
              s1.nome AS nome_casa, s1.logo_sigla AS logo_casa, s1.logo_url AS logo_casa_url, s1.colore AS colore_casa,
              s2.nome AS nome_trasferta, s2.logo_sigla AS logo_trasferta, s2.logo_url AS logo_trasferta_url, s2.colore AS colore_trasferta
       FROM partite p
       JOIN squadre s1 ON p.id_squadra_casa = s1.id_squadra
       JOIN squadre s2 ON p.id_squadra_trasferta = s2.id_squadra
       WHERE p.stato = 'terminata' 
         AND (p.id_squadra_casa = ? OR p.id_squadra_trasferta = ?)
       ORDER BY p.data_ora DESC
       LIMIT 10`,
      [id, id]
    );

    // Statistiche
    let vittorie = 0, pareggi = 0, sconfitte = 0, gol_fatti = 0, gol_subiti = 0;
    partite.forEach(p => {
      const isCasa = p.id_squadra_casa === parseInt(id);
      const gF = isCasa ? p.gol_casa : p.gol_trasferta;
      const gS = isCasa ? p.gol_trasferta : p.gol_casa;
      gol_fatti += gF;
      gol_subiti += gS;
      if (gF > gS) vittorie++;
      else if (gF === gS) pareggi++;
      else sconfitte++;
    });

    const punti = vittorie * 3 + pareggi;

    // Forma recente (ultime 5)
    const formaRecente = partite.slice(0, 5).map(p => {
      const isCasa = p.id_squadra_casa === parseInt(id);
      const gF = isCasa ? p.gol_casa : p.gol_trasferta;
      const gS = isCasa ? p.gol_trasferta : p.gol_casa;
      if (gF > gS) return 'V';
      if (gF === gS) return 'P';
      return 'S';
    });

    res.json({
      squadra,
      giocatori,
      partite,
      statistiche: { vittorie, pareggi, sconfitte, punti, gol_fatti, gol_subiti, partite_giocate: vittorie + pareggi + sconfitte },
      formaRecente
    });
  } catch (err) {
    console.error('Errore GET /teams/:id:', err);
    res.status(500).json({ error: 'Errore nel recupero della squadra' });
  }
});

module.exports = router;
