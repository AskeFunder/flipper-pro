# 🚀 DEPLOYMENT STEPS - PRODUCTION

## ✅ TRIN 0-1 GENNEMFØRT (LOKALT)

- ✅ develop branch pushed til origin
- ✅ production branch merged fra develop
- ✅ production branch pushed til origin

**Commits pushed:**
- `5a3a0a6` - feat: implement URL-based browse state and real links for items

---

## 📋 TRIN 2-5 SKAL UDFØRES PÅ VM

### ✅ TRIN 2 — PULL PÅ VM

SSH til serveren og kør:

```bash
cd /root/flipper-pro
git pull origin production
```

**Bekræft at følgende filer er opdateret:**
- `osrs-flipper-pro/src/pages/BrowseItemsPage.jsx`
- `osrs-flipper-pro/src/components/BrowseTable.jsx`
- `osrs-flipper-pro/src/App.js`

---

### ✅ TRIN 3 — PRODUCTION BUILD

```bash
cd /root/flipper-pro/osrs-flipper-pro
npm run build
```

⚠️ **Hvis build fejler → STOP og rapportér fejlen.**

---

### ✅ TRIN 4 — DEPLOY TIL NGINX WEBROOT

```bash
sudo rm -rf /var/www/flipper-pro/*
sudo cp -r /root/flipper-pro/osrs-flipper-pro/build/* /var/www/flipper-pro/
sudo chown -R www-data:www-data /var/www/flipper-pro
sudo systemctl reload nginx
```

---

### ✅ TRIN 5 — PRODUCTION ACCEPTANCE TEST

Test på https://flipper-pro.com:

1. ✅ **Sort → item → tilbage**
   - Gå til /browse
   - Sorter efter en column
   - Klik på et item
   - Tryk tilbage
   - Verificer at sortering er bevaret

2. ✅ **Page → item → tilbage**
   - Gå til /browse
   - Gå til side 2 eller 3
   - Klik på et item
   - Tryk tilbage
   - Verificer at side er bevaret

3. ✅ **Search → item → tilbage**
   - Gå til /browse
   - Søg efter noget (fx "whip")
   - Klik på et item
   - Tryk tilbage
   - Verificer at søgning er bevaret

4. ✅ **Ctrl/Cmd-klik → ny fane**
   - Ctrl-klik (eller Cmd-klik på Mac) på et item
   - Verificer at det åbner i ny fane

5. ✅ **Højreklik → åbn i ny fane**
   - Højreklik på et item
   - Verificer at context menu viser "Åbn i ny fane"
   - Test at det virker

6. ✅ **Normal klik → SPA**
   - Normal klik på et item
   - Verificer at det navigerer uden page reload

7. ✅ **Ingen console errors**
   - Åbn browser console
   - Verificer at der ikke er errors

---

## 🎯 SAMMENFATNING

**Status:**
- ✅ TRIN 0: develop pushed
- ✅ TRIN 1: production merged og pushed
- ⏳ TRIN 2-5: Ventende på VM deployment

**Filer ændret:**
- `osrs-flipper-pro/src/App.js` - Fjernet searchQuery state, opdateret SearchBar
- `osrs-flipper-pro/src/components/BrowseTable.jsx` - Tilføjet ægte `<a>` links
- `osrs-flipper-pro/src/pages/BrowseItemsPage.jsx` - URL-baseret state implementeret

**Commits:**
- `5a3a0a6` - feat: implement URL-based browse state and real links for items



