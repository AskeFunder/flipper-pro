# Process Execution Logging

Dette system logger alle process-kørsler fra scheduler'en for at tracke ydeevne og identificere problemer.

## Hvad bliver logget?

For hver proces der kører bliver der logget:
- **Start**: Når processen starter
- **Completed**: Når processen færdiggører (med køretid)
- **Blocked**: Når processen ikke kan køre pga. lock (f.eks. forrige kørsel kører stadig)
- **Failed**: Hvis processen fejler (med fejlbesked)

## Log-fil lokation

Logs gemmes i: `osrs-flipper-pro-backend/logs/process-execution.log.json`

Format: Én JSON-objekt per linje (JSONL format)

## Se logs

### Vis rapport (anbefalet)
```bash
node poller/view-process-logs.js
```

Viser en læsbar rapport med:
- Total antal kørsler
- Statistik per proces (completed, blocked, failed)
- Gennemsnitlig køretid per proces
- Liste over blokerede kørsler
- Seneste kørsler

### Vis logs for specifik periode
```bash
# Vis sidste 12 timer
node poller/view-process-logs.js 12

# Vis sidste 48 timer
node poller/view-process-logs.js 48
```

### Få JSON data
```bash
node poller/view-process-logs.js --json
```

## Eksempel output

```
📊 Process Execution Report (Last 24 hours)
============================================================

Total log entries: 1245

Process Statistics:
------------------------------------------------------------

POLL LATEST:
  Total runs: 5760
  Completed: 5750
  Blocked: 10
  Failed: 0
  Avg duration: 8.45s

UPDATE CANONICAL:
  Total runs: 2880
  Completed: 2875
  Blocked: 5
  Failed: 0
  Avg duration: 12.30s

⚠️  Blocked Executions (15):
------------------------------------------------------------
  2024-01-15T10:15:00.000Z: POLL LATEST - Previous execution still running (lock active)
  2024-01-15T10:30:00.000Z: POLL LATEST - Previous execution still running (lock active)
  ...

Recent Executions:
------------------------------------------------------------
  ✅ 2024-01-15T14:30:00.000Z: POLL LATEST (8.23s)
  ✅ 2024-01-15T14:29:45.000Z: POLL LATEST (8.45s)
  ✅ 2024-01-15T14:29:30.000Z: UPDATE CANONICAL (12.30s)
  ...
```

## Hvad betyder "Blocked"?

En proces bliver markeret som "blocked" når:
- Den forrige kørsel af samme proces stadig kører (lock aktiv)
- Scheduler'en prøver at starte en ny kørsel, men lock'en forhindrer det

Dette er normalt og forventet hvis:
- En proces tager længere tid end forventet
- Systemet er overbelastet (RAM/CPU)

## Hvad skal man se efter?

1. **Høj "blocked" rate**: Hvis mange processer bliver blokeret, betyder det at processerne tager for lang tid
2. **Stigende køretid**: Hvis gennemsnitlig køretid stiger over tid, kan det indikere performance problemer
3. **Failed processes**: Hvis processer fejler, skal fejlene undersøges

## Log rotation

Log-filen vokser over tid. Overvej at:
- Rotere log-filen periodisk (f.eks. dagligt)
- Slette gamle logs efter X dage
- Eller implementere log rotation i process-logger.js





