// =====================================================================
// Matchday gérant : infos du five enregistrées pour de vrai, créneaux
// bloqués sur le serveur, virements Stripe, export compta.
// Chargé après le script principal de gerant.html.
// =====================================================================
(function () {
  const esc = window.escHtml;

  async function api(path, opts) {
    const res = await apiFetch(path, opts);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) throw new Error((data && data.error) || 'Erreur, réessaie.');
    return data;
  }
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

  // ---------------------------------------------------------------
  // Infos du five : équipements, photos, métro, nombre de terrains
  // ---------------------------------------------------------------
  function champ(id, label, html) {
    return `<div><label style="font-size:9px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);font-family:'DM Mono',monospace;display:block;margin-bottom:6px;">${label}</label>${html}</div>`;
  }
  function installerChamps() {
    const form = document.getElementById('terrain-edit-form');
    if (!form || form.dataset.md) return;
    form.dataset.md = '1';
    form.insertAdjacentHTML('beforeend',
      champ('edit-nb', 'Nombre de terrains', '<input type="number" min="1" max="20" id="edit-nb" class="filter-select" style="width:100%;padding:10px 12px;" placeholder="1">') +
      champ('edit-metro', 'Métro / RER le plus proche', '<input type="text" id="edit-metro" class="filter-select" style="width:100%;padding:10px 12px;" placeholder="Pigalle (2, 12)">') +
      champ('edit-equip', 'Équipements', `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;">
        <label><input type="checkbox" id="edit-vestiaires"> Vestiaires</label>
        <label><input type="checkbox" id="edit-douches"> Douches</label>
        <label><input type="checkbox" id="edit-parking"> Parking</label></div>`) +
      champ('edit-photos', 'Photos du terrain (liens, une par ligne)', '<textarea id="edit-photos" class="filter-select" style="width:100%;padding:10px 12px;height:70px;resize:vertical;font-family:\'Barlow\',sans-serif;" placeholder="https://…/photo1.jpg"></textarea>') +
      champ('edit-tel', 'Téléphone du five', '<input type="tel" id="edit-tel" class="filter-select" style="width:100%;padding:10px 12px;" placeholder="01 23 45 67 89">'));
  }

  const ancienLoadFiveInfo = window.loadFiveInfo;
  window.loadFiveInfo = function (five) {
    ancienLoadFiveInfo(five);
    installerChamps();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
    const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    set('edit-nb', five.nb_terrains || 1); set('edit-metro', five.metro); set('edit-tel', five.telephone);
    set('edit-message', five.message); set('edit-photos', (five.photos || []).join('\n'));
    chk('edit-vestiaires', five.vestiaires); chk('edit-douches', five.douches); chk('edit-parking', five.parking);
    rafraichirBloques();
    statutStripe();
  };

  window.saveTerrainInfos = async function () {
    if (!(typeof currentFive !== 'undefined' && currentFive)) { showToast('SÉLECTIONNEZ UN TERRAIN'); return; }
    const v = id => (document.getElementById(id) || {}).value;
    const c = id => !!(document.getElementById(id) || {}).checked;
    try {
      await post('/api/fives', {
        action: 'update', nom: currentFive,
        prix: parseInt(v('edit-prix'), 10) || null, horaires: v('edit-horaires'), adresse: v('edit-adresse'),
        surfaces: v('edit-surfaces'), message: v('edit-message'), metro: v('edit-metro'), telephone: v('edit-tel'),
        nb_terrains: parseInt(v('edit-nb'), 10) || 1,
        vestiaires: c('edit-vestiaires'), douches: c('edit-douches'), parking: c('edit-parking'),
        photos: (v('edit-photos') || '').split('\n').map(x => x.trim()).filter(x => /^https:\/\//.test(x)).slice(0, 6)
      });
      showToast('INFOS ENREGISTRÉES ✓');
      await loadData();
    } catch (e) { showToast(e.message.toUpperCase()); }
  };

  // ---------------------------------------------------------------
  // Créneaux bloqués : sur le serveur (visibles par les joueurs)
  // Une copie est gardée dans le localStorage pour le calendrier existant.
  // ---------------------------------------------------------------
  let bloques = [];
  async function rafraichirBloques() {
    if (!(typeof currentFive !== 'undefined' && currentFive)) return;
    try {
      bloques = await api('/api/fives?bloques=' + encodeURIComponent(currentFive));
      localStorage.setItem('matchday_creneaux_bloques_' + currentFive, JSON.stringify(bloques));
    } catch (e) {}
    if (typeof renderCreneauxBloques === 'function') renderCreneauxBloques();
    if (typeof renderCalGrid === 'function') renderCalGrid();
  }
  window.getCreneauxBloques = function () { return bloques; };

  async function bloquer(date, heure, raison) {
    await post('/api/fives', { action: 'bloquer', five: currentFive, date, heure, raison: raison || null });
  }
  window.bloquerCreneau = async function () {
    const date = document.getElementById('block-date').value;
    const heure = document.getElementById('block-heure').value;
    const raison = document.getElementById('block-raison').value.trim();
    if (!date || !heure) { showToast('DATE ET HEURE REQUISES'); return; }
    try {
      await bloquer(date, heure, raison);
      ['block-date', 'block-heure', 'block-raison'].forEach(id => { document.getElementById(id).value = ''; });
      showToast('CRÉNEAU BLOQUÉ · INVISIBLE POUR LES JOUEURS');
      rafraichirBloques();
    } catch (e) { showToast(e.message.toUpperCase()); }
  };
  window.debloquerCreneau = async function (i) {
    const b = bloques[i];
    if (!b) return;
    try { await api('/api/fives?bloque=' + encodeURIComponent(b.id), { method: 'DELETE' }); showToast('CRÉNEAU DÉBLOQUÉ'); rafraichirBloques(); }
    catch (e) { showToast(e.message.toUpperCase()); }
  };
  const ancienSaveCreneau = window.saveCreneauModal;
  window.saveCreneauModal = async function () {
    const st = document.getElementById('mc-statut');
    if (st && st.value === 'bloque' && (typeof currentCreneauEdit !== 'undefined' && currentCreneauEdit)) {
      const { dateISO, heure } = currentCreneauEdit;
      try { await bloquer(dateISO, String(heure).padStart(2, '0') + ':00', document.getElementById('mc-notes').value || null); showToast('CRÉNEAU BLOQUÉ ✓'); }
      catch (e) { showToast(e.message.toUpperCase()); }
      closeCreneauModal(); rafraichirBloques();
      return;
    }
    return ancienSaveCreneau.apply(this, arguments);
  };

  // Annulation par le gérant : les deux équipes sont remboursées
  window.annulerMatchGerant = function (matchId) {
    confirmGerant('Annuler ce match ? Les deux équipes seront remboursées intégralement.', async () => {
      try { await post('/api/refund', { matchId }); showToast('MATCH ANNULÉ · REMBOURSEMENTS EN COURS ✓'); }
      catch (e) { showToast(e.message.toUpperCase()); }
      loadData();
    });
  };
  window.deleteCreneauModal = function () {
    if (!(typeof currentCreneauEdit !== 'undefined' && currentCreneauEdit) || !currentCreneauEdit.matchId) return;
    const id = currentCreneauEdit.matchId;
    closeCreneauModal();
    window.annulerMatchGerant(id);
  };

  // ---------------------------------------------------------------
  // Virements : Stripe Connect
  // ---------------------------------------------------------------
  function installerBlocStripe() {
    const page = document.getElementById('page-revenus');
    if (!page || document.getElementById('md-stripe')) return;
    const area = page.querySelector('.content-area') || page;
    area.insertAdjacentHTML('afterbegin', `<div id="md-stripe" style="border:1px solid var(--line-heavy);padding:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <div><div style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;text-transform:uppercase;">Recevoir vos paiements</div>
      <div id="md-stripe-txt" style="font-size:12px;color:var(--muted);margin-top:4px;">Vérification…</div></div>
      <button class="btn btn-lime" id="md-stripe-btn" style="display:none;" onclick="mdStripeConnect()">Configurer mes virements →</button></div>`);
  }
  async function statutStripe() {
    installerBlocStripe();
    const t = document.getElementById('md-stripe-txt'), b = document.getElementById('md-stripe-btn');
    if (!t || !(typeof currentFive !== 'undefined' && currentFive)) return;
    try {
      const s = await api('/api/gerant?stripe=1&five=' + encodeURIComponent(currentFive));
      if (s.actif) { t.innerHTML = '✅ Virements actifs : chaque réservation vous est reversée automatiquement (moins 10 % de commission Matchday).'; b.style.display = ''; b.textContent = 'Voir mon compte Stripe →'; }
      else { t.textContent = 'Pour recevoir l\'argent des réservations sur votre compte bancaire, configurez vos virements (5 minutes, via Stripe).'; b.style.display = ''; b.textContent = 'Configurer mes virements →'; }
    } catch (e) { t.textContent = e.message; }
  }
  window.mdStripeConnect = async function () {
    try { const r = await post('/api/gerant', { action: 'stripe-connect', five: currentFive }); location.href = r.url; }
    catch (e) { showToast(e.message.toUpperCase()); }
  };

  // ---------------------------------------------------------------
  // Export compta : tous les paiements reçus via Matchday
  // ---------------------------------------------------------------
  function installerExportCompta() {
    const page = document.getElementById('page-exports');
    if (!page || document.getElementById('md-export-compta')) return;
    const area = page.querySelector('.content-area');
    area.insertAdjacentHTML('afterbegin', `<div id="md-export-compta" style="border:2px solid var(--ink);padding:20px;margin-bottom:24px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;text-transform:uppercase;">Export compta</div>
      <div style="font-size:12px;color:var(--muted);margin:4px 0 12px;">Chaque paiement encaissé : date, match, montant payé, commission Matchday, montant reversé, remboursements.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;"><input type="month" id="md-export-mois" class="filter-select" value="${new Date().toISOString().slice(0, 7)}">
      <button class="btn btn-lime" onclick="mdExportCompta()">📊 Télécharger (CSV)</button></div></div>`);
  }
  window.mdExportCompta = async function () {
    const mois = document.getElementById('md-export-mois').value;
    try {
      const csv = await api(`/api/gerant?export=1&five=${encodeURIComponent(currentFive)}&mois=${encodeURIComponent(mois)}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `matchday-compta-${(currentFive || '').replace(/\W+/g, '-')}-${mois}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      showToast('EXPORT TÉLÉCHARGÉ');
    } catch (e) { showToast(e.message.toUpperCase()); }
  };

  const ancienShowPage = window.showPage;
  window.showPage = function (id, el) {
    ancienShowPage(id, el);
    if (id === 'exports') installerExportCompta();
    if (id === 'revenus') statutStripe();
  };

  // Retour de Stripe Connect
  const p = new URLSearchParams(location.search);
  if (p.get('stripe') === 'ok') { history.replaceState({}, '', location.pathname); setTimeout(() => showToast('✅ COMPTE STRIPE MIS À JOUR'), 800); }
})();
