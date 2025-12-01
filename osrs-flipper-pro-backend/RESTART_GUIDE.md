# Fresh Restart Guide

Denne guide forklarer hvordan man laver en fresh restart af scheduler'en på VM'en.

## Hvorfor fresh restart?

- Fjerner alle hængende processer
- Rydder op i lock-filer
- Giver scheduler'en en ren start
- Aktiverer det nye logging-system

## På Linux VM (Production)

### 1. SSH ind på VM'en
```bash
ssh root@46.101.101.26
```

### 2. Naviger til backend directory
```bash
cd /root/osrs-flipper-pro-backend
```

### 3. Kør fresh restart script
```bash
bash restart-scheduler-fresh.sh
```

Dette script:
- ✅ Stopper alle PM2 processer
- ✅ Dræber alle node processer (inkl. hængende)
- ✅ Rydder op i lock-filer
- ✅ Viser system ressourcer
- ✅ Starter scheduler'en med PM2
- ✅ Viser status og logs

### 4. Verificer at det kører
```bash
# Se PM2 status
pm2 status

# Se logs
pm2 logs flipperpro-scheduler

# Se process logs (efter nogle minutter)
node poller/view-process-logs.js
```

## Manuelt (hvis script ikke virker)

### Stop alt
```bash
# Stop PM2
pm2 stop all
pm2 delete all

# Dræb alle node processer
pkill -9 node

# Vent 5 sekunder
sleep 5
```

### Ryd op
```bash
# Ryd lock filer
rm -rf .locks/*

# Tjek at alt er stoppet
ps aux | grep node
```

### Start scheduler
```bash
# Start med PM2
pm2 start poller/scheduler.js --name flipperpro-scheduler

# Se status
pm2 status
pm2 logs flipperpro-scheduler
```

## Se Performance Data

Efter scheduler'en har kørt i nogle minutter:

```bash
# Se rapport for sidste 24 timer
node poller/view-process-logs.js

# Se rapport for sidste 1 time
node poller/view-process-logs.js 1

# Se JSON data
node poller/view-process-logs.js --json
```

## Troubleshooting

### Scheduler starter ikke
- Tjek at `.env` filen eksisterer
- Tjek at `DATABASE_URL` er sat korrekt
- Se logs: `pm2 logs flipperpro-scheduler`

### Processer hænger stadig
- Tjek: `ps aux | grep node`
- Dræb manuelt: `kill -9 <PID>`
- Tjek lock filer: `ls -la .locks/`

### Ingen logs
- Tjek at `logs/` directory eksisterer
- Tjek permissions: `ls -la logs/`
- Tjek at scheduler'en faktisk kører: `pm2 status`

## Næste Skridt

Efter fresh restart:
1. ✅ Scheduler kører med logging
2. ✅ Alle processer logger køretid
3. ✅ Blokerede processer bliver logget
4. ✅ Du kan analysere performance over tid

Vent 15-30 minutter, så se logs:
```bash
node poller/view-process-logs.js
```

Dette viser:
- Hvor lang tid hver proces tager
- Hvor mange processer der bliver blokeret
- Gennemsnitlig køretid per proces
- Eventuelle problemer





