// =====================================================================
// Matchday : trouver un match, créer un match, rejoindre un match
// =====================================================================
(function () {
  const MD = window.MD;
  const esc = MD.esc;

  // État des filtres de la page "Trouver un match"
  const F = MD.filtres = { quand: 'tout', date: null, heure: 'tout', pres: false, niveau: '', q: '' };
  MD.tousMatchs = [];

  // ---------------------------------------------------------------
  // Barre de filtres (remplace l'ancienne)
  // ---------------------------------------------------------------
  function installerFiltres() {
    const bar = document.querySelector('#page-matchs .filters-bar');
    const row = document.querySelector('#page-matchs .filters-row');
    if (!bar || !row || bar.dataset.md) return;
    bar.dataset.md = '1';
    bar.innerHTML = [
      ['tout', 'Tous les jours'], ['soir', 'Ce soir'], ['demain', 'Demain'], ['weekend', 'Ce week-end'], ['date', '📅 Choisir']
    ].map(([v, l]) => `<button class="filter-tab${v === 'tout' ? ' active' : ''}" data-quand="${v}">${l}</button>`).join('')
      + `<input type="date" id="md-f-date" class="md-f-date" style="display:none;">`;
    row.innerHTML = `
      <input type="text" id="filter-search" class="search-input" placeholder="Five, quartier, équipe…">
      <select class="filter-select" id="md-f-heure">
        <option value="tout">Toutes heures</option>
        <option value="avant18">Avant 18h</option>
        <option value="apres19">Après 19h</option>
        <option value="apres21">Après 21h</option>
      </select>
      <select class="filter-select" id="filter-niveau">
        <option value="">Tous niveaux</option><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option>
      </select>
      <button class="btn btn-outline btn-sm" id="md-f-pres">📍 Près de moi</button>
      <button class="btn btn-outline btn-sm" id="filter-reset" onclick="resetFiltres()">✕</button>`;

    bar.querySelectorAll('[data-quand]').forEach(b => b.addEventListener('click', () => {
      bar.querySelectorAll('[data-quand]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      F.quand = b.dataset.quand;
      const di = document.getElementById('md-f-date');
      di.style.display = F.quand === 'date' ? '' : 'none';
      if (F.quand === 'date') { di.min = MD.aujourdhui(); di.value = F.date || MD.aujourdhui(); F.date = di.value; }
      appliquerFiltres();
    }));
    document.getElementById('md-f-date').addEventListener('change', e => { F.date = e.target.value; appliquerFiltres(); });
    document.getElementById('filter-search').addEventListener('input', e => { F.q = e.target.value.trim().toLowerCase(); appliquerFiltres(); });
    document.getElementById('md-f-heure').addEventListener('change', e => { F.heure = e.target.value; appliquerFiltres(); });
    document.getElementById('filter-niveau').addEventListener('change', e => { F.niveau = e.target.value; appliquerFiltres(); });
    document.getElementById('md-f-pres').addEventListener('click', async e => {
      F.pres = !F.pres;
      e.currentTarget.classList.toggle('md-on', F.pres);
      if (F.pres && !MD.position()) {
        showToast('LOCALISATION…');
        if (!await MD.localiser()) { F.pres = false; e.currentTarget.classList.remove('md-on'); showToast('LOCALISATION REFUSÉE', 'error'); }
      }
      appliquerFiltres();
    });

    // L'ancien en-tête de tableau ne correspond plus à la liste par jour
    const head = document.querySelector('#page-matchs .match-table-header');
    if (head) head.style.display = 'none';
  }

  function correspond(m) {
    const iso = m.date_iso;
    const auj = MD.aujourdhui();
    if (F.quand === 'soir' && iso !== auj) return false;
    if (F.quand === 'demain' && iso !== MD.iso(new Date(Date.now() + 86400000))) return false;
    if (F.quand === 'weekend') {
      if (!iso) return false;
      const d = new Date(iso + 'T12:00:00'), jour = d.getDay();
      const ecart = (d - new Date(auj + 'T12:00:00')) / 86400000;
      if (!(jour === 0 || jour === 6 || (jour === 5 && (MD.minutesDebut(m.heure) || 0) >= 18 * 60)) || ecart > 7) return false;
    }
    if (F.quand === 'date' && F.date && iso !== F.date) return false;
    const min = MD.minutesDebut(m.heure);
    if (F.heure === 'avant18' && !(min != null && min < 18 * 60)) return false;
    if (F.heure === 'apres19' && !(min != null && min >= 19 * 60)) return false;
    if (F.heure === 'apres21' && !(min != null && min >= 21 * 60)) return false;
    if (F.quand === 'soir' && min != null && min < 17 * 60) return false;
    if (F.niveau && m.niveau && m.niveau !== F.niveau) return false;
    if (F.q) {
      const txt = [m.terrain, m.lieu, m.ville, m.equipe1, m.equipe2].join(' ').toLowerCase();
      if (!txt.includes(F.q)) return false;
    }
    if (F.pres) {
      const km = m._km;
      if (km == null || km > 8) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------
  // Chargement et affichage
  // ---------------------------------------------------------------
  window.loadMatchs = async function () {
    installerFiltres();
    const c = document.getElementById('match-rows-container');
    if (c && !MD.tousMatchs.length) c.innerHTML = MD.chargement('Chargement des matchs…');
    try {
      const [liste] = await Promise.all([MD.api('/api/matchs'), MD.fives.length ? null : MD.chargerFives()]);
      MD.tousMatchs = Array.isArray(liste) ? liste : [];
      const pos = MD.position();
      window.liveMatchData = MD.tousMatchs.filter(m => {
        if (m.statut !== 'open' || m.type === 'terrain') return false;
        const d = MD.dateDebut(m);
        if (!d) return false;
        return d.getTime() > Date.now() - 30 * 60000;
      }).map(m => {
        const f = MD.five(m.terrain);
        m._km = pos && f ? MD.distanceKm(pos, { lat: f.lat, lng: parseFloat(f.lng) }) : null;
        return m;
      }).sort((a, b) => MD.dateDebut(a) - MD.dateDebut(b));
      appliquerFiltres();
    } catch (e) {
      if (c) c.innerHTML = MD.vide('📡', 'Impossible de charger les matchs', 'Vérifie ta connexion et réessaie.', `<button class="btn btn-primary" onclick="loadMatchs()">Réessayer</button>`);
    }
  };

  window.appliquerFiltres = function () {
    const data = (window.liveMatchData || []).filter(correspond);
    const cnt = document.getElementById('matches-count');
    if (cnt) cnt.textContent = data.length + ' match' + (data.length > 1 ? 's' : '');
    window.renderMatchRows(data);
  };

  window.resetFiltres = function () {
    Object.assign(F, { quand: 'tout', date: null, heure: 'tout', pres: false, niveau: '', q: '' });
    const bar = document.querySelector('#page-matchs .filters-bar');
    if (bar) bar.querySelectorAll('[data-quand]').forEach(b => b.classList.toggle('active', b.dataset.quand === 'tout'));
    ['filter-search', 'filter-niveau'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const h = document.getElementById('md-f-heure'); if (h) h.value = 'tout';
    const d = document.getElementById('md-f-date'); if (d) d.style.display = 'none';
    const p = document.getElementById('md-f-pres'); if (p) p.classList.remove('md-on');
    appliquerFiltres();
  };

  // Équipes qui cherchent un ou plusieurs joueurs pour compléter
  function blocJoueursRecherches() {
    const liste = (MD.tousMatchs || []).filter(m => m.statut !== 'cancelled' && m.statut !== 'pending_payment'
      && ((m.places_libres1 || 0) + (m.places_libres2 || 0)) > 0 && !MD.estPasse(m));
    if (!liste.length) return '';
    MD._besoins = liste;
    return `<div class="md-jour">🙋 Équipes qui cherchent des joueurs</div>` + liste.map((m, i) => {
      const eq = (m.places_libres1 || 0) > 0 ? 1 : 2;
      const n = eq === 1 ? m.places_libres1 : m.places_libres2;
      const min = MD.minutesDebut(m.heure);
      return `<div class="md-match" onclick="MD.demanderPlace(Object.assign({}, MD._besoins[${i}], {places_libres:${n}, equipe_places:${eq}}))">
        <div class="md-match-heure">${min != null ? MD.fmtHeure(min) : ''}<small>${esc(MD.fmtJour(m.date_iso))}</small></div>
        <div class="md-match-lieu"><div class="venue-name">${esc(m.terrain)}</div><div class="venue-loc">${esc(m.lieu || '')}</div></div>
        <div class="md-match-equipe"><div class="team-name-sm">${esc(eq === 1 ? m.equipe1 : m.equipe2)}</div><span class="md-stats">cherche ${n} joueur${n > 1 ? 's' : ''}</span></div>
        <div class="md-match-niveau">${MD.niveauTag(m.niveau)}</div>
        <div class="md-match-prix">${MD.prixTerrain(m) ? MD.euros(MD.parJoueur(MD.prixTerrain(m), 10)) + '<small>/joueur</small>' : ''}</div>
        <div class="md-match-action"><button class="btn btn-outline btn-sm">Je complète</button></div>
      </div>`;
    }).join('');
  }

  window.renderMatchRows = function (data) {
    const c = document.getElementById('match-rows-container');
    if (!c) return;
    renderListe(c, data);
    c.insertAdjacentHTML('beforeend', blocJoueursRecherches());
  };

  function renderListe(c, data) {
    if (!data || !data.length) {
      const filtre = F.quand !== 'tout' || F.heure !== 'tout' || F.niveau || F.q || F.pres;
      c.innerHTML = MD.vide('⚽',
        filtre ? 'Personne ne cherche encore pour ces critères' : 'Aucune équipe ne cherche d\'adversaire pour l\'instant',
        'Crée le match : il apparaîtra ici et on prévient les équipes qui ont une alerte qui correspond. Ou laisse-nous te prévenir dès qu\'un match tombe.',
        `<button class="btn btn-primary" onclick="openModal('creer')">+ Créer le match</button>
         <button class="btn btn-outline" onclick="MD.alerteDepuisFiltres()">🔔 Me prévenir</button>`);
      return;
    }
    let jour = null, html = '';
    data.forEach(m => {
      if (m.date_iso !== jour) {
        jour = m.date_iso;
        html += `<div class="md-jour">${esc(MD.fmtJour(jour, true))}</div>`;
      }
      const i = window.liveMatchData.indexOf(m);
      const prix = MD.prixTerrain(m);
      const pj = MD.parJoueur(prix, 10);
      const min = MD.minutesDebut(m.heure);
      html += `<div class="md-match" onclick="openRejoindre(${i})">
        <div class="md-match-heure">${min != null ? MD.fmtHeure(min) : esc(m.heure || '—')}<small>${m.duree ? m.duree + ' min' : ''}</small></div>
        <div class="md-match-lieu">
          <div class="venue-name">${esc(m.terrain)}</div>
          <div class="venue-loc">${esc(m.lieu || '')}${m._km != null ? ' · ' + MD.fmtKm(m._km) : ''}</div>
        </div>
        <div class="md-match-equipe">
          <div class="team-name-sm">${esc(m.equipe1 || 'Équipe')}</div>
          ${MD.blocStats(m.stats1)}
        </div>
        <div class="md-match-niveau">${MD.niveauTag(m.niveau)}</div>
        <div class="md-match-prix">${pj ? MD.euros(pj) + '<small>/joueur</small>' : ''}</div>
        <div class="md-match-action"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openRejoindre(${i})">Défier</button></div>
      </div>`;
    });
    c.innerHTML = html;
  }

  window.startMatchPolling = function () {
    if (window._matchPollInterval) clearInterval(window._matchPollInterval);
    window._matchPollInterval = setInterval(() => {
      const page = document.getElementById('page-matchs');
      if (page && page.classList.contains('active') && !document.hidden) loadMatchs();
    }, 30000);
  };

  // ---------------------------------------------------------------
  // Rejoindre un match (défier une équipe)
  // ---------------------------------------------------------------
  window.openRejoindre = async function (i) {
    const m = (window.liveMatchData || [])[i];
    if (!m) return;
    MD.matchCourant = m;
    if (!MD.exigerConnexion('Connecte-toi pour défier cette équipe')) return;
    const prix = MD.prixTerrain(m);
    const part = prix ? Math.round(prix / 2) : 40;
    const f = MD.five(m.terrain);
    let equipeParDefaut = '';
    MD.equipeRejoindre = null;
    try { const mes = await MD.mesEquipes(); if (mes[0]) { equipeParDefaut = mes[0].nom; MD.equipeRejoindre = mes[0].id; } } catch (e) {}
    const s = MD.session();
    equipeParDefaut = equipeParDefaut || (s && (s.pseudo || s.email.split('@')[0])) || '';

    MD.modal('rejoindre2', 'Défier cette équipe', `
      <div class="md-recap">
        <div><strong>${esc(m.terrain)}</strong> · ${esc(m.lieu || '')}</div>
        <div>${esc(MD.fmtJour(m.date_iso, true))} · ${MD.minutesDebut(m.heure) != null ? MD.fmtPlage(MD.minutesDebut(m.heure), m.duree) : esc(m.heure)}</div>
        ${f ? `<a href="${MD.lienMaps(f, m)}" target="_blank" rel="noopener" class="md-lien">Voir l'itinéraire →</a>` : ''}
      </div>
      <div class="md-adversaire">
        <div class="form-label">Ton adversaire</div>
        <div class="md-adv-nom">${esc(m.equipe1 || 'Équipe')} ${m.couleur1 ? '<span class="md-maillot">' + MD.pastille(m.couleur1) + '</span>' : ''}</div>
        <div>${MD.niveauTag(m.niveau)} ${MD.blocStats(m.stats1)}</div>
        ${m.equipe1_id ? `<button class="md-lien" onclick="MD.voirEquipe('${esc(m.equipe1_id)}')">Voir son profil d'équipe →</button>` : ''}
      </div>
      <div class="form-group"><label class="form-label">Ton équipe</label>
        <input type="text" class="form-input" id="rj2-equipe" maxlength="40" value="${esc(equipeParDefaut)}"></div>
      <div class="form-group"><label class="form-label">Couleur de vos maillots</label>
        ${MD.choixCouleur('rj2-couleur', m.couleur1 === 'blanc' ? 'noir' : 'blanc', m.couleur1)}</div>
      ${MD.blocPaiement('rj2', prix, 'match')}
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="MD.fermer('rejoindre2')">Annuler</button>
        <button class="btn btn-lime" id="rj2-btn" onclick="confirmJoin()">Payer et rejoindre →</button>
      </div>`, 540);
    MD.majPaiement('rj2', prix, 'match');
  };

  window.confirmJoin = async function () {
    const m = MD.matchCourant;
    if (!m) return;
    const nom = (document.getElementById('rj2-equipe').value || '').trim();
    if (nom.length < 2) { showToast("DONNE UN NOM À TON ÉQUIPE", 'error'); return; }
    const couleur = (document.querySelector('input[name="rj2-couleur"]:checked') || {}).value || null;
    const p = MD.lirePaiement('rj2');
    const btn = document.getElementById('rj2-btn');
    btn.disabled = true; btn.textContent = 'Redirection vers le paiement…';
    try {
      const r = await MD.post('/api/checkout', { role: 'rejoindre', matchId: m.id, mode: p.mode, nbJoueurs: p.nb, equipe_nom: nom, couleur, equipe_id: MD.equipeRejoindre });
      localStorage.setItem('matchday_pending_match', m.id);
      location.href = r.url;
    } catch (e) {
      showToast(e.message.toUpperCase(), 'error');
      btn.disabled = false; btn.textContent = 'Payer et rejoindre →';
    }
  };

  // ---------------------------------------------------------------
  // Bloc paiement commun (créer / rejoindre)
  // type 'match' : chaque équipe paie la moitié du terrain
  // type 'terrain' : une seule équipe paie tout le terrain
  // ---------------------------------------------------------------
  MD.ACOMPTE = 20;
  MD.blocPaiement = function (pfx, prix, type) {
    const nbDef = type === 'terrain' ? 10 : 5;
    return `<div class="form-label" style="margin-top:6px;">Paiement</div>
      <div class="pay-opts md-pay3" id="${pfx}-pay">
        <div class="pay-opt sel" data-mode="acompte" onclick="MD.choisirPaiement('${pfx}',this)">
          <div class="po-label">Acompte</div><div class="po-amount">${MD.ACOMPTE} €</div>
          <div class="po-desc">Le reste sur place</div></div>
        <div class="pay-opt" data-mode="total" onclick="MD.choisirPaiement('${pfx}',this)">
          <div class="po-label">Tout en ligne</div><div class="po-amount" id="${pfx}-total-amt">—</div>
          <div class="po-desc">Rien à payer sur place</div></div>
        <div class="pay-opt" data-mode="partage" onclick="MD.choisirPaiement('${pfx}',this)">
          <div class="po-label">Chacun sa part</div><div class="po-amount" id="${pfx}-part-amt">—</div>
          <div class="po-desc">Tu envoies un lien à tes potes</div></div>
      </div>
      <div class="md-nb" id="${pfx}-nb-wrap" style="display:none;">
        <label class="form-label">Combien de joueurs se partagent ?</label>
        <select class="form-input" id="${pfx}-nb" onchange="MD.majPaiement('${pfx}',${prix || 0},'${type}')">
          ${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option ${n === nbDef ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="pay-summary" id="${pfx}-resume"></div>`;
  };
  MD.choisirPaiement = function (pfx, el) {
    el.parentNode.querySelectorAll('.pay-opt').forEach(p => p.classList.remove('sel'));
    el.classList.add('sel');
    document.getElementById(pfx + '-nb-wrap').style.display = el.dataset.mode === 'partage' ? '' : 'none';
    const prix = el.closest('.md-modal').dataset.prix;
    MD.majPaiement(pfx, parseFloat(prix) || 0, el.closest('.md-modal').dataset.type);
  };
  MD.lirePaiement = function (pfx) {
    const sel = document.querySelector('#' + pfx + '-pay .pay-opt.sel');
    const nb = parseInt((document.getElementById(pfx + '-nb') || {}).value, 10) || 5;
    return { mode: sel ? sel.dataset.mode : 'acompte', nb };
  };
  MD.majPaiement = function (pfx, prix, type) {
    const modal = document.getElementById(pfx + '-pay').closest('.md-modal');
    modal.dataset.prix = prix || 0; modal.dataset.type = type;
    const part = type === 'terrain' ? (prix || 0) : Math.round((prix || 0) / 2);
    const { mode, nb } = MD.lirePaiement(pfx);
    const parJ = MD.parJoueur(prix, type === 'terrain' ? 10 : 10);
    const t = document.getElementById(pfx + '-total-amt'); if (t) t.textContent = part ? part + ' €' : '—';
    const pa = document.getElementById(pfx + '-part-amt'); if (pa) pa.textContent = part ? MD.euros(Math.ceil(part / nb * 100) / 100) : '—';
    let maintenant, place;
    if (mode === 'acompte') { maintenant = MD.ACOMPTE; place = Math.max(part - MD.ACOMPTE, 0); }
    else if (mode === 'total') { maintenant = part; place = 0; }
    else { maintenant = Math.ceil(part / nb * 100) / 100; place = 0; }
    const r = document.getElementById(pfx + '-resume');
    if (r) r.innerHTML = `
      <div class="pay-row"><span class="pl">Terrain</span><span>${prix ? prix + ' €' : '—'}</span></div>
      <div class="pay-row"><span class="pl">${type === 'terrain' ? 'Pour ta bande' : 'Part de ton équipe'}</span><span>${part ? part + ' €' : '—'}</span></div>
      <div class="pay-row"><span class="pl">Soit par joueur (à 10)</span><span><strong>${MD.euros(parJ)}</strong></span></div>
      <div class="pay-row"><span class="pl">Tu paies maintenant</span><span style="font-weight:700;">${MD.euros(maintenant)}</span></div>
      ${mode === 'partage'
        ? `<div class="md-note">Tes ${nb - 1} coéquipiers paient chacun ${MD.euros(maintenant)} avec le lien que tu recevras. La réservation est confirmée dès que ${MD.ACOMPTE} € sont réunis.</div>`
        : `<div class="pay-row"><span class="pl">Reste à payer sur place</span><span>${MD.euros(place)}</span></div>`}
      <div class="md-note">Annulation gratuite et remboursée jusqu'à 24h avant le match. Après, pas de remboursement.</div>`;
    const btn = document.getElementById(pfx + '-btn');
    if (btn && !btn.disabled) btn.textContent = `Payer ${MD.euros(maintenant)} →`;
  };

  // ---------------------------------------------------------------
  // Créer un match : un seul écran, Quand > Où > Détails > Payer
  // ---------------------------------------------------------------
  const C = MD.creation = { type: 'match', date: null, five: null, debut: null, duree: 60 };

  function horairesFive(f) {
    const txt = String((f && f.horaires) || '');
    const t = txt.match(/(\d{1,2})\s*[h:]\s*(\d{2})?\s*[-–à]\s*(\d{1,2})\s*[h:]?\s*(\d{2})?/i);
    let ouv = 9 * 60, ferm = 23 * 60;
    if (t) {
      ouv = parseInt(t[1], 10) * 60 + (t[2] ? parseInt(t[2], 10) : 0);
      ferm = parseInt(t[3], 10) * 60 + (t[4] ? parseInt(t[4], 10) : 0);
      if (ferm <= ouv) ferm = 24 * 60;
    }
    return { ouv, ferm };
  }

  // Créneaux libres d'un five pour une date, en tenant compte des matchs déjà posés
  MD.creneauxLibres = function (f, iso, duree) {
    const { ouv, ferm } = horairesFive(f);
    const capacite = parseInt(f.nb_terrains, 10) || 1;
    const pris = MD.tousMatchs.filter(m => m.terrain === (f.nom || f.name) && m.date_iso === iso && m.statut !== 'cancelled')
      .map(m => { const d = MD.minutesDebut(m.heure); return d == null ? null : [d, d + (m.duree || 60)]; }).filter(Boolean)
      // Créneaux bloqués par le gérant (réservations faites en direct au five)
      .concat((f.bloques || []).filter(b => b.date === iso).map(b => { const d = MD.minutesDebut(b.heure); return d == null ? null : [d, d + (b.duree || 60)]; }).filter(Boolean));
    const maintenant = new Date(), auj = MD.aujourdhui();
    // Défi : au moins 3h pour laisser une équipe répondre. Terrain entre potes : 1h.
    const minNow = maintenant.getHours() * 60 + maintenant.getMinutes() + (C.type === 'terrain' ? 60 : 180);
    const res = [];
    for (let h = ouv; h + duree <= ferm; h += 30) {
      if (iso === auj && h < minNow) continue;
      const chevauche = pris.filter(([a, b]) => h < b && a < h + duree).length;
      if (chevauche < capacite) res.push(h);
    }
    return res;
  };

  MD.ouvrirCreation = async function (prefill) {
    if (!MD.exigerConnexion('Connecte-toi pour créer un match')) return;
    Object.assign(C, { type: 'match', date: MD.aujourdhui(), five: null, debut: null, duree: 60, rejoue: null }, prefill || {});
    if (!MD.fives.length) await MD.chargerFives();
    if (!MD.tousMatchs.length) { try { MD.tousMatchs = await MD.api('/api/matchs'); } catch (e) {} }
    let equipeDef = '', couleurDef = 'blanc';
    try { const mes = await MD.mesEquipes(); if (mes[0]) { equipeDef = mes[0].nom; couleurDef = mes[0].couleur || couleurDef; C.equipe_id = mes[0].id; } } catch (e) {}
    const s = MD.session();
    equipeDef = (prefill && prefill.equipe1) || equipeDef || (s && (s.pseudo || s.email.split('@')[0])) || '';

    const jours = [];
    for (let i = 0; i < 14; i++) jours.push(MD.iso(new Date(Date.now() + i * 86400000)));

    MD.modal('creer2', 'Réserver un five', `
      <div class="md-seg" id="cr-type">
        <button class="md-seg-btn sel" data-type="match">⚔️ Match contre une équipe</button>
        <button class="md-seg-btn" data-type="terrain">🤝 Juste le terrain, entre potes</button>
      </div>
      <div class="md-step"><span>1</span>Quand ?</div>
      <div class="md-jours" id="cr-jours">${jours.map(j => `<button class="md-jour-btn${j === C.date ? ' sel' : ''}" data-iso="${j}">${esc(MD.fmtJour(j))}</button>`).join('')}</div>
      <div class="md-seg md-seg-sm" id="cr-duree">
        <button class="md-seg-btn sel" data-d="60">1h</button><button class="md-seg-btn" data-d="90">1h30</button>
      </div>
      <div class="md-step"><span>2</span>Où et à quelle heure ?</div>
      <div id="cr-fives"></div>
      <div id="cr-details" style="display:none;">
        <div class="md-step"><span>3</span>Ton équipe</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Nom de l'équipe</label><input class="form-input" id="cr-equipe" maxlength="40" value="${esc(equipeDef)}"></div>
          <div class="form-group" id="cr-niveau-wrap"><label class="form-label">Niveau</label>
            <select class="form-input" id="cr-niveau"><option>Débutant</option><option selected>Intermédiaire</option><option>Avancé</option></select></div>
        </div>
        <div class="form-group"><label class="form-label">Couleur de vos maillots</label>${MD.choixCouleur('cr-couleur', couleurDef)}</div>
        <div class="md-step"><span>4</span>Paiement</div>
        <div id="cr-pay"></div>
        <div class="md-note md-warn" id="cr-sans-adv">Si aucune équipe ne te défie au plus tard 2h avant le match, il est annulé et tu es remboursé à 100 %.</div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="MD.fermer('creer2')">Annuler</button>
          <button class="btn btn-lime" id="cr-btn" onclick="MD.validerCreation()">Payer →</button>
        </div>
      </div>`, 680);

    const corps = MD.corps('creer2');
    corps.querySelectorAll('#cr-type .md-seg-btn').forEach(b => b.addEventListener('click', () => {
      corps.querySelectorAll('#cr-type .md-seg-btn').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); C.type = b.dataset.type; C.debut = null; renderFivesCreation(); majDetails();
    }));
    corps.querySelectorAll('#cr-jours .md-jour-btn').forEach(b => b.addEventListener('click', () => {
      corps.querySelectorAll('#cr-jours .md-jour-btn').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); C.date = b.dataset.iso; C.debut = null; renderFivesCreation();
    }));
    corps.querySelectorAll('#cr-duree .md-seg-btn').forEach(b => b.addEventListener('click', () => {
      corps.querySelectorAll('#cr-duree .md-seg-btn').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); C.duree = parseInt(b.dataset.d, 10); C.debut = null; renderFivesCreation();
    }));
    if (prefill && prefill.type) corps.querySelector(`#cr-type [data-type="${prefill.type}"]`).click();
    if (prefill && prefill.duree === 90) corps.querySelector('#cr-duree [data-d="90"]').click();
    if (prefill && prefill.date) { const b = corps.querySelector(`#cr-jours [data-iso="${prefill.date}"]`); if (b) b.click(); else C.date = prefill.date; }
    renderFivesCreation();
    if (prefill && prefill.five && prefill.debut != null) {
      const f = MD.five(prefill.five);
      if (f && MD.creneauxLibres(f, C.date, C.duree).includes(prefill.debut)) MD.choisirCreneau(prefill.five, prefill.debut);
      else showToast('CE CRÉNEAU EST DÉJÀ PRIS, CHOISIS-EN UN AUTRE');
    }
    if (!MD.position()) MD.localiser().then(p => { if (p) renderFivesCreation(); });
  };

  function renderFivesCreation() {
    const box = document.getElementById('cr-fives');
    if (!box) return;
    const pos = MD.position();
    const fives = (MD.fives || []).map(f => ({ f, km: pos ? MD.distanceKm(pos, { lat: f.lat, lng: parseFloat(f.lng) }) : null }))
      .sort((a, b) => (a.km == null ? 999 : a.km) - (b.km == null ? 999 : b.km));
    if (!fives.length) { box.innerHTML = MD.vide('🏟️', 'Aucun five disponible', 'Les fives partenaires apparaîtront ici.'); return; }
    box.innerHTML = fives.map(({ f, km }) => {
      const nom = f.nom || f.name;
      const libres = MD.creneauxLibres(f, C.date, C.duree);
      const prix = MD.prixTerrain(f);
      const prixDuree = prix ? Math.round(prix * C.duree / 60) : null;
      const equip = [f.surfaces, f.vestiaires && 'Vestiaires', f.douches && 'Douches', f.parking && 'Parking', f.metro && ('🚇 ' + f.metro)].filter(Boolean);
      const photo = (f.photos && f.photos[0]) ? `<img src="${esc(f.photos[0])}" alt="" loading="lazy">` : `<div class="md-five-ph">${esc(nom.split(' ').map(x => x[0]).join('').slice(0, 3))}</div>`;
      const note = f.note_moyenne ? `★ ${f.note_moyenne} <small>(${f.nb_avis})</small>` : '<small>Nouveau</small>';
      return `<div class="md-five${C.five === nom ? ' sel' : ''}">
        <div class="md-five-photo">${photo}</div>
        <div class="md-five-info">
          <div class="md-five-nom">${esc(nom)} <span class="md-five-note">${note}</span></div>
          <div class="md-five-sub">${esc(f.lieu || '')}${km != null ? ' · ' + MD.fmtKm(km) : ''}${prixDuree ? ` · ${prixDuree} € le terrain · <strong>${MD.euros(MD.parJoueur(prixDuree, 10))}/joueur</strong>` : ''}</div>
          ${equip.length ? `<div class="md-five-equip">${equip.map(e => `<span>${esc(e)}</span>`).join('')}</div>` : ''}
          <div class="md-creneaux">${libres.length ? libres.map(h =>
            `<button class="md-cr-btn${C.five === nom && C.debut === h ? ' sel' : ''}" onclick="MD.choisirCreneau(${MD.js(nom)},${h})">${MD.fmtHeure(h)}</button>`).join('')
            : '<span class="md-muted">Complet ce jour-là</span>'}</div>
        </div>
      </div>`;
    }).join('');
  }

  MD.choisirCreneau = function (nom, h) {
    C.five = nom; C.debut = h;
    renderFivesCreation();
    majDetails();
    const d = document.getElementById('cr-details');
    if (d) setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  function majDetails() {
    const d = document.getElementById('cr-details');
    if (!d) return;
    d.style.display = C.five && C.debut != null ? '' : 'none';
    if (!C.five) return;
    const f = MD.five(C.five);
    const prix = f ? Math.round((MD.prixTerrain(f) || 0) * C.duree / 60) : 0;
    document.getElementById('cr-pay').innerHTML = MD.blocPaiement('cr', prix, C.type);
    MD.majPaiement('cr', prix, C.type);
    document.getElementById('cr-niveau-wrap').style.display = C.type === 'terrain' ? 'none' : '';
    document.getElementById('cr-sans-adv').style.display = C.type === 'terrain' ? 'none' : '';
  }

  MD.validerCreation = async function () {
    const nom = (document.getElementById('cr-equipe').value || '').trim();
    if (nom.length < 2) { showToast("DONNE UN NOM À TON ÉQUIPE", 'error'); return; }
    if (!C.five || C.debut == null) { showToast('CHOISIS UN CRÉNEAU', 'error'); return; }
    const p = MD.lirePaiement('cr');
    const couleur = (document.querySelector('input[name="cr-couleur"]:checked') || {}).value || null;
    const btn = document.getElementById('cr-btn');
    btn.disabled = true; btn.textContent = 'Réservation…';
    try {
      const r = await MD.post('/api/matchs', {
        action: 'creer', terrain: C.five, date_iso: C.date,
        heure_debut: String(Math.floor(C.debut / 60)).padStart(2, '0') + ':' + String(C.debut % 60).padStart(2, '0'),
        duree: C.duree, niveau: C.type === 'terrain' ? null : document.getElementById('cr-niveau').value,
        equipe1: nom, type: C.type, couleur1: couleur, equipe_id: C.equipe_id || null,
        rejoue_de: C.rejoue || null
      });
      const pay = await MD.post('/api/checkout', { role: 'creer', matchId: r.match.id, mode: p.mode, nbJoueurs: p.nb });
      localStorage.setItem('matchday_pending_match', r.match.id);
      location.href = pay.url;
    } catch (e) {
      showToast(e.message.toUpperCase(), 'error');
      btn.disabled = false; MD.majPaiement('cr', parseFloat(btn.closest('.md-modal').dataset.prix), C.type);
    }
  };

  // L'app appelle openModal('creer') à plusieurs endroits : on redirige vers le nouvel écran
  const ancienOpenModal = window.openModal;
  window.openModal = function (id) {
    if (id === 'creer') return MD.ouvrirCreation();
    if (id === 'rejoindre') return; // remplacé par MD.modal('rejoindre2')
    return ancienOpenModal.apply(this, arguments);
  };

  // ---------------------------------------------------------------
  // Retour de Stripe : la confirmation est faite par le serveur
  // (webhook), ici on attend juste qu'elle arrive.
  // ---------------------------------------------------------------
  const ancienAgInit = window.agInit;
  window.agInit = async function () {
    const params = new URLSearchParams(location.search);
    const paiement = params.get('payment');
    if (!paiement || !MD.session()) return ancienAgInit.apply(this, arguments);
    const matchId = params.get('matchId') || localStorage.getItem('matchday_pending_match');
    history.replaceState({}, '', location.pathname);
    agShowApp(MD.session());
    localStorage.removeItem('matchday_pending_match');
    if (paiement === 'cancel') { setTimeout(() => showToast('PAIEMENT ANNULÉ · RIEN N\'A ÉTÉ DÉBITÉ'), 300); return; }
    if (paiement === 'part') { setTimeout(() => showToast('✅ MERCI, TA PART EST PAYÉE'), 300); return; }
    showToast('✅ PAIEMENT REÇU · CONFIRMATION EN COURS…');
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const mes = await MD.api('/api/matchs?mine=1');
        const m = mes.find(x => x.id === matchId);
        if (m && m.statut !== 'pending_payment') {
          loadMesMatchs(); loadMatchs();
          if (typeof showConfirmationPage === 'function') showConfirmationPage(m);
          showToast(m.statut === 'confirmed' ? '🔥 MATCH CONFIRMÉ !' : '✅ RÉSERVÉ · ON TE PRÉVIENT DÈS QU\'UNE ÉQUIPE TE DÉFIE');
          return;
        }
      } catch (e) {}
    }
    showPage('mes-matchs', document.getElementById('nav-mes-matchs'));
    loadMesMatchs();
    showToast('PAIEMENT REÇU · LE MATCH APPARAÎTRA DANS QUELQUES SECONDES');
  };
})();
