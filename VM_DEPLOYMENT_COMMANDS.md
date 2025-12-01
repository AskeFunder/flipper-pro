# 🚀 VM DEPLOYMENT COMMANDS - COPY & PASTE

## ✅ TRIN 2 — PULL PÅ VM

```bash
cd /root/flipper-pro
git pull origin production
```

**Bekræft filer er opdateret:**
```bash
git log --oneline -1
git status
ls -lh osrs-flipper-pro/src/pages/BrowseItemsPage.jsx
ls -lh osrs-flipper-pro/src/components/BrowseTable.jsx
ls -lh osrs-flipper-pro/src/App.js
```

---

## ✅ TRIN 3 — PRODUCTION BUILD

```bash
cd /root/flipper-pro/osrs-flipper-pro
npm run build
```

**Hvis build fejler → STOP og rapportér fejlen.**

---

## ✅ TRIN 4 — DEPLOY TIL NGINX WEBROOT

```bash
sudo rm -rf /var/www/flipper-pro/*
sudo cp -r /root/flipper-pro/osrs-flipper-pro/build/* /var/www/flipper-pro/
sudo chown -R www-data:www-data /var/www/flipper-pro
sudo systemctl reload nginx
```

**Bekræft nginx reload:**
```bash
sudo systemctl status nginx
```

---

## ✅ TRIN 5 — LIVE TEST

Test på https://flipper-pro.com efter deployment er fuldført.



