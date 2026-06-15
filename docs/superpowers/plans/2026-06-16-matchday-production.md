# Matchday Production Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter Matchday au niveau production en corrigeant tous les bugs bloquants, la faille de sécurité critique, la navigation mobile manquante et les incohérences visuelles.

**Architecture:** Corrections fichier par fichier sur deux repos HTML/JS vanilla (frontend) et Node.js serverless (backend). Pas de refactoring de structure — on corrige dans les fichiers existants. Ordre strict : sécurité → backend → frontend.

**Tech Stack:** HTML/CSS/JS vanilla · Node.js (Vercel serverless) · Supabase · Stripe · Resend · Vercel

**Repos :**
- Frontend : `C:\projets\matchday-frontend`
- Backend : `C:\Windows\System32\matchday-backend`

---

## Fichiers modifiés

| Fichier | Repo | Ce qu'on change |
|---|---|---|
| `index.html` | frontend | Suppression admin panel + clé Supabase, hamburger mobile, liens morts, dates dynamiques |
| `api/fives.js` | backend | Typo `f.ing` → `f.lng` |
| `api/webhook.js` | backend | Suppression ligne ESM invalide `export const config` |
| `api/matchs.js` | backend | Déplacer savePayment/modifier/inviter dans le bon bloc POST |
| `api/checkout.js` | backend | Remplacer URL hardcodée par env var |
| `matchday-app-v3.html` | frontend | `--transition` dans `:root`, favicon, toast unifié, responsive 375px |
| `gerant.html` | frontend | Bottom-nav mobile, `.btn-red` dans CSS |
| `reset.html` | frontend | Police Inter → Barlow |

---

## Task 1 : Supprimer le panel admin et la clé Supabase exposée

**Fichier :** `C:\projets\matchday-frontend\index.html`

**Contexte :** La clé `sb_secret_[SUPPRIME]` est exposée publiquement dans le JS client. L'admin panel lit directement la table `users` depuis le navigateur. Tout visiteur peut l'extraire depuis les DevTools. On supprime l'intégralité du panel.

- [ ] **Étape 1 : Ouvrir `index.html` et localiser les blocs à supprimer**

Chercher et supprimer ces 4 blocs :

**Bloc 1 — CSS admin panel** (lignes ~209–284) : tout le bloc entre `/* ======================== ADMIN PANEL ======================== */` et la ligne `/* Secret admin trigger */` incluse (jusqu'à `.admin-trigger:hover { ... }`).

**Bloc 2 — HTML admin overlay** : le `<div class="admin-overlay" id="adminOverlay" ...>` complet avec tout son contenu.

**Bloc 3 — Bouton trigger** : `<button class="admin-trigger" onclick="openAdmin()">⚙ Admin</button>`

**Bloc 4 — JS admin** : dans le `<script>`, supprimer les fonctions suivantes en entier :
- `function openAdmin() { ... }`
- `function closeAdmin() { ... }`
- `function handleAdminOverlayClick(e) { ... }`
- `async function renderAdmin() { ... }` (c'est elle qui contient la clé Supabase)
- `function clearDB() { ... }`

Et supprimer aussi les fonctions mortes qui référencent des éléments inexistants :
- `function selectRole(role) { ... }`
- `function selectRegRole(role) { ... }`

- [ ] **Étape 2 : Vérifier qu'aucune référence à la clé ne subsiste**

Chercher `sb_secret` dans `index.html` — doit retourner 0 résultat.
Chercher `openAdmin` dans `index.html` — doit retourner 0 résultat.
Chercher `selectRole` dans `index.html` — doit retourner 0 résultat.

- [ ] **Étape 3 : Tester manuellement**

Ouvrir `index.html` dans un navigateur. Vérifier :
- Aucun bouton `⚙ Admin` visible en bas à droite
- Console DevTools : 0 erreur JS au chargement
- La modale auth s'ouvre normalement via "Connexion / Inscription"

- [ ] **Étape 4 : Commit**

```bash
cd "C:/projets/matchday-frontend"
git add index.html
git commit -m "security: remove exposed Supabase key and public admin panel"
```

---

## Task 2 : Corriger `fives.js` — typo `f.ing`

**Fichier :** `C:\Windows\System32\matchday-backend\api\fives.js`

**Contexte :** Ligne 28, `parseFloat(f.ing)` devrait être `parseFloat(f.lng)`. Le tri par distance géographique est cassé pour tous les utilisateurs qui activent la géolocalisation.

- [ ] **Étape 1 : Corriger la typo**

À la ligne 28 de `api/fives.js`, remplacer :
```js
distance: distance(parseFloat(lat), parseFloat(lng), f.lat, parseFloat(f.ing))
```
par :
```js
distance: distance(parseFloat(lat), parseFloat(lng), f.lat, parseFloat(f.lng))
```

- [ ] **Étape 2 : Vérifier le fichier complet**

S'assurer que la fonction `distance` en haut du fichier est bien :
```js
function distance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```
Et que le reste du fichier est inchangé.

- [ ] **Étape 3 : Commit**

```bash
cd "C:/Windows/System32/matchday-backend"
git config --global --add safe.directory "C:/Windows/System32/matchday-backend"
git add api/fives.js
git commit -m "fix: correct f.lng typo in fives distance sort"
```

---

## Task 3 : Corriger `webhook.js` — ESM/CJS invalide

**Fichier :** `C:\Windows\System32\matchday-backend\api\webhook.js`

**Contexte :** La ligne 6 `export const config = { api: { bodyParser: false } };` mélange la syntaxe ESM dans un fichier CommonJS (`module.exports`). Vercel ne peut pas parser ce fichier — le webhook Stripe échoue silencieusement, ce qui veut dire que `payment_intent_id` n'est jamais sauvegardé en base et que les remboursements automatiques ne fonctionnent pas.

- [ ] **Étape 1 : Supprimer la ligne invalide et ajouter la config correcte**

Dans `api/webhook.js`, supprimer la ligne 6 :
```js
export const config = { api: { bodyParser: false } };
```

Et ajouter à la place, **après** `module.exports = async (req, res) => {` (donc à l'intérieur de la fonction), rien — la config doit être exportée séparément. Ajouter à la **fin** du fichier, après le `};` de `module.exports` :

```js
module.exports.config = { api: { bodyParser: false } };
```

Le fichier doit ressembler à ceci :
```js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const matchId = session.metadata?.matchId;
    const paymentIntent = session.payment_intent;

    if (matchId && paymentIntent) {
      const { error } = await supabase
        .from('matchs')
        .update({ payment_intent_id: paymentIntent })
        .eq('id', matchId);
      if (error) console.error('Supabase error:', error.message);
    }
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
```

- [ ] **Étape 2 : Vérifier qu'il n'y a plus aucun `export` keyword dans le fichier**

Chercher `export` dans `webhook.js` — doit retourner 0 résultat.

- [ ] **Étape 3 : Commit**

```bash
cd "C:/Windows/System32/matchday-backend"
git add api/webhook.js
git commit -m "fix: replace invalid ESM export with CommonJS config in webhook"
```

---

## Task 4 : Corriger `matchs.js` — structure des actions POST

**Fichier :** `C:\Windows\System32\matchday-backend\api\matchs.js`

**Contexte :** Les actions `savePayment`, `modifier` et `inviter` sont actuellement en dehors du bloc `if (req.method === 'POST')`. Elles fonctionnent par chance (le corps POST est disponible dans `req.body`) mais c'est un bug structurel : elles seraient accessibles via GET ou autres méthodes HTTP.

- [ ] **Étape 1 : Réorganiser le fichier**

Remplacer le contenu complet de `api/matchs.js` par :

```js
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ---- LISTER LES MATCHS ----
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('matchs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { action } = req.body;

    // ---- CRÉER UN MATCH ----
    if (action === 'creer') {
      const { terrain, lieu, sport, date_match, heure, niveau, prix, equipe1, email1, date_iso } = req.body;
      const { data, error } = await supabase
        .from('matchs')
        .insert({ terrain, lieu, sport, date_match, heure, niveau, prix, equipe1, email1, statut: 'open', date_iso: date_iso || null })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });

      await resend.emails.send({
        from: 'Matchday <onboarding@resend.dev>',
        to: email1,
        subject: '⚽ Ton match est en ligne sur Matchday !',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#181614;color:#fff;padding:40px;">
            <div style="font-size:24px;font-weight:900;margin-bottom:24px;">Match<span style="color:#C8F520;">day</span></div>
            <p style="color:rgba(255,255,255,0.7);">Ton match <strong style="color:#C8F520;">${terrain} · ${date_match} · ${heure}</strong> est maintenant visible par tous les joueurs.</p>
            <p style="color:rgba(255,255,255,0.45);margin-top:16px;">On te notifie dès qu'un adversaire rejoint !</p>
            <div style="margin-top:32px;font-size:11px;color:rgba(255,255,255,0.2);">© 2025 Matchday</div>
          </div>
        `
      });

      return res.status(200).json({ success: true, match: data });
    }

    // ---- REJOINDRE UN MATCH ----
    if (action === 'rejoindre') {
      const { matchId, equipe2, email2 } = req.body;
      const { data: match } = await supabase
        .from('matchs')
        .select('*')
        .eq('id', matchId)
        .single();

      if (!match) return res.status(404).json({ error: 'Match introuvable.' });
      if (match.statut !== 'open') return res.status(400).json({ error: 'Ce match est déjà complet.' });

      const { error } = await supabase
        .from('matchs')
        .update({ equipe2, email2, statut: 'confirmed' })
        .eq('id', matchId);
      if (error) return res.status(500).json({ error: error.message });

      await resend.emails.send({
        from: 'Matchday <onboarding@resend.dev>',
        to: match.email1,
        subject: '🔥 Un adversaire a rejoint ton match !',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#181614;color:#fff;padding:40px;">
            <div style="font-size:24px;font-weight:900;margin-bottom:24px;">Match<span style="color:#C8F520;">day</span></div>
            <p style="color:rgba(255,255,255,0.7);font-size:16px;">Ton match est <strong style="color:#C8F520;">confirmé !</strong></p>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:20px;margin:20px 0;">
              <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:4px;">TERRAIN</div>
              <div style="font-size:16px;font-weight:700;">${match.terrain} · ${match.lieu}</div>
              <div style="margin-top:12px;font-size:11px;color:rgba(255,255,255,0.3);">DATE</div>
              <div style="font-size:14px;">${match.date_match} · ${match.heure}</div>
              <div style="margin-top:12px;font-size:11px;color:rgba(255,255,255,0.3);">ADVERSAIRE</div>
              <div style="font-size:14px;font-weight:700;color:#C8F520;">${equipe2}</div>
            </div>
            <div style="margin-top:32px;font-size:11px;color:rgba(255,255,255,0.2);">© 2025 Matchday</div>
          </div>
        `
      });

      await resend.emails.send({
        from: 'Matchday <onboarding@resend.dev>',
        to: email2,
        subject: '✅ Tu as rejoint un match Matchday !',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#181614;color:#fff;padding:40px;">
            <div style="font-size:24px;font-weight:900;margin-bottom:24px;">Match<span style="color:#C8F520;">day</span></div>
            <p style="color:rgba(255,255,255,0.7);">Tu affrontes <strong style="color:#C8F520;">${match.equipe1}</strong> !</p>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:20px;margin:20px 0;">
              <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:4px;">TERRAIN</div>
              <div style="font-size:16px;font-weight:700;">${match.terrain} · ${match.lieu}</div>
              <div style="margin-top:12px;font-size:11px;color:rgba(255,255,255,0.3);">DATE</div>
              <div style="font-size:14px;">${match.date_match} · ${match.heure}</div>
            </div>
            <div style="margin-top:32px;font-size:11px;color:rgba(255,255,255,0.2);">© 2025 Matchday</div>
          </div>
        `
      });

      return res.status(200).json({ success: true });
    }

    // ---- SAUVEGARDER PAYMENT INTENT ----
    if (action === 'savePayment') {
      const { matchId, sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId manquant.' });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session && session.payment_intent) {
        await supabase.from('matchs')
          .update({ payment_intent_id: session.payment_intent })
          .eq('id', matchId);
        return res.status(200).json({ success: true, payment_intent: session.payment_intent });
      }
      return res.status(200).json({ success: false, message: 'Pas de payment_intent trouvé.' });
    }

    // ---- MODIFIER UN MATCH ----
    if (action === 'modifier') {
      const { matchId, equipe1, niveau } = req.body;
      const { error } = await supabase.from('matchs')
        .update({ equipe1, niveau })
        .eq('id', matchId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    // ---- INVITER PAR EMAIL ----
    if (action === 'inviter') {
      const { matchId, emailInvite, inviteur } = req.body;
      const { data: match } = await supabase.from('matchs').select('*').eq('id', matchId).single();
      if (!match) return res.status(404).json({ error: 'Match introuvable.' });
      await resend.emails.send({
        from: 'Matchday <onboarding@resend.dev>',
        to: emailInvite,
        subject: `⚽ ${inviteur} t'invite à rejoindre son match !`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#181614;color:#fff;padding:40px;">
            <div style="font-size:24px;font-weight:900;margin-bottom:24px;">Match<span style="color:#C8F520;">day</span></div>
            <p style="color:rgba(255,255,255,0.7);">${inviteur} t'invite à rejoindre son match sur Matchday !</p>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:20px;margin:20px 0;">
              <div style="font-size:14px;font-weight:700;">${match.terrain} · ${match.lieu}</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:8px;">${match.date_match} · ${match.heure}</div>
            </div>
            <a href="${process.env.FRONTEND_URL || 'https://matchday-alpha.vercel.app'}/app?match=${matchId}" style="display:inline-block;background:#C8F520;color:#181614;font-weight:800;padding:14px 28px;text-decoration:none;font-size:16px;">REJOINDRE LE MATCH →</a>
            <div style="margin-top:32px;font-size:11px;color:rgba(255,255,255,0.2);">© 2025 Matchday</div>
          </div>
        `
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
```

- [ ] **Étape 2 : Vérifier la structure**

S'assurer que toutes les actions `creer`, `rejoindre`, `savePayment`, `modifier`, `inviter` sont à l'intérieur du bloc `if (req.method === 'POST') { ... }` et que chacune a son propre `return`.

- [ ] **Étape 3 : Commit**

```bash
cd "C:/Windows/System32/matchday-backend"
git add api/matchs.js
git commit -m "fix: move all POST actions inside method guard in matchs.js"
```

---

## Task 5 : Corriger `checkout.js` — URL hardcodée

**Fichier :** `C:\Windows\System32\matchday-backend\api\checkout.js`

**Contexte :** `success_url` et `cancel_url` sont hardcodés sur `matchday-alpha.vercel.app`. Si le domaine change, les retours Stripe pointent dans le vide. On utilise une variable d'environnement `FRONTEND_URL`.

- [ ] **Étape 1 : Modifier `checkout.js`**

Remplacer les lignes 31–32 :
```js
success_url: `https://matchday-alpha.vercel.app/app?payment=success&matchId=${matchId || ''}&session_id={CHECKOUT_SESSION_ID}`,
cancel_url: 'https://matchday-alpha.vercel.app/app?payment=cancel',
```
par :
```js
success_url: `${process.env.FRONTEND_URL || 'https://matchday-alpha.vercel.app'}/app?payment=success&matchId=${matchId || ''}&session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${process.env.FRONTEND_URL || 'https://matchday-alpha.vercel.app'}/app?payment=cancel`,
```

- [ ] **Étape 2 : Vérifier qu'il ne reste aucune URL hardcodée**

Chercher `matchday-alpha.vercel.app` dans `api/checkout.js` — doit retourner 0 résultat.

- [ ] **Étape 3 : Commit**

```bash
cd "C:/Windows/System32/matchday-backend"
git add api/checkout.js
git commit -m "fix: use FRONTEND_URL env var instead of hardcoded domain in checkout"
```

---

## Task 6 : `index.html` — hamburger menu mobile

**Fichier :** `C:\projets\matchday-frontend\index.html`

**Contexte :** Sur mobile (≤900px), les `.nav-links` disparaissent sans remplacement. On ajoute un bouton hamburger qui ouvre un drawer.

- [ ] **Étape 1 : Ajouter le bouton hamburger dans la nav**

Dans le `<nav>`, après `</div>` (fermeture de `.nav-links`), ajouter :
```html
<button class="nav-hamburger" id="navHamburger" onclick="toggleMobileMenu()" aria-label="Menu">
  <span></span><span></span><span></span>
</button>
```

- [ ] **Étape 2 : Ajouter le drawer mobile**

Juste après la balise fermante `</nav>`, ajouter :
```html
<div class="mobile-menu" id="mobileMenu">
  <a href="#comment" onclick="closeMobileMenu()">Comment ça marche</a>
  <a href="#fonctions" onclick="closeMobileMenu()">Fonctionnalités</a>
  <a href="#tarifs" onclick="closeMobileMenu()">Tarifs</a>
  <a href="#gerants" onclick="closeMobileMenu()">Gérants</a>
  <button class="mobile-menu-auth" onclick="closeMobileMenu(); openAuth()">Connexion / Inscription</button>
  <a href="/app" class="mobile-menu-cta" onclick="closeMobileMenu()">Accéder à l'app →</a>
</div>
<div class="mobile-menu-overlay" id="mobileMenuOverlay" onclick="closeMobileMenu()"></div>
```

- [ ] **Étape 3 : Ajouter le CSS du hamburger et du drawer**

Dans le bloc `<style>`, à la fin de la section `/* ======================== RESPONSIVE ======================== */`, ajouter :
```css
/* ======================== HAMBURGER ======================== */
.nav-hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 40px; height: 40px;
  background: none; border: none; cursor: pointer; padding: 8px;
}
.nav-hamburger span {
  display: block; width: 22px; height: 2px;
  background: rgba(255,255,255,0.7);
  transition: all 0.2s ease;
}
.nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.nav-hamburger.open span:nth-child(2) { opacity: 0; }
.nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

.mobile-menu {
  display: none;
  position: fixed; top: 56px; left: 0; right: 0; z-index: 99;
  background: var(--ink);
  border-bottom: 2px solid rgba(200,245,32,0.3);
  flex-direction: column;
  animation: slideDown 0.2s ease;
}
.mobile-menu.open { display: flex; }
.mobile-menu a, .mobile-menu button {
  padding: 16px 24px;
  font-size: 13px; font-weight: 600; letter-spacing: 1px;
  text-transform: uppercase; color: rgba(255,255,255,0.6);
  text-decoration: none;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: none; text-align: left; cursor: pointer;
  transition: color 0.12s, background 0.12s;
  font-family: 'Barlow', sans-serif;
}
.mobile-menu a:hover, .mobile-menu button:hover { color: #fff; background: rgba(255,255,255,0.04); }
.mobile-menu-auth { border: none !important; }
.mobile-menu-cta {
  background: var(--lime) !important;
  color: var(--ink) !important;
  font-family: 'Barlow Condensed', sans-serif !important;
  font-weight: 800 !important;
  text-align: center !important;
  border-bottom: none !important;
}
.mobile-menu-overlay {
  display: none;
  position: fixed; inset: 0; top: 56px; z-index: 98;
  background: rgba(0,0,0,0.5);
}
.mobile-menu-overlay.open { display: block; }

@media (max-width: 900px) {
  .nav-hamburger { display: flex; }
}
```

- [ ] **Étape 4 : Ajouter le JS du hamburger**

Dans le `<script>`, avant la ligne `// scroll reveal`, ajouter :
```js
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const overlay = document.getElementById('mobileMenuOverlay');
  const btn = document.getElementById('navHamburger');
  const isOpen = menu.classList.contains('open');
  menu.classList.toggle('open', !isOpen);
  overlay.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
}
function closeMobileMenu() {
  document.getElementById('mobileMenu').classList.remove('open');
  document.getElementById('mobileMenuOverlay').classList.remove('open');
  document.getElementById('navHamburger').classList.remove('open');
}
```

- [ ] **Étape 5 : Tester manuellement**

Ouvrir `index.html`. Réduire la fenêtre à ≤900px. Vérifier :
- Le bouton hamburger apparaît (3 barres)
- Au clic, le menu s'ouvre avec tous les liens
- Les liens de navigation font scroller vers la bonne section
- "Connexion / Inscription" ouvre la modale auth
- "Accéder à l'app →" redirige vers `/app`
- Clic sur l'overlay ferme le menu
- Les barres du hamburger s'animent en croix quand ouvert

- [ ] **Étape 6 : Commit**

```bash
cd "C:/projets/matchday-frontend"
git add index.html
git commit -m "feat: add hamburger mobile menu to landing page"
```

---

## Task 7 : `index.html` — corriger les liens morts et les dates hero

**Fichier :** `C:\projets\matchday-frontend\index.html`

**Contexte :** Plusieurs liens pointent vers `#` (morts) et les matchs du hero affichent des dates hardcodées de 2025 déjà passées.

- [ ] **Étape 1 : Corriger les liens footer**

Dans le `<footer>`, remplacer :
```html
<a href="#">Comment ça marche</a>
<a href="#">Gérants</a>
<a href="#">CGU</a>
<a href="#">Contact</a>
```
par :
```html
<a href="#comment">Comment ça marche</a>
<a href="#gerants">Gérants</a>
<a href="#tarifs">CGU</a>
<a href="mailto:contact@matchday.fr">Contact</a>
```

- [ ] **Étape 2 : Corriger le CTA "Rejoindre en tant que Five"**

Dans la section pricing, remplacer :
```html
<a href="#" class="pc-cta">Rejoindre en tant que Five</a>
```
par :
```html
<a href="/gerant" class="pc-cta">Rejoindre en tant que Five</a>
```

- [ ] **Étape 3 : Corriger le CTA "En savoir plus"**

Dans la section `.cta-section`, remplacer :
```html
<a href="#" class="btn-hero-ghost">En savoir plus</a>
```
par :
```html
<a href="#comment" class="btn-hero-ghost">En savoir plus</a>
```

- [ ] **Étape 4 : Rendre les dates hero dynamiques**

Dans le `<script>`, après `updateNavButton();`, ajouter :
```js
// Dates dynamiques dans les match preview cards
(function() {
  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }
  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const mois = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  function fmt(d) {
    return jours[d.getDay()] + ' ' + d.getDate() + ' ' + mois[d.getMonth()];
  }
  const now = new Date();
  const offsets = [2, 5, 7, 9];
  const heures = ['19h', '20h', '18h30', '10h'];
  const locs = document.querySelectorAll('.mpc-loc');
  locs.forEach((el, i) => {
    const parts = el.textContent.split('·');
    if (parts.length >= 2) {
      const venue = parts[0].trim();
      el.textContent = venue + ' · ' + fmt(addDays(now, offsets[i])) + ' · ' + heures[i];
    }
  });
})();
```

- [ ] **Étape 5 : Tester manuellement**

Ouvrir `index.html` et vérifier :
- Les dates dans les 4 match-preview-cards montrent des dates dans le futur (J+2, J+5, J+7, J+9)
- Les liens footer fonctionnent (scrollent vers la bonne section)
- "Rejoindre en tant que Five" navigue vers `/gerant`
- "En savoir plus" scrolle vers `#comment`

- [ ] **Étape 6 : Commit**

```bash
cd "C:/projets/matchday-frontend"
git add index.html
git commit -m "fix: correct dead links and make hero match dates dynamic"
```

---

## Task 8 : `matchday-app-v3.html` — corrections CSS et favicon

**Fichier :** `C:\projets\matchday-frontend\matchday-app-v3.html`

**Contexte :** `var(--transition)` est utilisé dans de nombreuses règles CSS mais n'est pas défini dans `:root`, ce qui casse toutes les transitions. Le favicon est absent.

- [ ] **Étape 1 : Ajouter `--transition` dans `:root`**

Dans le bloc `<style>`, trouver `:root {` et ajouter `--transition: 0.15s ease;` parmi les variables existantes. Le `:root` doit ressembler à :
```css
:root {
  --ink: #111010;
  --ink2: #1E1C1C;
  --paper: #F5F3EF;
  --paper2: #EDEAE4;
  --paper3: #E2DED7;
  --cream: #FAF8F4;
  --lime: #C8F520;
  --lime-dark: #9BBD0A;
  --lime-muted: rgba(200,245,32,0.10);
  --red: #D93B1A;
  --blue: #1B52CC;
  --muted: #8A8278;
  --muted2: #B5B0A8;
  --line: rgba(17,16,16,0.09);
  --line-heavy: rgba(17,16,16,0.20);
  --transition: 0.15s ease;
}
```

- [ ] **Étape 2 : Ajouter le favicon dans `<head>`**

Dans `<head>`, après `<meta name="viewport" ...>`, ajouter :
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

- [ ] **Étape 3 : Unifier le toast**

Le toast dans cette page utilise `display: none` au lieu du système opacity/transform de `gerant.html`. Trouver le CSS `#toast { ... }` et remplacer par :
```css
#toast {
  position: fixed; bottom: 24px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: var(--ink); color: var(--lime);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
  padding: 12px 28px; z-index: 400;
  border-top: 2px solid var(--lime);
  box-shadow: 4px 4px 0 rgba(0,0,0,0.2);
  opacity: 0; transition: all 0.25s; pointer-events: none; white-space: nowrap;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
```

Ensuite, dans le JS du fichier, trouver la fonction qui gère le toast (chercher `toast`) et s'assurer qu'elle utilise `.classList.add('show')` / `.classList.remove('show')` et non `style.display`. Si elle utilise `display`, remplacer par le pattern ci-dessous :

Chercher dans le JS :
```js
function showToast(
```
ou similaire, et s'assurer que le pattern est :
```js
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
```

- [ ] **Étape 4 : Vérifier responsive 375px**

Ouvrir `matchday-app-v3.html` dans le navigateur, activer DevTools → mobile 375px, et vérifier :
- Aucun scroll horizontal
- La bottom-nav est visible et ses items ne débordent pas
- La topbar ne dépasse pas de l'écran
- Les modals apparaissent correctement depuis le bas sur mobile

Si un élément déborde, noter les sélecteurs CSS à corriger — les fixes courants sont `min-width: 0` sur les flex children et `overflow-x: hidden` sur le conteneur principal.

- [ ] **Étape 5 : Commit**

```bash
cd "C:/projets/matchday-frontend"
git add matchday-app-v3.html
git commit -m "fix: add --transition var, favicon, unified toast in app"
```

---

## Task 9 : `gerant.html` — navigation mobile et `.btn-red`

**Fichier :** `C:\projets\matchday-frontend\gerant.html`

**Contexte :** Sur mobile (≤768px), la sidebar disparaît sans remplacement, rendant le dashboard inutilisable. La classe `.btn-red` est utilisée mais non définie.

- [ ] **Étape 1 : Ajouter `.btn-red` dans le CSS**

Dans le bloc `<style>` de `gerant.html`, après `.btn-outline:hover { ... }`, ajouter :
```css
.btn-red { background: rgba(217,59,26,0.15); color: var(--red); border: 1px solid rgba(217,59,26,0.3); }
.btn-red:hover { background: rgba(217,59,26,0.25); }
```

- [ ] **Étape 2 : Ajouter la bottom-nav HTML**

Juste avant le `<div id="toast"></div>` final (avant `</body>`), ajouter :
```html
<!-- BOTTOM NAV MOBILE -->
<nav class="g-bottom-nav" id="gBottomNav">
  <button class="g-bn-item active" id="gbn-overview" onclick="showPage('overview', document.getElementById('nav-overview')); gbnActive('overview')">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><rect x="2" y="2" width="7" height="7"/><rect x="11" y="2" width="7" height="7"/><rect x="2" y="11" width="7" height="7"/><rect x="11" y="11" width="7" height="7"/></svg>
    <span>Accueil</span>
  </button>
  <button class="g-bn-item" id="gbn-reservations" onclick="showPage('reservations', document.getElementById('nav-reservations')); gbnActive('reservations')">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><rect x="2" y="3" width="16" height="16" rx="2"/><path d="M13 1v4M7 1v4M2 9h16"/></svg>
    <span>Planning</span>
  </button>
  <button class="g-bn-item" id="gbn-revenus" onclick="showPage('revenus', document.getElementById('nav-revenus')); gbnActive('revenus')">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><path d="M10 2v16M5 6h7.5a2.5 2.5 0 010 5H5m0 0h8a2.5 2.5 0 010 5H5"/></svg>
    <span>Revenus</span>
  </button>
  <button class="g-bn-item" id="gbn-parametres" onclick="showPage('parametres', document.getElementById('nav-parametres')); gbnActive('parametres')">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>
    <span>Paramètres</span>
  </button>
</nav>
```

- [ ] **Étape 3 : Ajouter le CSS de la bottom-nav**

Dans le bloc `<style>`, à la fin de la section `/* ===================== RESPONSIVE ===================== */`, ajouter :
```css
/* ===================== BOTTOM NAV MOBILE ===================== */
.g-bottom-nav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--ink);
  border-top: 1px solid rgba(255,255,255,0.08);
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}
.g-bottom-nav-inner { display: flex; }
.g-bn-item {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 4px; padding: 10px 0 8px;
  background: none; border: none; cursor: pointer;
  color: rgba(255,255,255,0.35);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 10px; font-weight: 700; letter-spacing: 1px;
  text-transform: uppercase;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.g-bn-item.active { color: var(--lime); }
.g-bn-item svg { stroke: currentColor; }

@media (max-width: 768px) {
  .g-bottom-nav { display: flex; }
  .main { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
```

- [ ] **Étape 4 : Ajouter la fonction JS `gbnActive`**

Dans le `<script>` de `gerant.html`, ajouter après la définition de `doLogout()` :
```js
function gbnActive(page) {
  document.querySelectorAll('.g-bn-item').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('gbn-' + page);
  if (el) el.classList.add('active');
}
```

- [ ] **Étape 5 : Tester manuellement**

Ouvrir `gerant.html` en mobile 375px. Vérifier :
- La bottom-nav est visible avec 4 items (Accueil, Planning, Revenus, Paramètres)
- Cliquer sur chaque item charge la bonne page et met l'item actif en lime
- La page ne scroll pas horizontalement
- Le toast apparaît au-dessus de la bottom-nav (z-index)

- [ ] **Étape 6 : Commit**

```bash
cd "C:/projets/matchday-frontend"
git add gerant.html
git commit -m "feat: add mobile bottom-nav to gerant dashboard, fix btn-red"
```

---

## Task 10 : `reset.html` — cohérence typographique

**Fichier :** `C:\projets\matchday-frontend\reset.html`

**Contexte :** `reset.html` charge la police Inter alors que toutes les autres pages utilisent Barlow + Barlow Condensed. Incohérence visuelle visible sur mobile quand l'utilisateur reçoit un email de reset et clique sur le lien.

- [ ] **Étape 1 : Remplacer la police**

Dans `<head>`, remplacer :
```html
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,700;1,800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```
par :
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,700;1,800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Étape 2 : Mettre à jour les règles CSS**

Dans le `<style>` de `reset.html`, remplacer toutes les occurrences de `'Inter', sans-serif` par `'Barlow', sans-serif`. En pratique :

```css
body {
  /* ... */
  font-family: 'Barlow', sans-serif;
}
```

```css
input {
  /* ... */
  font-family: 'Barlow', sans-serif;
}
```

- [ ] **Étape 3 : Ajouter le favicon**

Dans `<head>`, après `<meta charset="UTF-8">`, ajouter :
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

- [ ] **Étape 4 : Vérifier visuellement**

Ouvrir `reset.html?token=test` dans un navigateur. Vérifier que la police du texte (labels, input, bouton submit) correspond à celle de l'app. Le logo "Matchday" en Barlow Condensed devait déjà être correct.

- [ ] **Étape 5 : Commit**

```bash
cd "C:/projets/matchday-frontend"
git add reset.html
git commit -m "fix: replace Inter with Barlow for font consistency in reset page"
```

---

## Récapitulatif des commits

| Commit | Repo | Contenu |
|---|---|---|
| `security: remove exposed Supabase key and public admin panel` | frontend | Task 1 |
| `fix: correct f.lng typo in fives distance sort` | backend | Task 2 |
| `fix: replace invalid ESM export with CommonJS config in webhook` | backend | Task 3 |
| `fix: move all POST actions inside method guard in matchs.js` | backend | Task 4 |
| `fix: use FRONTEND_URL env var instead of hardcoded domain in checkout` | backend | Task 5 |
| `feat: add hamburger mobile menu to landing page` | frontend | Task 6 |
| `fix: correct dead links and make hero match dates dynamic` | frontend | Task 7 |
| `fix: add --transition var, favicon, unified toast in app` | frontend | Task 8 |
| `feat: add mobile bottom-nav to gerant dashboard, fix btn-red` | frontend | Task 9 |
| `fix: replace Inter with Barlow for font consistency in reset page` | frontend | Task 10 |
