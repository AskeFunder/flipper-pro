# Lokal Development Setup

## Problem
Efter production schema bootstrap er din lokale database tom, så der vises ingen items i browse/søgebaren.

## Løsning

### 1. PORT er nu tilføjet til .env
Din `.env` fil indeholder nu:
```
DATABASE_URL=postgres://postgres:Troldmanden6@localhost:5432/flipperpro
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
```

### 2. Befolk items tabellen (KRITISK - kør først!)

Kør dette script mod din **lokale database** for at hente alle OSRS items:

```bash
cd osrs-flipper-pro-backend
node scripts/fetch-item-mappings.js
```

Dette vil:
- Hente alle ~4,500 items fra OSRS API
- Indsætte dem i din lokale `items` tabel
- **Påvirker IKKE production database** (bruger DATABASE_URL fra .env)

**⚠️ VIGTIGT:** Kør dette FØR du starter scheduleren, ellers vil poll-latest.js fejle!

### 3. Start backend lokalt

**Kun backend (uden scheduler):**
```bash
cd osrs-flipper-pro-backend
node server.js
```

**Eller med dev script (backend + frontend, UDEN scheduler):**
```bash
# Fra root directory
npm run dev:backend
npm run dev:frontend
# (IKKE npm run dev:scheduler - den fejler hvis items tabellen er tom)
```

### 4. Hvis du vil have price data lokalt (valgfrit)

Efter items tabellen er befolket, kan du køre poll-latest.js manuelt:

```bash
node poller/poll-latest.js
```

**Eller start scheduleren (efter items er befolket):**
```bash
npm run dev:scheduler
```

## Fejlfinding

### Problem: "POLL LATEST failed"
**Årsag:** Items tabellen er tom  
**Løsning:** Kør `node scripts/fetch-item-mappings.js` først

### Problem: "EADDRINUSE: address already in use :::3001"
**Årsag:** Port 3001 er allerede i brug  
**Løsning:** 
```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force
```

### Problem: Scheduler kører alle pollers automatisk
**Årsag:** Scheduleren er designet til production  
**Løsning:** Kør kun backend + frontend lokalt, ikke scheduler

## Sikkerhed

- Production database: `46.101.101.26` (kun brugt når DATABASE_URL er sat til production)
- Lokal database: `localhost:5432` (standard i din .env)
- Du kan arbejde lokalt uden at påvirke production

