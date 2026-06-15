# Matchday — Mise en production (Option B)
*Design doc — 2026-06-16*

## Contexte

Matchday est un site HTML/CSS/JS pur (sans framework) déployé sur Vercel, composé de 4 pages frontend et 11 routes API backend (Node.js serverless). L'objectif est de porter l'application au niveau commercial — fonctionnelle, sécurisée, responsive, sans erreurs visibles — en corrigeant les problèmes existants fichier par fichier sans réécriture complète.

Stack : HTML/CSS/JS vanilla · Supabase (PostgreSQL) · Stripe Checkout · Resend · Vercel

---

## Architecture — aucun changement

Les deux repos restent séparés :
- `matchday-frontend` → pages HTML servies par Vercel Static
- `matchday-backend` → serverless functions Node.js sur Vercel

---

## Périmètre des corrections

### 1. Sécurité (priorité absolue)

**Problème :** Clé Supabase (`sb_secret_[SUPPRIME]...`) exposée dans `index.html` côté client, dans l'admin panel. Le bouton `⚙ Admin` est visible par tous.

**Solution :**
- Supprimer entièrement le panel admin de `index.html` (suppression du bouton trigger, de l'overlay, du JS qui lit Supabase directement)
- La consultation de la BDD se fait via le dashboard Supabase, pas via l'app publique
- Supprimer les fonctions JS mortes `selectRole()` / `selectRegRole()` qui référencent des éléments inexistants

### 2. Backend — bugs bloquants

| Fichier | Fix |
|---|---|
| `fives.js:28` | `f.ing` → `f.lng` |
| `webhook.js:6` | Supprimer la ligne `export const config` (mélange ESM/CJS) ; ajouter `module.exports.config = { api: { bodyParser: false } }` |
| `matchs.js` | Déplacer `savePayment`, `modifier`, `inviter` à l'intérieur du bloc `if (req.method === 'POST')` |
| `checkout.js:31` | Remplacer l'URL hardcodée par `https://matchday-alpha.vercel.app` → utiliser une variable d'env `FRONTEND_URL` |
| Tous les emails | Remplacer `onboarding@resend.dev` par un domaine vérifié `noreply@matchday.fr` (ou conserver le dev domain avec un commentaire explicatif) |

### 3. Frontend — `index.html` (landing)

**Navigation mobile :** Ajouter un hamburger button (`☰`) visible uniquement sur mobile (≤900px). Au clic, un drawer slide-down affiche les liens nav avec fond sombre. Ferme au clic extérieur ou sur un lien.

**Liens morts :** 
- Footer : "Comment ça marche" → `#comment`, "Gérants" → `#gerants`, "CGU" → `#` (placeholder acceptable pour le moment), "Contact" → `#` (idem)
- "Rejoindre en tant que Five" → `/gerant`
- "En savoir plus" → `#comment`

**Dates hero :** Les match preview cards montrent des dates 2025 passées. Les remplacer par des dates calculées dynamiquement (J+2, J+5, J+7, J+9) en JS au chargement.

**Admin :** Supprimer complètement (clé exposée, bouton public).

**`selectRole`/`selectRegRole` :** Supprimer les fonctions inutilisées.

### 4. Frontend — `matchday-app-v3.html` (app joueur)

**`var(--transition)` manquant :** Ajouter `--transition: 0.15s ease;` dans `:root`.

**Favicon :** Ajouter `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` dans `<head>`.

**Toast :** Unifier le comportement avec `gerant.html` (le toast de l'app utilise `display:none` alors que gerant.html utilise opacity + transform — harmoniser sur opacity/transform).

**Responsive :** Vérifier et corriger les cas edge sur 375px : topbar, match list, modals.

### 5. Frontend — `gerant.html` (dashboard gérant)

**Navigation mobile :** La sidebar disparaît à ≤768px sans remplacement. Ajouter une bottom-nav identique à celle de l'app joueur, avec 4 items : Vue d'ensemble, Réservations, Revenus, Paramètres.

**`.btn-red` manquant :** Ajouter la classe dans le CSS du fichier.

### 6. Frontend — `reset.html`

**Police incohérente :** Remplacer `Inter` par `Barlow` + `Barlow Condensed` pour correspondre aux autres pages.

---

## Ce qui reste hors scope

- Réécriture en framework (React/Next.js)
- Vrai système de rôles avec JWT (l'auth actuelle via localStorage est acceptable pour le MVP)
- Pages CGU, Contact, blog
- Internationalisation
- Analytics / tracking

---

## Ordre d'exécution

1. Sécurité (supprimer admin panel + clé Supabase exposée)
2. Backend bugs (fives.js, webhook.js, matchs.js, checkout.js)
3. index.html (hamburger mobile, liens morts, dates dynamiques)
4. matchday-app-v3.html (var(--transition), favicon, responsive)
5. gerant.html (bottom-nav mobile, btn-red)
6. reset.html (police)
