# 🚀 VM DEPLOYMENT GUIDE - TRIN 2-5

## 📋 OVERBLIK

Dette guide gennemgår VM-deployment for commit `5a3a0a6` - URL-based browse state + real links.

---

## ✅ TRIN 2 — PULL PÅ VM

### SSH til VM'en og kør:

```bash
cd /root/flipper-pro
git pull origin production
```

### Bekræft at disse filer er opdateret:

```bash
ls -lh osrs-flipper-pro/src/pages/BrowseItemsPage.jsx
ls -lh osrs-flipper-pro/src/components/BrowseTable.jsx
ls -lh osrs-flipper-pro/src/App.js
```

**Forventet output:** Filstørrelser og datoer der matcher den nye commit.

**Eller check commit:**
```bash
git log --oneline -1
```
**Forventet:** `5a3a0a6 feat: implement URL-based browse state and real links for items`

---

## ✅ TRIN 3 — PRODUCTION BUILD

```bash
cd /root/flipper-pro/osrs-flipper-pro
npm run build
```

**Forventet output:**
- Build starter
- Compiling...
- Build successful
- Build folder created

**⚠️ Hvis build fejler:**
- STOP deployment
- Check fejlmeddelelse
- Rapportér fejl

**Build tager typisk 1-3 minutter.**

---

## ✅ TRIN 4 — DEPLOY TIL NGINX WEBROOT

```bash
# Clear existing files
sudo rm -rf /var/www/flipper-pro/*

# Copy new build
sudo cp -r /root/flipper-pro/osrs-flipper-pro/build/* /var/www/flipper-pro/

# Set correct permissions
sudo chown -R www-data:www-data /var/www/flipper-pro

# Reload nginx
sudo systemctl reload nginx
```

**Forventet output:**
- Ingen fejl fra rm, cp, chown
- `nginx reloaded` eller lignende fra systemctl

**Bekræft nginx status:**
```bash
sudo systemctl status nginx
```
**Forventet:** `active (running)`

---

## ✅ TRIN 5 — PRODUCTION ACCEPTANCE TEST

Test på https://flipper-pro.com:

### 1. ✅ Sort → item → tilbage

**Steps:**
1. Gå til https://flipper-pro.com/browse
2. Klik på en column header for at sortere (fx "Margin")
3. Noter hvilken sortering der er aktiv
4. Klik på et item
5. Tryk browser "Back" knap
6. **Verificer:** Sortering er bevaret

**Forventet URL efter tilbage:**
```
https://flipper-pro.com/browse?sortBy=margin&order=desc
```

---

### 2. ✅ Page → item → tilbage

**Steps:**
1. Gå til https://flipper-pro.com/browse
2. Gå til side 2 eller 3 (via pagination)
3. Klik på et item
4. Tryk browser "Back" knap
5. **Verificer:** Side nummer er bevaret

**Forventet URL efter tilbage:**
```
https://flipper-pro.com/browse?sortBy=margin&order=desc&page=2
```

---

### 3. ✅ Search → item → tilbage

**Steps:**
1. Gå til https://flipper-pro.com/browse
2. Søg efter noget (fx "whip")
3. Klik på et item
4. Tryk browser "Back" knap
5. **Verificer:** Søgning er bevaret

**Forventet URL efter tilbage:**
```
https://flipper-pro.com/browse?search=whip&sortBy=margin&order=desc&page=1
```

---

### 4. ✅ Ctrl/Cmd-klik → ny fane

**Steps:**
1. Gå til https://flipper-pro.com/browse
2. Hold Ctrl (Windows/Linux) eller Cmd (Mac) og klik på et item
3. **Verificer:** Item åbner i ny browser tab

**Forventet:** Ny tab åbner med item detail page

---

### 5. ✅ Højreklik → åbn i ny fane

**Steps:**
1. Gå til https://flipper-pro.com/browse
2. Højreklik på et item
3. **Verificer:** Context menu viser "Åbn i ny fane" eller "Open in new tab"
4. Klik på option
5. **Verificer:** Item åbner i ny tab

**Forventet:** Context menu vises med link-optioner (ikke bare browser default)

---

### 6. ✅ Normal klik → SPA

**Steps:**
1. Gå til https://flipper-pro.com/browse
2. Normal klik på et item (uden Ctrl/Cmd)
3. **Verificer:** 
   - Navigation sker uden page reload
   - Browser spinner vises ikke
   - URL ændrer sig

**Forventet:** SPA navigation (smooth, ingen reload)

---

### 7. ✅ Ingen console errors

**Steps:**
1. Åbn browser Developer Tools (F12)
2. Gå til Console tab
3. Naviger rundt på siden (browse, items, sort, search)
4. **Verificer:** Ingen røde errors i console

**Forventet:** Ingen errors, kun warnings hvis relevante

---

## 🎯 ALLE TESTS PASSER?

Hvis alle 7 tests passer → **✅ DEPLOYMENT SUCCESSFUL!**

Hvis nogen test fejler → **❌ STOP og rapportér fejlen.**

---

## 📋 ALTERNATIV: Brug Deployment Script

Du kan også bruge det medfølgende script:

```bash
# Upload script til VM
scp vm-deploy.sh root@your-vm-ip:/root/

# SSH til VM og kør
ssh root@your-vm-ip
bash /root/vm-deploy.sh
```

Scriptet gennemfører automatisk TRIN 2-4.

---

## 🐛 TROUBLESHOOTING

### Build fejler:
```bash
# Check node version
node --version

# Clear cache og prøv igen
cd /root/flipper-pro/osrs-flipper-pro
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Nginx reload fejler:
```bash
# Check nginx config
sudo nginx -t

# Check nginx error log
sudo tail -f /var/log/nginx/error.log
```

### Filer mangler efter deployment:
```bash
# Check at build folder eksisterer
ls -la /root/flipper-pro/osrs-flipper-pro/build/

# Check at files er kopieret
ls -la /var/www/flipper-pro/
```

---

## ✅ DEPLOYMENT CHECKLIST

- [ ] TRIN 2: git pull completed
- [ ] TRIN 2: Files verified updated
- [ ] TRIN 3: npm run build successful
- [ ] TRIN 4: Files copied to /var/www/flipper-pro/
- [ ] TRIN 4: Permissions set correctly
- [ ] TRIN 4: nginx reloaded
- [ ] TRIN 5: Sort → item → tilbage tested
- [ ] TRIN 5: Page → item → tilbage tested
- [ ] TRIN 5: Search → item → tilbage tested
- [ ] TRIN 5: Ctrl/Cmd-klik tested
- [ ] TRIN 5: Højreklik tested
- [ ] TRIN 5: Normal klik tested
- [ ] TRIN 5: Console errors checked



