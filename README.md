# 🇩🇪 DeutschMeister v2 — Guide de déploiement

Assistant pédagogique IA pour l'enseignement de l'allemand — export **Word (.docx)** et **PDF** au choix.

---

## Structure du projet

```
deutschmeister/
├── public/
│   └── index.html          ← Application web complète (interface)
├── lib/
│   ├── make_docx.mjs       ← Générateur Word (Node.js / docx-js)
│   └── make_pdf.py         ← Générateur PDF (Python / ReportLab)
├── server.js               ← Serveur Node.js (API + fichiers statiques)
├── package.json
├── .env.example
└── .gitignore
```

---

## Fonctionnalités

- **Espace Professeur** : génère interrogations, fiches de cours, vocabulaire, conjugaison, corrigés et dialogues
- **Export Word (.docx)** : document modifiable dans Word, LibreOffice ou Google Docs
- **Export PDF** : document prêt à imprimer
- **Espace Élève** : tuteur IA adapté au niveau (A1 → B2), modes conversation / vocabulaire / conjugaison / correction / exercice

---

## Déploiement sur Render (RECOMMANDÉ — gratuit, zéro configuration)

**Render** est la plateforme idéale car elle gère Node.js ET Python sur le même serveur — indispensable pour générer les deux formats.

### Étape 1 — Clé API Anthropic

1. Aller sur https://console.anthropic.com
2. **API Keys** → **Create Key** → copier la clé (commence par `sk-ant-…`)
3. Coût réel : ~0,01 € par ressource générée

### Étape 2 — Compte GitHub (gratuit)

1. Aller sur https://github.com → **Sign up**
2. Créer un nouveau dépôt : bouton **+** → **New repository**
3. Nommer le dépôt `deutschmeister`, cocher **Public**, cliquer **Create**
4. Sur la page du dépôt, cliquer **"uploading an existing file"**
5. **Glisser-déposer** tous les fichiers du projet (décompressés)
6. Cliquer **Commit changes**

### Étape 3 — Déploiement sur Render

1. Aller sur https://render.com → créer un compte gratuit (avec GitHub)
2. Cliquer **New +** → **Web Service**
3. Connecter votre compte GitHub → sélectionner le dépôt `deutschmeister`
4. Remplir les champs :
   - **Name** : `deutschmeister` (ou ce que vous voulez)
   - **Runtime** : `Node`
   - **Build Command** : `npm install && pip install reportlab`
   - **Start Command** : `npm start`
5. Cliquer **Add Environment Variable** :
   - **Key** : `ANTHROPIC_API_KEY`
   - **Value** : votre clé (sk-ant-…)
6. Cliquer **Create Web Service**
7. Attendre 2–3 minutes → votre app est en ligne !

**Votre URL** : `https://deutschmeister.onrender.com` (ou similaire)

> **Note formule gratuite** : le serveur s'endort après 15 min d'inactivité et met ~30 s à se réveiller au premier accès. Pour un usage scolaire, c'est parfaitement suffisant.

---

## Test en local (sur votre ordinateur)

```bash
# 1. Prérequis : Node.js 18+ et Python 3.8+
node --version   # doit afficher v18 ou plus
python3 --version

# 2. Installer les dépendances
npm install
pip install reportlab

# 3. Configurer la clé API
cp .env.example .env
# Ouvrir .env et coller votre clé Anthropic

# 4. Démarrer
npm start

# 5. Ouvrir dans le navigateur
# → http://localhost:3000
```

---

## Alternatives d'hébergement

| Plateforme | Gratuit | Word+PDF | Simplicité |
|---|---|---|---|
| **Render** ⭐ | ✅ (pause possible) | ✅ | ★★★★★ |
| Railway | ✅ (crédit 5$/mois) | ✅ | ★★★★ |
| Fly.io | ✅ (limites) | ✅ | ★★★ |

---

*DeutschMeister v2 — Propulsé par Claude (Anthropic)*
