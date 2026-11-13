// =====================================================================
// Matchday : équipes, niveau calculé, badges, classement, profil,
// liens partagés (?presence=, ?payer=, ?match=, ?equipe=, ?verifier=)
// =====================================================================
(function () {
  const MD = window.MD;
  const esc = MD.esc;
  const LOGOS = ['⚽', '🔥', '⚡', '🦁', '🐺', '🦅', '🐍', '👑', '💀', '🚀', '🌪️', '🎯'];

  // ---------------------------------------------------------------
  // Équipes
  // ---------------------------------------------------------------
  let cacheEquipes = null;
  MD.mesEquipes = async function (forcer) {
    if (!MD.connecte()) return [];
    if (cacheEquipes && !forcer) return cacheEquipes;
    cacheEquipes = await MD.api('/api/equipes?mine=1');
    return cacheEquipes;
  };

  function installerPageEquipe() {
    if (document.getElementById('page-equipe')) return;
    const nav = document.getElementById('nav-profil');
    if (nav) {
      const b = document.createElement('button');
      b.className = 'nav-item'; b.id = 'nav-equipe';
      b.innerHTML = '<span class="nav-icon">🛡️</span>Mon équipe';
      b.onclick = function () { showPage('equipe', this); };
      nav.parentNode.insertBefore(b, nav.nextSibling);
    }
    const page = document.createElement('div');
    page.className = 'page'; page.id = 'page-equipe';
    page.innerHTML = `<div class="topbar"><div class="topbar-left"><div class="page-label">Communauté</div><div class="page-title">Mon <em>équipe</em></div></div>
      <button class="btn btn-primary" onclick="MD.formEquipe()">+ Créer une équipe</button></div>
      <div class="content-area" id="equipe-contenu"></div>`;
    const main = document.querySelector('main.main');
    if (main) main.appendChild(page);
  }

  MD.chargerPageEquipe = async function () {
    const c = document.getElementById('equipe-contenu');
    if (!c) return;
    c.innerHTML = MD.chargement();
    let eqs;
    try { eqs = await MD.mesEquipes(true); } catch (e) { c.innerHTML = MD.vide('😕', 'Impossible de charger', e.message); return; }
    if (!eqs.length) {
      c.innerHTML = MD.vide('🛡️', 'Tu n\'as pas encore d\'équipe', 'Crée ton équipe : un nom, un logo, tes joueurs. Elle sera pré-remplie à chaque réservation et tu construis son palmarès.',
        `<button class="btn btn-primary" onclick="MD.formEquipe()">+ Créer mon équipe</button>`);
      return;
    }
    c.innerHTML = eqs.map(e => {
      const s = e.stats || {};
      return `<div class="md-card">
        <div class="md-card-head"><div><span class="md-logo">${esc(e.logo || '⚽')}</span><span class="md-card-titre">${esc(e.nom)}</span>
          ${e.couleur ? `<span class="md-card-lieu">${MD.pastille(e.couleur)}</span>` : ''}</div>
          ${e.capitaine ? '<span class="tag tag-lime">CAPITAINE</span>' : ''}</div>
        <div class="md-card-grid">
          <div><div class="md-k">Matchs</div><div class="md-v">${s.joues || 0}</div></div>
          <div><div class="md-k">V / N / D</div><div class="md-v">${s.victoires || 0} / ${s.nuls || 0} / ${s.defaites || 0}</div></div>
          <div><div class="md-k">Niveau</div><div class="md-v md-v-sm">${esc(s.niveau || 'Débutant')}</div><div class="md-s">${s.note ? '★ ' + s.note + ' fair-play' : ''}</div></div>
        </div>
        <div class="md-k" style="padding:0 18px;">Joueurs (${(e.membres || []).length})</div>
        <div class="md-membres">${(e.membres || []).map(mb => `<span class="md-membre">${esc(mb.nom)}${mb.capitaine ? ' ©' : ''}${e.capitaine && !mb.capitaine ? ` <button title="Retirer" onclick="MD.retirerMembre('${e.id}','${esc(mb.id)}')">✕</button>` : ''}</span>`).join('')}</div>
        <div class="md-actions">
          <button class="btn btn-lime btn-sm md-wa-solid" onclick="MD.inviterEquipe('${e.id}',${MD.js(e.nom)})">Inviter des joueurs (WhatsApp)</button>
          <button class="btn btn-outline btn-sm" onclick="MD.copier(location.origin + '/app?voir_equipe=${e.id}')">🔗 Profil public</button>
          ${e.capitaine ? `<button class="btn btn-outline btn-sm" onclick="MD.formEquipe('${e.id}')">✎ Modifier</button>` : `<button class="btn btn-sm md-danger" onclick="MD.quitterEquipe('${e.id}')">Quitter</button>`}
        </div>
      </div>`;
    }).join('');
  };

  MD.formEquipe = async function (id) {
    if (!MD.exigerConnexion()) return;
    const e = id ? ((await MD.mesEquipes()) || []).find(x => x.id === id) : null;
    MD.modal('equipe', e ? 'Modifier l\'équipe' : 'Créer mon équipe', `
      <div class="form-group"><label class="form-label">Nom</label><input class="form-input" id="eq-nom" maxlength="40" value="${esc(e ? e.nom : '')}" placeholder="Les Torpilles FC"></div>
      <div class="form-group"><label class="form-label">Logo</label><div class="md-logos">${LOGOS.map(l => `<label><input type="radio" name="eq-logo" value="${l}" ${(e ? e.logo : '⚽') === l ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div class="form-group"><label class="form-label">Couleur des maillots</label>${MD.choixCouleur('eq-couleur', e ? e.couleur : 'blanc')}</div>
      <div class="form-group"><label class="form-label">Ville</label><input class="form-input" id="eq-ville" maxlength="40" value="${esc(e ? (e.ville || '') : 'Paris')}"></div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('equipe')">Annuler</button>
      <button class="btn btn-lime" onclick="MD.validerEquipe(${e ? `'${e.id}'` : 'null'})">${e ? 'Enregistrer' : 'Créer l\'équipe'}</button></div>`, 520);
  };
  MD.validerEquipe = async function (id) {
    const nom = document.getElementById('eq-nom').value.trim();
    if (nom.length < 2) { showToast('NOM TROP COURT', 'error'); return; }
    try {
      await MD.post('/api/equipes', {
        action: id ? 'modifier' : 'creer', id, nom,
        logo: (document.querySelector('input[name="eq-logo"]:checked') || {}).value,
        couleur: (document.querySelector('input[name="eq-couleur"]:checked') || {}).value,
        ville: document.getElementById('eq-ville').value.trim()
      });
      MD.fermer('equipe'); showToast(id ? 'ÉQUIPE MISE À JOUR' : '🛡️ ÉQUIPE CRÉÉE'); MD.chargerPageEquipe();
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };
  MD.inviterEquipe = function (id, nom) {
    MD.whatsapp(`🛡️ Rejoins ${nom} sur Matchday pour nos fives : ${location.origin}/app?equipe=${id}`);
  };
  MD.quitterEquipe = async function (id) {
    if (!confirm('Quitter cette équipe ?')) return;
    try { await MD.post('/api/equipes', { action: 'quitter', id }); MD.chargerPageEquipe(); } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };
  MD.retirerMembre = async function (id, membre) {
    if (!confirm('Retirer ce joueur de l\'équipe ?')) return;
    try { await MD.post('/api/equipes', { action: 'retirer', id, membre }); MD.chargerPageEquipe(); } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };
  MD.rejoindreEquipe = async function (id) {
    if (!MD.exigerConnexion('Connecte-toi pour rejoindre l\'équipe')) return;
    try {
      const e = await MD.api('/api/equipes?id=' + encodeURIComponent(id));
      MD.modal('rejoindre-eq', 'Rejoindre une équipe', `
        <div class="md-recap"><span class="md-logo">${esc(e.logo || '⚽')}</span> <strong>${esc(e.nom)}</strong><br>${(e.membres || []).length} joueur(s)</div>
        <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('rejoindre-eq')">Non merci</button>
        <button class="btn btn-lime" onclick="MD.confirmerRejoindreEquipe('${esc(id)}')">Rejoindre l'équipe</button></div>`, 420);
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };
  MD.confirmerRejoindreEquipe = async function (id) {
    try {
      await MD.post('/api/equipes', { action: 'rejoindre', id });
      MD.fermer('rejoindre-eq'); showToast('🛡️ BIENVENUE DANS L\'ÉQUIPE');
      showPage('equipe', document.getElementById('nav-equipe'));
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };

  // Profil public d'une équipe (visible avant de la défier)
  MD.voirEquipe = async function (id) {
    MD.modal('voir-equipe', 'Profil d\'équipe', MD.chargement(), 480);
    try {
      const e = await MD.api('/api/equipes?id=' + encodeURIComponent(id));
      const s = e.stats || {};
      MD.corps('voir-equipe').innerHTML = `
        <div class="md-recap"><span class="md-logo">${esc(e.logo || '⚽')}</span> <strong>${esc(e.nom)}</strong> ${e.ville ? '· ' + esc(e.ville) : ''}</div>
        <div class="md-card-grid">
          <div><div class="md-k">Matchs</div><div class="md-v">${s.joues || 0}</div></div>
          <div><div class="md-k">V / N / D</div><div class="md-v">${s.victoires || 0} / ${s.nuls || 0} / ${s.defaites || 0}</div></div>
          <div><div class="md-k">Niveau</div><div class="md-v md-v-sm">${esc(s.niveau || '—')}</div></div>
        </div>
        <div class="md-card-grid">
          <div><div class="md-k">Fair-play</div><div class="md-v md-v-sm">${s.note ? '★ ' + s.note : 'Pas encore noté'}</div></div>
          <div><div class="md-k">Annulations</div><div class="md-v md-v-sm">${s.annulations || 0}</div></div>
          <div><div class="md-k">Joueurs</div><div class="md-v md-v-sm">${(e.membres || []).length}</div></div>
        </div>
        ${(e.derniers || []).length ? `<div class="md-k">Derniers matchs</div>${e.derniers.map(d => `<div class="md-pres-ligne">${esc(MD.fmtJour(d.date_iso))} · vs ${esc(d.adversaire)} ${d.score ? '· ' + esc(d.score) : ''}</div>`).join('')}` : ''}`;
    } catch (e) { MD.corps('voir-equipe').innerHTML = MD.vide('😕', 'Équipe introuvable', e.message); }
  };

  // ---------------------------------------------------------------
  // Stats, niveau calculé, badges (tableau de bord + profil)
  // ---------------------------------------------------------------
  window.loadRealStats = async function () {
    if (!MD.connecte()) return;
    let s;
    try { s = await MD.api('/api/matchs?mesStats=1'); } catch (e) { return; }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('db-matchs', s.joues); set('profil-matchs', s.joues);
    set('db-victoires', s.victoires != null ? s.victoires : '—'); set('profil-victoires', s.victoires != null ? s.victoires : '—');
    set('db-note', s.note ? '★ ' + s.note : '—'); set('profil-note', s.note ? '★ ' + s.note : '—');
    set('db-points', s.points); set('profil-points', s.points);
    set('db-niveau', (s.niveau || 'Débutant').toUpperCase()); set('pb-level', s.niveau || 'Débutant');
    const n = s.progression || { actuel: 0, min: 0, max: 1 };
    const pct = Math.max(0, Math.min(100, Math.round((n.actuel - n.min) / Math.max(1, n.max - n.min) * 100)));
    set('db-progress-label', `Indice ${n.actuel}`);
    set('db-progress-pct', pct + '%');
    const fill = document.getElementById('db-progress-fill'); if (fill) fill.style.width = pct + '%';
    set('db-next-level', s.prochain_niveau ? 'Prochain niveau : ' + s.prochain_niveau + ' (calculé avec tes résultats)' : 'Niveau max atteint 🏆');
    const b = document.getElementById('badges-container');
    if (b && Array.isArray(s.badges)) b.innerHTML = s.badges.map(x => `<div class="badge-item${x.ok ? '' : ' locked'}" title="${esc(x.desc || '')}"><div class="badge-icon">${esc(x.icone)}</div><div class="badge-name">${esc(x.nom)}</div></div>`).join('');
  };
  window.updateBadges = function () {};

  // ---------------------------------------------------------------
  // Classement par ville et par mois
  // ---------------------------------------------------------------
  const CL = { ville: '', mois: '' };
  function installerFiltresClassement() {
    const page = document.getElementById('page-classement');
    if (!page || page.querySelector('#cl-filtres')) return;
    const bar = document.createElement('div');
    bar.id = 'cl-filtres'; bar.className = 'filters-row';
    const mois = [];
    const d = new Date(); d.setDate(1);
    for (let i = 0; i < 6; i++) { mois.push(MD.iso(d).slice(0, 7)); d.setMonth(d.getMonth() - 1); }
    bar.innerHTML = `<select class="filter-select" id="cl-mois"><option value="">Toute la saison ${MD.saison()}</option>${mois.map(m => `<option value="${m}">${new Date(m + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`).join('')}</select>
      <select class="filter-select" id="cl-ville"><option value="">Toutes les villes</option></select>`;
    const top = page.querySelector('.topbar');
    top.parentNode.insertBefore(bar, top.nextSibling);
    bar.querySelector('#cl-mois').addEventListener('change', e => { CL.mois = e.target.value; loadClassement(); });
    bar.querySelector('#cl-ville').addEventListener('change', e => { CL.ville = e.target.value; loadClassement(); });
  }
  window.loadClassement = async function () {
    installerFiltresClassement();
    const cs = ['rank-points-container', 'rank-matchs-container', 'rank-notes-container'].map(id => document.getElementById(id));
    cs.forEach(c => { if (c) c.innerHTML = MD.chargement(); });
    let r;
    try { r = await MD.api(`/api/matchs?classement=1&ville=${encodeURIComponent(CL.ville)}&mois=${encodeURIComponent(CL.mois)}`); }
    catch (e) { cs.forEach(c => { if (c) c.innerHTML = MD.vide('😕', 'Impossible de charger', e.message); }); return; }
    const sv = document.getElementById('cl-ville');
    if (sv && r.villes && sv.options.length <= 1) r.villes.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; sv.appendChild(o); });
    const j = r.joueurs || [];
    const ligne = (p, i, val) => `<div class="md-rank${p.moi ? ' moi' : ''}"><span class="md-rank-n">${i + 1}</span><span class="md-rank-nom">${esc(p.nom)}<small>${esc(p.niveau || '')}</small></span><span class="md-rank-v">${val}</span></div>`;
    const vide = MD.vide('🏆', 'Personne au classement', 'Joue un match pour entrer dans le classement.');
    const tri = (k) => j.slice().sort((a, b) => (b[k] || 0) - (a[k] || 0));
    if (cs[0]) cs[0].innerHTML = j.length ? tri('points').map((p, i) => ligne(p, i, p.points + ' pts')).join('') : vide;
    if (cs[1]) cs[1].innerHTML = j.length ? tri('matchs').map((p, i) => ligne(p, i, p.matchs + ' matchs')).join('') : vide;
    const notes = j.filter(p => p.nb_notes >= 2).sort((a, b) => b.note - a.note);
    if (cs[2]) cs[2].innerHTML = notes.length ? notes.map((p, i) => ligne(p, i, '★ ' + p.note)).join('') : MD.vide('⭐', 'Pas encore assez de notes', 'Il faut au moins 2 notes pour apparaître ici.');
  };

  // ---------------------------------------------------------------
  // Profil : pseudo enregistré sur le serveur
  // ---------------------------------------------------------------
  async function enregistrerPseudo(pseudo) {
    const s = MD.session();
    if (!s || !pseudo || pseudo.length < 2) { showToast('PSEUDO TROP COURT', 'error'); return false; }
    try {
      await MD.post('/api/auth', { action: 'profil', pseudo });
      s.pseudo = pseudo; saveSession(s);
      ['pb-name', 'profil-pseudo', 'sfName'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = pseudo; });
      return true;
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); return false; }
  }
  window.savePseudo = async function () {
    if (await enregistrerPseudo(document.getElementById('pseudo-input').value.trim())) { showToast('PSEUDO ENREGISTRÉ'); if (typeof toggleEditPseudo === 'function') toggleEditPseudo(); }
  };
  window.obSavePseudo = async function () {
    const p = (document.getElementById('ob-pseudo') || {}).value;
    if (p && p.trim().length >= 2) await enregistrerPseudo(p.trim());
    const s = MD.session();
    if (s) localStorage.setItem('matchday_onboarding_done_' + s.email, '1');
    const o = document.getElementById('onboarding-overlay'); if (o) o.style.display = 'none';
    showToast('BIENVENUE SUR MATCHDAY ⚽');
  };

  // ---------------------------------------------------------------
  // Affichage de l'app après connexion
  // ---------------------------------------------------------------
  const ancienShow = window.agShowApp;
  window.agShowApp = function (session) {
    ancienShow(session);
    installerPageEquipe();
    const nom = session.pseudo || session.email.split('@')[0];
    ['sfName', 'pb-name'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = nom; });
    const t = document.getElementById('db-title'); if (t) t.innerHTML = `Bonjour, <em>${esc(nom)}</em>`;
    MD.majSaison();
    MD.routerLiens();
  };

  const ancienShowPage = window.showPage;
  window.showPage = function (id, el) {
    if (id === 'equipe' && !document.getElementById('page-equipe')) installerPageEquipe();
    ancienShowPage(id, el);
    if (id === 'equipe') MD.chargerPageEquipe();
    if (id === 'mes-matchs') loadMesMatchs();
  };

  MD.majSaison = function () {
    document.querySelectorAll('[data-md-saison]').forEach(el => { el.textContent = 'Saison ' + MD.saison(); });
  };

  // ---------------------------------------------------------------
  // Liens partagés : on les traite après connexion
  // ---------------------------------------------------------------
  MD.routerLiens = function () {
    let q = location.search;
    try { const saved = sessionStorage.getItem('md_apres_login'); if (saved) { q = saved; sessionStorage.removeItem('md_apres_login'); } } catch (e) {}
    const p = new URLSearchParams(q);
    const nettoyer = () => history.replaceState({}, '', location.pathname);
    if (p.get('presence')) {
      nettoyer();
      const id = p.get('presence'), e = parseInt(p.get('e'), 10) || 1;
      MD.api('/api/matchs?resume=' + encodeURIComponent(id)).then(m => {
        MD.modal('presence', 'Tu viens ?', `
          <div class="md-recap"><strong>${esc(m.terrain)}</strong><br>${esc(MD.fmtJour(m.date_iso, true))} · ${esc(m.heure || '')}<br>Équipe : ${esc(e === 2 ? (m.equipe2 || '') : m.equipe1)}</div>
          <div class="md-seg">${['oui', 'peut', 'non'].map(r => `<button class="md-seg-btn" onclick="MD.repondre('${esc(id)}',${e},'${r}')">${{ oui: '✅ Je viens', peut: '🤔 Peut-être', non: '❌ Pas dispo' }[r]}</button>`).join('')}</div>`, 440);
      }).catch(err => showToast(err.message.toUpperCase(), 'error'));
    } else if (p.get('payer')) {
      nettoyer(); MD.ouvrirPaiementPart(p.get('payer'), parseInt(p.get('e'), 10) || 1);
    } else if (p.get('equipe')) {
      nettoyer(); MD.rejoindreEquipe(p.get('equipe'));
    } else if (p.get('voir_equipe')) {
      nettoyer(); MD.voirEquipe(p.get('voir_equipe'));
    } else if (p.get('match')) {
      const id = p.get('match'); nettoyer();
      const ouvrir = () => {
        const i = (window.liveMatchData || []).findIndex(m => m.id === id);
        if (i >= 0) openRejoindre(i);
        else MD.api('/api/matchs?resume=' + encodeURIComponent(id)).then(m => {
          if (m.places_libres && m.statut !== 'cancelled') MD.demanderPlace(m);
          else showToast('CE MATCH N\'EST PLUS DISPONIBLE', 'error');
        }).catch(() => showToast('MATCH INTROUVABLE', 'error'));
      };
      if ((window.liveMatchData || []).length) ouvrir(); else loadMatchs().then(ouvrir);
    }
  };

  // Joueur seul qui demande à compléter une équipe
  MD.demanderPlace = function (m) {
    MD.modal('place', 'Compléter une équipe', `
      <div class="md-recap"><strong>${esc(m.terrain)}</strong> · ${esc(MD.fmtJour(m.date_iso, true))} · ${esc(m.heure || '')}</div>
      <p class="md-p">${m.places_libres} place(s) libre(s). Le capitaine reçoit ta demande par mail et te répond.</p>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('place')">Annuler</button>
      <button class="btn btn-lime" onclick="MD.envoyerDemandePlace('${esc(m.id)}',${m.equipe_places || 1})">Demander la place</button></div>`, 440);
  };
  MD.envoyerDemandePlace = async function (id, equipe) {
    try { await MD.post('/api/matchs', { action: 'demanderPlace', matchId: id, equipe }); MD.fermer('place'); showToast('DEMANDE ENVOYÉE AU CAPITAINE'); }
    catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };
})();
