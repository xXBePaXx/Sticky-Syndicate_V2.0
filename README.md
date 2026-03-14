# 🌿 Sticky Syndicate

Cannabis Botany meets Island Mafia RPG – Mobile Browser Game

## 🚀 Deployment (GitHub Pages + Custom Domain)

### Schritt 1: Repository erstellen
1. GitHub.com öffnen → **New repository**
2. Name: `sticky-syndicate` (oder beliebig)
3. **Public** auswählen
4. Repository erstellen (ohne README)

### Schritt 2: Dateien hochladen
```bash
# Option A: GitHub Desktop (empfohlen für Anfänger)
# → Diesen Ordner in GitHub Desktop öffnen → Commit → Push

# Option B: Git CLI
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/sticky-syndicate.git
git push -u origin main
```

### Schritt 3: GitHub Pages aktivieren
1. Repository → **Settings** → **Pages**
2. Source: **GitHub Actions**
3. Speichern

→ Das Deployment startet automatisch (ca. 2 Minuten)
→ Danach erreichbar unter: `https://DEIN-USERNAME.github.io/sticky-syndicate/`

### Schritt 4: Custom Domain einrichten
1. Bei deinem Domain-Anbieter einen **CNAME-Eintrag** erstellen:
   - Name: `@` oder `www`
   - Ziel: `DEIN-USERNAME.github.io`
2. In GitHub: Settings → Pages → Custom domain → deine-domain.de eintragen
3. **Enforce HTTPS** aktivieren

**Wichtig:** Wenn du eine Custom Domain nutzt, bleibt `base: '/'` in `vite.config.js`.
Ohne Custom Domain (nur github.io) muss `base` auf `/sticky-syndicate/` geändert werden.

## 💻 Lokale Entwicklung

```bash
npm install
npm run dev
```

Öffne http://localhost:5173

## 🔑 Standard-Zugangsdaten

| User | Passwort | Rolle |
|------|----------|-------|
| admin | admin123 | Admin |
| verde | verde1 | Spieler |
| carlos2 | carlos2 | Spieler |
| ghost99 | ghost99 | Spieler |
| rookie | rookie1 | Spieler |

**Passwörter nach dem ersten Login im Admin-Panel ändern!**

## 📱 Als App installieren (PWA)

Auf dem Smartphone: Browser → "Zum Startbildschirm hinzufügen"
