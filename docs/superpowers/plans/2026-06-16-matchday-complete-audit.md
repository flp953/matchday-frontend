# Matchday — Audit complet + corrections production

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter Matchday au niveau commercialisable en corrigeant tous les bugs visibles, compléter les fonctionnalités manquantes, et garantir une UX sans friction.

**Architecture:** Corrections dans les 4 fichiers HTML frontend. Backend inaccessible en écriture (C:\Windows\System32 nécessite admin) — les fonctionnalités sans backend reçoivent un localStorage fallback robuste.

**Tech Stack:** HTML/CSS/JS vanilla · Supabase · Stripe Checkout · Resend · Vercel

---

## AUDIT — État du projet (2026-06-16)

### Fichiers modifiés dans ce plan

| Fichier | Problème(s) | Priorité |
|---|---|---|
| `matchday-app-v3.html` | Toast cassé (2 définitions conflictuelles), IA Score sans clé API, notation backend manquant, window.confirm moche | CRITIQUE |
| `index.html` | Footer : 2 liens morts, copyright 2025 | MINEUR |

### Ce qui fonctionne déjà (ne pas toucher)
- Auth gate complet (login/register/reset)
- Onboarding 2 étapes avec pseudo
- Création match + Stripe checkout
- Rejoindre match + Stripe checkout
- Annulation match
- Dashboard profil + badges
- Géolocalisation Five
- Sélection créneau Five
- Classement (sans notes car /api/notations absent)
- Chat localStorage (single-device)
- Scores localStorage
- Gérant : revenus, réservations, exports CSV/JSON/PDF, alertes, blacklist, planning
- Toute la navigation desktop + mobile (sidebar, bottom-nav)
- Responsive 375px vérifié

### Bugs confirmés

#### CRITIQUE 1 : Toast invisible dans matchday-app-v3.html
- Ligne 3260 : `showToast` version 1 (utilise `.classList.add('show')`) ← correct
- Ligne 4816 : `showToast` version 2 (utilise `t.style.display = 'block'`) ← écrase la version 1
- CSS #toast utilise `opacity: 0` par défaut et `.show { opacity: 1 }` — pas `display: none/block`
- Résultat : tous les toasts sont invisibles car `display: block` n'affecte pas `opacity: 0`
- Fix : supprimer la version 1 (ligne 3260), corriger la version 2 pour utiliser classList

#### CRITIQUE 2 : IA Score — appel direct à api.anthropic.com sans clé API
- Ligne 4382 : `fetch('https://api.anthropic.com/v1/messages', ...)` sans Authorization header
- Résultat : 401 Unauthorized, la feature est cassée + security issue (CORS)
- Fix : remplacer par UI "Fonctionnalité bientôt disponible" ou supprimer le bouton

#### IMPORTANT 3 : Notation — /api/notations n'existe pas
- `confirmerNotation()` POST vers `/api/notations` qui n'est pas dans les routes backend
- Résultat : les notes ne sont jamais sauvegardées
- Fix : localStorage fallback + affichage depuis localStorage

#### MINEUR 4 : Footer index.html — liens morts + copyright
- `#` pour CGU et Contact dans le footer
- "© 2025 Matchday" → devrait être 2026
- Fix : Contact → `mailto:hello@matchday.fr`, CGU → garder `#` (acceptable), copyright → 2026

#### MINEUR 5 : window.confirm() pour annulation match
- `confirmAction()` utilise `window.confirm()` natif — bloqué par certains navigateurs, UX primitive
- Fix : mini-modal de confirmation intégrée

---

## Task 1 : Fix toast invisible

**Fichier :** `C:\projets\matchday-frontend\matchday-app-v3.html`

**Files:**
- Modify: `matchday-app-v3.html` (lignes 3260-3264 et 4816-4837)

- [ ] **Step 1 : Supprimer la première définition de showToast (ligne 3260)**

Trouver et supprimer le bloc :
```js
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
```

- [ ] **Step 2 : Corriger la deuxième définition (ligne 4816)**

Remplacer :
```js
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (type === 'error') {
    t.style.background = 'var(--red)';
    t.style.color = '#fff';
    t.style.borderTopColor = '#ff6b4a';
  } else {
    t.style.background = '';
    t.style.color = '';
    t.style.borderTopColor = '';
  }
  t.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.style.display = 'none';
    t.style.background = '';
    t.style.color = '';
    t.style.borderTopColor = '';
  }, 3200);
}
```
par :
```js
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle('toast-error', type === 'error');
  clearTimeout(window._toastTimer);
  t.classList.add('show');
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
```

- [ ] **Step 3 : Ajouter CSS pour toast-error**

Dans le bloc `<style>`, après `#toast.show { ... }`, ajouter :
```css
#toast.toast-error { background: var(--red); color: #fff; border-top-color: #ff6b4a; }
```

- [ ] **Step 4 : Vérifier que showError() utilise aussi le bon pattern**

Localiser `function showError(msg, duration)` (ligne 4692) et remplacer par :
```js
function showError(msg, duration) {
  showToast(msg, 'error');
}
```

- [ ] **Step 5 : Commit**

```bash
git add matchday-app-v3.html
git commit -m "fix: repair invisible toast — remove duplicate showToast, use classList pattern"
```

---

## Task 2 : Fix IA Score — supprimer l'appel direct API

**Fichier :** `C:\projets\matchday-frontend\matchday-app-v3.html`

- [ ] **Step 1 : Remplacer analyserScoreIA()**

Remplacer la fonction entière `async function analyserScoreIA()` par :
```js
async function analyserScoreIA() {
  const resultEl = document.getElementById('score-ai-result');
  const btn = document.getElementById('score-ai-btn');
  resultEl.style.cssText = 'display:block;margin-top:12px;padding:14px;font-size:12px;line-height:1.6;background:rgba(138,130,120,0.08);border:1px solid var(--line-heavy);color:var(--muted);';
  resultEl.innerHTML = '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;font-family:\'DM Mono\',monospace;">✦ Vérification IA</div>Fonctionnalité bientôt disponible. Le score que tu as saisi sera enregistré tel quel.';
  btn.style.display = 'none';
}
```

- [ ] **Step 2 : Commit**

```bash
git add matchday-app-v3.html
git commit -m "fix: remove direct Anthropic API call from browser (no key, security issue)"
```

---

## Task 3 : Fix notation — localStorage fallback

**Fichier :** `C:\projets\matchday-frontend\matchday-app-v3.html`

- [ ] **Step 1 : Remplacer confirmerNotation()**

Remplacer la fonction `async function confirmerNotation()` par :
```js
async function confirmerNotation() {
  const session = getSession();
  if (!session) return;
  if (!notationCurrent.note) { showToast('CHOISIS UNE NOTE'); return; }

  const noteData = {
    match_id: notationCurrent.matchId,
    noteur_email: session.email,
    note_email: notationCurrent.noteEmail,
    note: notationCurrent.note,
    commentaire: document.getElementById('noter-commentaire').value,
    created_at: new Date().toISOString()
  };

  // Sauvegarde localStorage
  const key = 'matchday_notes';
  const saved = JSON.parse(localStorage.getItem(key) || '[]');
  const exists = saved.find(n => n.match_id === noteData.match_id && n.noteur_email === noteData.noteur_email);
  if (!exists) saved.push(noteData);
  else Object.assign(exists, noteData);
  localStorage.setItem(key, JSON.stringify(saved));

  // Tentative API (silencieuse si échoue)
  try {
    await fetch('https://matchday-backend-eight.vercel.app/api/notations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noteData)
    });
  } catch(e) {}

  closeModal('noter');
  showToast('⭐ NOTE ENVOYÉE · MERCI !');
}
```

- [ ] **Step 2 : Corriger loadAvisProfil pour utiliser localStorage en fallback**

Dans `async function loadAvisProfil(email)`, modifier le catch pour afficher les notes localStorage :
```js
async function loadAvisProfil(email) {
  const container = document.getElementById('avis-container');
  if (!container) return;

  // Notes localStorage (fallback immédiat)
  const localNotes = JSON.parse(localStorage.getItem('matchday_notes') || '[]').filter(n => n.note_email === email);

  try {
    const res = await fetch(`https://matchday-backend-eight.vercel.app/api/notations?email=${encodeURIComponent(email)}`);
    const notes = res.ok ? await res.json() : localNotes;
    renderNotes(container, notes);
  } catch(e) {
    renderNotes(container, localNotes);
  }
}

function renderNotes(container, notes) {
  if (!notes || !notes.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">Aucun avis reçu pour l\'instant.</div>';
    return;
  }
  container.innerHTML = notes.map(n => `
    <div class="mini-match-row" style="flex-direction:column;align-items:flex-start;padding:14px 0;gap:6px;">
      <div style="display:flex;align-items:center;gap:10px;width:100%;">
        <span style="color:var(--lime);font-size:16px;">${'★'.repeat(n.note)}${'☆'.repeat(5-n.note)}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto;">${new Date(n.created_at||Date.now()).toLocaleDateString('fr-FR')}</span>
      </div>
      ${n.commentaire ? `<div style="font-size:13px;color:rgba(0,0,0,0.6);font-style:italic;">"${n.commentaire}"</div>` : ''}
    </div>
  `).join('');
}
```

- [ ] **Step 3 : Corriger loadClassement pour utiliser localStorage**

Dans `async function loadClassement()`, modifier pour utiliser localStorage si API échoue :
```js
// Remplacer
const notes = resNotes.ok ? await resNotes.json() : [];
// par
const notes = resNotes.ok ? await resNotes.json() : JSON.parse(localStorage.getItem('matchday_notes') || '[]');
```

- [ ] **Step 4 : Commit**

```bash
git add matchday-app-v3.html
git commit -m "fix: localStorage fallback for ratings when /api/notations unreachable"
```

---

## Task 4 : Fix footer index.html

**Fichier :** `C:\projets\matchday-frontend\index.html`

- [ ] **Step 1 : Corriger Contact et copyright**

Dans le footer, remplacer :
```html
<a href="#">CGU</a>
<a href="#">Contact</a>
```
par :
```html
<a href="#">CGU</a>
<a href="mailto:hello@matchday.fr">Contact</a>
```

Remplacer :
```html
<div class="footer-copy">© 2025 Matchday</div>
```
par :
```html
<div class="footer-copy">© 2026 Matchday</div>
```

- [ ] **Step 2 : Commit**

```bash
git add index.html
git commit -m "fix: footer contact link and copyright year"
```

---

## Task 5 : Fix window.confirm — modal de confirmation

**Fichier :** `C:\projets\matchday-frontend\matchday-app-v3.html`

- [ ] **Step 1 : Ajouter le HTML de la mini-modal de confirmation**

Après `<div id="toast"></div>`, ajouter :
```html
<div id="confirm-overlay" style="display:none;position:fixed;inset:0;background:rgba(26,26,26,0.7);z-index:500;align-items:center;justify-content:center;padding:20px;">
  <div style="background:var(--paper);border-top:3px solid var(--ink);padding:28px;width:100%;max-width:400px;">
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;text-transform:uppercase;margin-bottom:12px;" id="confirm-message"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
      <button class="btn btn-outline" onclick="closeConfirm(false)">Annuler</button>
      <button class="btn btn-primary" id="confirm-ok-btn" onclick="closeConfirm(true)">Confirmer</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2 : Remplacer confirmAction() dans le JS**

Remplacer :
```js
function confirmAction(message, onConfirm) {
  // Simple confirm natif pour l'instant
  if (window.confirm(message)) onConfirm();
}
```
par :
```js
let _confirmCallback = null;

function confirmAction(message, onConfirm) {
  _confirmCallback = onConfirm;
  document.getElementById('confirm-message').textContent = message;
  const overlay = document.getElementById('confirm-overlay');
  overlay.style.display = 'flex';
}

function closeConfirm(ok) {
  document.getElementById('confirm-overlay').style.display = 'none';
  if (ok && _confirmCallback) _confirmCallback();
  _confirmCallback = null;
}
```

- [ ] **Step 3 : Commit**

```bash
git add matchday-app-v3.html
git commit -m "fix: replace native window.confirm with inline modal for match cancellation"
```
