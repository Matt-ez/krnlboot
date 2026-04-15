# ⚽ CаlcioStats – Piattaforma Sport Analytics

> Progetto 5°DIA – Greta Viali, Matteo Bonaccini

Applicazione web full-stack per analisi sportive sul calcio.  
Stack: **React** (frontend) + **Node.js/Express** (backend) + **MySQL** (database)

---

## 📁 Struttura del Progetto

```
sport-analytics/
├── backend/
│   ├── routes/
│   │   ├── auth.js          # POST /register, POST /login
│   │   ├── teams.js         # GET /teams, GET /teams/:id
│   │   ├── matches.js       # GET /matches
│   │   ├── predictions.js   # GET /predictions/:id_casa/:id_trasferta
│   │   └── dashboard.js     # GET /dashboard
│   ├── middleware/
│   │   └── auth.js          # JWT middleware
│   ├── scripts/
│   │   ├── dataeng.js          # Script raccolta dati football-data.org
│   │   └── dataEngineering.js  # Alias legacy dello script
│   ├── db.js                # Connessione MySQL
│   ├── server.js            # Entry point Express
│   ├── database.sql         # Schema + seed dati
│   └── .env.example
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login.jsx
        │   ├── Dashboard.jsx
        │   ├── Teams.jsx
        │   ├── TeamDetail.jsx
        │   ├── Matches.jsx
        │   └── Predictions.jsx
        ├── components/
        │   └── Sidebar.jsx
        ├── hooks/
        │   └── useAuth.js
        ├── utils/
        │   └── api.js
        └── App.jsx
```

---

## 🚀 Installazione e Avvio

### Prerequisiti
- Node.js >= 18
- MySQL >= 8.0

### 1. Database

```bash
# Accedi a MySQL e crea il database con i dati di esempio:
mysql -u root -p < backend/database.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Modifica .env con le tue credenziali MySQL

npm install
npm run dev     # oppure: npm start
# → Server su http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm start
# → App su http://localhost:3000
```

---

## 🗺️ Pagine dell'Applicazione

| Route | Pagina |
|-------|--------|
| `/login` | Login / Registrazione |
| `/dashboard` | Dashboard generale |
| `/teams` | Classifica squadre |
| `/teams/:id` | Dettaglio squadra |
| `/matches` | Partite (live / prossime / risultati) |
| `/predictions` | Analisi predittiva |

---

## 🔌 Endpoint API

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Registrazione utente | No |
| POST | `/login` | Login utente | No |
| GET | `/dashboard` | Statistiche generali | ✅ |
| GET | `/teams` | Lista squadre con classifica | ✅ |
| GET | `/teams/:id` | Dettaglio squadra + giocatori | ✅ |
| GET | `/matches` | Partite live/future/terminate | ✅ |
| GET | `/predictions` | Stats accuratezza globale | ✅ |
| GET | `/predictions/:id_casa/:id_trasferta` | Previsione partita | ✅ |

---

## 🧮 Algoritmo di Analisi Predittiva

L'algoritmo si basa su **Analisi della Forma Recente + Forza Attacco/Difesa**:

1. **Raccolta dati storici** – ultime 10 partite per squadra
2. **Calcolo punteggio forma** – peso decrescente sulle partite recenti (5,4,3,2,1)
3. **Calcolo indici offensivo/difensivo** – rapportati alla media della lega
4. **Forza composta** – forma (40%) + attacco (30%) + difesa (30%)
5. **Generazione percentuali** – V/P/S normalizzate al 100%, con vantaggio campo casa (+10%)

---

## 🔧 Script Data Engineering

```bash
# Configura FOOTBALL_DATA_API_KEY nel .env, poi:
cd backend
node scripts/dataeng.js
```

Lo script:
1. Recupera squadre, partite e marcatori da **football-data.org**
2. Esegue il parsing e la pulizia dei dati (data cleaning)
3. Inserisce i dati nel database MySQL evitando duplicati e aggiorna logo, stadio, anno di fondazione, campionato e paese

> Senza API key, il DB viene popolato con i dati seed inclusi in `database.sql`

---

## 🗄️ Schema Database (3NF)

```
SQUADRE   (id_squadra*, nome, citta, anno_fondazione, stadio, logo_sigla, colore)
UTENTI    (id_utente*, nome, cognome, email, password_hash, ruolo, id_squadra_preferita°)
GIOCATORI (id_giocatore*, nome, cognome, ruolo, gol_fatti, assist, id_squadra°)
PARTITE   (id_partita*, data_ora, gol_casa, gol_trasferta, stato, id_squadra_casa°, id_squadra_trasferta°)
```
*PK  °FK
