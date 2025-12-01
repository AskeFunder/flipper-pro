# Tjekke Process Logs på VM

## Hurtig guide

### Via SSH direkte:

```bash
# SSH ind på VM'en
ssh user@your-vm.com

# Se log rapport (sidste 24 timer)
cd ~/osrs-flipper-pro-backend
node poller/view-process-logs.js 24

# Se health check
node poller/check-process-health.js 24

# Se logs for kortere periode (f.eks. 12 timer)
node poller/view-process-logs.js 12
```

### Via script (fra din lokale maskine):

#### Windows (PowerShell):
```powershell
# Rediger først SSH host i scriptet, eller brug parameter:
.\scripts\check-vm-logs.ps1 user@your-vm.com 24
```

#### Linux/Mac:
```bash
# Rediger først SSH host i scriptet, eller brug parameter:
./scripts/check-vm-logs.sh user@your-vm.com 24
```

## Hvad viser loggen?

### Process Execution Report
- **Total log entries**: Antal log entries i perioden
- **Process Statistics**: For hver proces:
  - Total runs: Hvor mange gange den har kørt
  - Completed: Hvor mange gange den har færdiggjort
  - Blocked: Hvor mange gange den blev blokeret (forrige kørsel kørte stadig)
  - Failed: Hvor mange gange den fejlede
  - Avg duration: Gennemsnitlig køretid

### Health Check
- ✅ **Healthy**: Processer kører som forventet
- ⚠️ **Warnings**: Processer kører, men med problemer (f.eks. for mange blocked)
- ❌ **Errors**: Processer kører ikke som forventet (f.eks. for sjældent)

## Forventede frekvenser

- **POLL LATEST**: 60 gange/time (hvert minut ved :10)
- **UPDATE CANONICAL**: 60 gange/time (dynamisk baseret på dirty items)
- **POLL 5m**: 12 gange/time (hver 5. minut ved :30)
- **POLL 1h**: 1 gang/time (ved :00:30)
- **POLL 6h**: 0.167 gange/time (hver 6. time ved :00:30)
- **POLL 24h**: 0.042 gange/time (dagligt ved 02:00:30)
- **CLEANUP 5m**: 12 gange/time (efter hver poll)
- **FULL CLEANUP**: 6 gange/time (hver 10. minut ved :01)

## Troubleshooting

### Log fil findes ikke
- Tjek om scheduler'en kører: `ps aux | grep scheduler`
- Tjek om log mappen eksisterer: `ls -la ~/osrs-flipper-pro-backend/logs/`

### Processer kører for sjældent
- Tjek om scheduler'en kører korrekt
- Tjek om der er fejl i scheduler output
- Tjek system ressourcer (RAM/CPU)

### Mange "blocked" processer
- Processer tager for lang tid
- Tjek system performance
- Overvej at øge interval mellem kørsler





