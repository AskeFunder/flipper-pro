# DigitalOcean PostgreSQL Setup Guide

Komplet guide til opsætning af PostgreSQL på en $4 DigitalOcean Droplet for OSRS FlipperPro.

---

## 1. DigitalOcean UI - Opret Droplet

### Trin 1.1: Log ind på DigitalOcean
- Gå til https://cloud.digitalocean.com
- Log ind med din konto

### Trin 1.2: Opret ny Droplet
1. Klik på **"Create"** knappen (øverst til højre)
2. Vælg **"Droplets"**

### Trin 1.3: Vælg Region
- Vælg en region tæt på dig (fx **Frankfurt** eller **Amsterdam**)
- Klik **"Next"**

### Trin 1.4: Vælg Image
- Under **"Choose an image"** → Vælg **"Ubuntu"**
- Vælg version **22.04 (LTS) x64**
- Klik **"Next"**

### Trin 1.5: Vælg Plan
- Vælg **"Regular"** tab (ikke CPU-Optimized)
- Vælg **"Basic"** plan
- Vælg **$4/mo** plan:
  - **1 GB RAM**
  - **1 vCPU**
  - **25 GB SSD**
- Klik **"Next"**

### Trin 1.6: SSH Keys (KRITISK)
1. Under **"Authentication"** → Vælg **"SSH keys"**
2. Hvis du har en SSH key:
   - Vælg din eksisterende key fra listen
3. Hvis du IKKE har en SSH key:
   - Klik **"New SSH Key"**
   - På din lokale maskine, kør:
     ```bash
     ssh-keygen -t ed25519 -C "your_email@example.com"
     ```
   - Kopier indholdet af `~/.ssh/id_ed25519.pub` (eller `id_rsa.pub`)
   - Indsæt i DigitalOcean feltet
   - Giv key et navn (fx "My Laptop")
   - Klik **"Add SSH Key"**
4. **VIKTIGT**: Sørg for at din SSH key er valgt før du fortsætter

### Trin 1.7: Finaliser Droplet
1. Under **"Choose a hostname"** → Giv den et navn (fx `flipperpro-db`)
2. **Fjern** alle add-ons (monitoring, backups er ikke nødvendige for $4 plan)
3. Klik **"Create Droplet"**

### Trin 1.8: Find Public IP
1. Vent 30-60 sekunder til droplet er oprettet
2. På dashboard → Klik på din nye droplet
3. **Public IPv4** adressen vises øverst (fx `157.230.123.45`)
4. **Skriv denne IP ned** - du skal bruge den senere

---

## 2. Server-Kommandoer - PostgreSQL Opsætning

### Trin 2.1: SSH til Droplet
Fra din lokale maskine:
```bash
ssh root@DROPLET_IP
```
Erstat `DROPLET_IP` med IP'en fra trin 1.8.

Hvis du får "Permission denied", prøv:
```bash
ssh -i ~/.ssh/id_ed25519 root@DROPLET_IP
```

### Trin 2.2: Opdater System
```bash
apt update
apt upgrade -y
```

### Trin 2.3: Installer PostgreSQL
```bash
apt install postgresql postgresql-contrib -y
```

### Trin 2.4: Verificer Installation
```bash
sudo -u postgres psql -c "SELECT version();"
```
Du skulle se PostgreSQL version output.

### Trin 2.5: Opret Database og Bruger
```bash
sudo -u postgres psql
```

Nu er du i PostgreSQL prompt. Kør følgende kommandoer:

```sql
-- Opret database
CREATE DATABASE flipperpro;

-- Opret bruger (erstat 'STRONG_PASSWORD' med et stærkt password)
CREATE USER flipperpro_user WITH PASSWORD 'STRONG_PASSWORD';

-- Giv alle privilegier til brugeren
GRANT ALL PRIVILEGES ON DATABASE flipperpro TO flipperpro_user;

-- For PostgreSQL 15+, skal du også give schema privileges
\c flipperpro
GRANT ALL ON SCHEMA public TO flipperpro_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO flipperpro_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO flipperpro_user;

-- Exit PostgreSQL
\q
```

**VIKTIGT**: Skriv password'et ned - du skal bruge det i DATABASE_URL senere.

### Trin 2.6: Konfigurer PostgreSQL til Remote Connections

#### 2.6.1: Rediger postgresql.conf
```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
```
*(Bemærk: Version kan være 15 eller 16 - tjek med `ls /etc/postgresql/`)*

Find linjen:
```
#listen_addresses = 'localhost'
```

Ændr den til:
```
listen_addresses = '*'
```

Gem og luk: `Ctrl+X`, `Y`, `Enter`

#### 2.6.2: Rediger pg_hba.conf
```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

Tilføj følgende linje **efter** alle eksisterende linjer (i bunden af filen):
```
host    flipperpro    flipperpro_user    0.0.0.0/0    md5
```

Gem og luk: `Ctrl+X`, `Y`, `Enter`

#### 2.6.3: Genstart PostgreSQL
```bash
sudo systemctl restart postgresql
```

#### 2.6.4: Verificer PostgreSQL Lytter
```bash
sudo netstat -tlnp | grep 5432
```

Du skulle se noget som:
```
tcp  0  0  0.0.0.0:5432  0.0.0.0:*  LISTEN  12345/postgres
```

---

## 3. Eksport/Import af Database

### Trin 3.1: Eksporter Lokal Database til .sql

Fra din **lokale maskine** (ikke droplet):

#### 3.1.1: Hvis du bruger lokal PostgreSQL
```bash
pg_dump -h localhost -U postgres -d flipperpro -F c -f flipperpro_backup.dump
```

Eller hvis du vil have plain SQL (anbefalet):
```bash
pg_dump -h localhost -U postgres -d flipperpro -F p -f flipperpro_backup.sql
```

#### 3.1.2: Hvis du bruger DATABASE_URL
```bash
pg_dump "postgres://user:pass@localhost:5432/flipperpro" -F p -f flipperpro_backup.sql
```

#### 3.1.3: Hvis du har en eksisterende .sql fil
Hvis du allerede har `neon-export.sql` eller lignende, brug den.

**Bemærk**: Filen kan være stor (~1550 MB). Sørg for at du har nok diskplads.

### Trin 3.2: Overfør .sql Fil til Droplet

Fra din **lokale maskine**:
```bash
scp flipperpro_backup.sql root@DROPLET_IP:/root/
```

Hvis filen er meget stor, kan det tage tid. Du kan følge med:
```bash
# I en anden terminal, mens scp kører
ssh root@DROPLET_IP "du -h /root/flipperpro_backup.sql"
```

### Trin 3.3: Import .sql til PostgreSQL på Droplet

SSH til droplet:
```bash
ssh root@DROPLET_IP
```

Importer databasen:
```bash
sudo -u postgres psql flipperpro < /root/flipperpro_backup.sql
```

**Alternativ metode** (hvis du får permission errors):
```bash
# Kopier filen til postgres user
sudo cp /root/flipperpro_backup.sql /tmp/
sudo chown postgres:postgres /tmp/flipperpro_backup.sql

# Import som postgres user
sudo -u postgres psql flipperpro < /tmp/flipperpro_backup.sql
```

**Bemærk**: Import kan tage 10-30 minutter for en 1550 MB database.

### Trin 3.4: Verificer Import

```bash
sudo -u postgres psql flipperpro -c "\dt"
```

Du skulle se alle dine tabeller:
- `canonical_items`
- `items`
- `price_5m`
- `price_1h`
- `price_6h`
- `price_24h`
- `price_instants`
- `price_instant_log`
- `dirty_items` (hvis den eksisterer)

Tjek også antal rækker:
```bash
sudo -u postgres psql flipperpro -c "SELECT COUNT(*) FROM canonical_items;"
```

---

## 4. DATABASE_URL Format

Efter opsætning, skal du bruge følgende DATABASE_URL format:

```
postgres://flipperpro_user:STRONG_PASSWORD@DROPLET_IP:5432/flipperpro
```

**Eksempel**:
```
postgres://flipperpro_user:MySecurePass123!@157.230.123.45:5432/flipperpro
```

### 4.1: Sæt DATABASE_URL Lokalt

I din `.env` fil i `osrs-flipper-pro-backend/`:
```env
DATABASE_URL=postgres://flipperpro_user:STRONG_PASSWORD@DROPLET_IP:5432/flipperpro
```

**VIKTIGT**: 
- Erstat `STRONG_PASSWORD` med password'et fra trin 2.5
- Erstat `DROPLET_IP` med IP'en fra trin 1.8
- Brug **ikke** `localhost` - brug droplet IP'en

### 4.2: Test Forbindelse

Fra din lokale maskine:
```bash
cd osrs-flipper-pro-backend
node -e "require('dotenv').config(); const {Pool} = require('pg'); const db = new Pool({connectionString: process.env.DATABASE_URL}); db.query('SELECT NOW()').then(r => {console.log('✅ Connected:', r.rows[0]); process.exit(0);}).catch(e => {console.error('❌ Error:', e.message); process.exit(1);});"
```

Hvis du ser en timestamp, virker forbindelsen! ✅

---

## 5. Firewall Konfiguration (ufw)

### Trin 5.1: Aktivér Firewall
SSH til droplet:
```bash
ssh root@DROPLET_IP
```

```bash
# Aktivér ufw
ufw enable

# Tjek status
ufw status
```

### Trin 5.2: Åbn Nødvendige Porte

```bash
# Tillad SSH (port 22) - KRITISK, ellers bliver du låst ude!
ufw allow 22/tcp

# Tillad PostgreSQL (port 5432) fra alle IPs
ufw allow 5432/tcp

# Eller hvis du kun vil tillade fra din specifikke IP (anbefalet for produktion):
# ufw allow from YOUR_IP_ADDRESS to any port 5432
```

### Trin 5.3: Verificer Firewall Regler

```bash
ufw status numbered
```

Du skulle se:
```
Status: active

     To                         Action      From
     --                         ------      ----
[1]  22/tcp                     ALLOW       Anywhere
[2]  5432/tcp                   ALLOW       Anywhere
```

### Trin 5.4: Test PostgreSQL Forbindelse Fra Lokal Maskine

Fra din **lokale maskine** (ikke droplet):
```bash
psql "postgres://flipperpro_user:STRONG_PASSWORD@DROPLET_IP:5432/flipperpro" -c "SELECT version();"
```

Hvis du får PostgreSQL version output, virker alt! ✅

---

## 6. Sikkerhedsbestemmelser (Valgfrit men Anbefalet)

### 6.1: Begræns PostgreSQL til Specifik IP

Hvis du kun vil tillade forbindelser fra din server/API IP:

Rediger `pg_hba.conf`:
```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

Erstat:
```
host    flipperpro    flipperpro_user    0.0.0.0/0    md5
```

Med (erstat `YOUR_API_SERVER_IP` med din faktiske IP):
```
host    flipperpro    flipperpro_user    YOUR_API_SERVER_IP/32    md5
```

Genstart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### 6.2: Opdater Firewall til Kun Tillade Specifik IP

```bash
# Fjern generel regel
ufw delete allow 5432/tcp

# Tilføj specifik IP regel
ufw allow from YOUR_API_SERVER_IP to any port 5432
```

---

## 7. Troubleshooting

### Problem: "Connection refused" ved psql
**Løsning**: 
- Tjek at PostgreSQL lytter: `sudo netstat -tlnp | grep 5432`
- Tjek firewall: `ufw status`
- Tjek `postgresql.conf`: `listen_addresses = '*'`

### Problem: "Password authentication failed"
**Løsning**:
- Tjek at brugeren eksisterer: `sudo -u postgres psql -c "\du"`
- Reset password: `sudo -u postgres psql -c "ALTER USER flipperpro_user WITH PASSWORD 'NEW_PASSWORD';"`

### Problem: "Permission denied" ved import
**Løsning**:
- Brug `sudo -u postgres` før kommandoen
- Tjek fil permissions: `ls -la /root/flipperpro_backup.sql`

### Problem: Import tager for lang tid
**Løsning**:
- Dette er normalt for store databaser (1550 MB)
- Brug `screen` eller `tmux` til at køre import i baggrunden:
  ```bash
  screen -S import
  sudo -u postgres psql flipperpro < /root/flipperpro_backup.sql
  # Tryk Ctrl+A, derefter D for at detache
  # Gendan med: screen -r import
  ```

---

## 8. Verificer Alt Virker

### Test fra Lokal Maskine:
```bash
cd osrs-flipper-pro-backend
node -e "
require('dotenv').config();
const {Pool} = require('pg');
const db = new Pool({connectionString: process.env.DATABASE_URL});
db.query('SELECT COUNT(*) as count FROM canonical_items')
  .then(r => {
    console.log('✅ Database connected!');
    console.log('Canonical items:', r.rows[0].count);
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  });
"
```

Hvis du ser antallet af canonical items, er alt sat korrekt op! 🎉

---

## 9. Næste Skridt

Efter database er sat op:
1. Opdater `.env` med korrekt `DATABASE_URL`
2. Test forbindelse fra backend
3. Kør pollers og verificer de kan connecte
4. Overvej at sætte op monitoring/backups (valgfrit)

**VIKTIGT**: Gem denne guide og password'et sikkert!






