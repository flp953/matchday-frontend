// =====================================================================
// Matchday : mes matchs, qui vient, chat, score, notes, annulation,
// paiements, partage du résultat, "on rejoue ?"
// =====================================================================
(function () {
  const MD = window.MD;
  const esc = MD.esc;
  MD.mesMatchs = [];

  const STATUTS = {
    pending_payment: '<span class="tag tag-grey">PAIEMENT EN COURS</span>',
    open: '<span class="tag tag-lime">EN ATTENTE D\'ADVERSAIRE</span>',
    confirmed: '<span class="tag tag-green">CONFIRMÉ ✓</span>',
    cancelled: '<span class="tag tag-grey">ANNULÉ</span>'
  };

  function nomAdversaire(m) {
    if (m.type === 'terrain') return 'Entre potes';
    const adv = m.ma_equipe === 1 ? m.equipe2 : m.equipe1;
    return adv || 'En attente…';
  }
  function lien(param) { return location.origin + '/app?' + param; }

  // ---------------------------------------------------------------
  // Liste "Mes matchs"
  // ---------------------------------------------------------------
  window.loadMesMatchs = async function () {
    const cAvenir = document.getElementById('mes-matchs-avenir-container');
    const cPasses = document.getElementById('mes-matchs-passes-container');
    if (!cAvenir) return;
    if (!MD.connecte()) { cAvenir.innerHTML = ''; return; }
    if (!MD.mesMatchs.length) cAvenir.innerHTML = MD.chargement();
    try {
      MD.mesMatchs = await MD.api('/api/matchs?mine=1');
    } catch (e) {
      cAvenir.innerHTML = MD.vide('📡', 'Impossible de charger tes matchs', 'Réessaie dans un instant.', `<button class="btn btn-primary" onclick="loadMesMatchs()">Réessayer</button>`);
      return;
    }
    window._mesMatchsCache = MD.mesMatchs;
    const aVenir = MD.mesMatchs.filter(m => m.statut !== 'cancelled' && !MD.estPasse(m))
      .sort((a, b) => (MD.dateDebut(a) || 0) - (MD.dateDebut(b) || 0));
    const passes = MD.mesMatchs.filter(m => MD.estPasse(m) || m.statut === 'cancelled')
      .sort((a, b) => (MD.dateDebut(b) || 0) - (MD.dateDebut(a) || 0));

    const badge = document.getElementById('nb-mes-matchs');
    if (badge) { badge.textContent = aVenir.length; badge.style.display = aVenir.length ? '' : 'none'; }

    cAvenir.innerHTML = aVenir.length
      ? aVenir.map(carteAVenir).join('')
      : MD.vide('⚽', 'Pas encore de match', 'Réserve un five ou défie une équipe : il apparaîtra ici.', `<button class="btn btn-primary" onclick="openModal('creer')">+ Réserver un five</button>
         <button class="btn btn-outline" onclick="showPage('matchs', document.getElementById('nav-matchs'))">Trouver un adversaire</button>`);
    cPasses.innerHTML = passes.length
      ? passes.map(cartePasse).join('')
      : MD.vide('🏆', 'Pas encore de match joué', 'Ton historique s\'affichera ici.');

    rappelApresMatch(passes);
    rappelProchainMatch(aVenir);
    MD.majDashboardProchains(aVenir);
  };

  function infoLigne(m) {
    const min = MD.minutesDebut(m.heure);
    return `<div class="md-card-grid">
      <div><div class="md-k">Quand</div><div class="md-v">${esc(MD.fmtJour(m.date_iso, true))}</div><div class="md-s">${min != null ? MD.fmtPlage(min, m.duree) : esc(m.heure || '')}</div></div>
      <div><div class="md-k">${m.type === 'terrain' ? 'Format' : 'Adversaire'}</div><div class="md-v">${esc(nomAdversaire(m))}</div>
        <div class="md-s">${m.type !== 'terrain' && m.statut === 'confirmed' ? (m.ma_equipe === 1 ? MD.pastille(m.couleur2) : MD.pastille(m.couleur1)) : ''}</div></div>
      <div><div class="md-k">Vos maillots</div><div class="md-v md-v-sm">${MD.pastille(m.ma_equipe === 2 ? m.couleur2 : m.couleur1) || '—'}</div></div>
    </div>`;
  }

  function carteAVenir(m) {
    const p = (m.presences && m.presences['equipe' + (m.ma_equipe || 1)]) || { oui: 0, peut: 0, non: 0 };
    const cible = m.type === 'terrain' ? 10 : 5;
    const h = MD.heuresAvant(m);
    const libres = m.ma_equipe === 2 ? m.places_libres2 : m.places_libres1;
    const f = MD.five(m.terrain);
    const boutons = [];
    if (m.statut === 'pending_payment') {
      boutons.push(`<button class="btn btn-primary btn-sm" onclick="MD.lienPart('${m.id}',${m.ma_equipe || 1})">💸 Lien de paiement pour l'équipe</button>`);
    }
    if (m.statut === 'open' || m.statut === 'confirmed' || m.statut === 'pending_payment') {
      boutons.push(`<button class="btn btn-outline btn-sm" onclick="MD.quiVient('${m.id}')">🙋 Qui vient ?</button>`);
      boutons.push(`<button class="btn btn-outline btn-sm md-wa" onclick="MD.invitePotes('${m.id}')">WhatsApp</button>`);
    }
    if (m.statut === 'open' && m.capitaine && m.type !== 'terrain') {
      boutons.push(`<button class="btn btn-outline btn-sm" onclick="MD.partagerMatch('${m.id}')">📣 Trouver un adversaire</button>`);
    }
    if (m.statut === 'confirmed' && m.type !== 'terrain') boutons.push(`<button class="btn btn-outline btn-sm" onclick="ouvrirChat('${m.id}')">💬 Chat</button>`);
    boutons.push(`<button class="btn btn-outline btn-sm" onclick="MD.icsMatch('${m.id}')">📅 Agenda</button>`);
    boutons.push(`<a class="btn btn-outline btn-sm" href="${MD.lienMaps(f, m)}" target="_blank" rel="noopener">🗺️ Itinéraire</a>`);
    if (m.capitaine && m.statut !== 'pending_payment') boutons.push(`<button class="btn btn-outline btn-sm" onclick="MD.placesLibres('${m.id}')">➕ Il me manque des joueurs</button>`);
    if (m.capitaine && (m.statut === 'open' || m.statut === 'confirmed')) boutons.push(`<button class="btn btn-sm md-danger" onclick="annulerMatch('${m.id}')">Annuler</button>`);

    return `<div class="md-card">
      <div class="md-card-head">
        <div><span class="md-card-titre">${esc(m.terrain)}</span><span class="md-card-lieu">${esc((m.lieu || '').toUpperCase())}</span></div>
        ${STATUTS[m.statut] || ''}
      </div>
      ${infoLigne(m)}
      ${m.statut === 'pending_payment' ? `<div class="md-banner">Réservation confirmée dès que ${MD.ACOMPTE} € sont réunis (${MD.euros((m.paye || 0) / 100)} payés). Envoie le lien à tes coéquipiers.</div>` : ''}
      ${m.statut === 'open' && h != null && h > 2 ? `<div class="md-banner md-banner-soft">Sans adversaire 2h avant le match, il est annulé et tu es remboursé à 100 %.</div>` : ''}
      <div class="md-presence">
        <div class="md-presence-bar"><div style="width:${Math.min(100, p.oui / cible * 100)}%"></div></div>
        <div class="md-presence-txt"><strong>${p.oui}/${cible}</strong> viennent${p.peut ? ` · ${p.peut} peut-être` : ''}${p.non ? ` · ${p.non} absent${p.non > 1 ? 's' : ''}` : ''}${libres ? ` · <span class="md-libre">${libres} place${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''}</span>` : ''}</div>
      </div>
      <div class="md-actions">${boutons.join('')}</div>
    </div>`;
  }

  function cartePasse(m) {
    const boutons = [];
    const joue = m.statut === 'confirmed' || (m.statut === 'open' && m.type === 'terrain');
    if (joue && m.type !== 'terrain') {
      if (m.score_valide) boutons.push(`<button class="btn btn-outline btn-sm" onclick="MD.partagerResultat('${m.id}')">📸 Partager le résultat</button>`);
      else boutons.push(`<button class="btn btn-primary btn-sm" onclick="ouvrirScore('${m.id}')">${m.score1 != null ? '✔︎ Valider le score' : '⚽ Saisir le score'}</button>`);
      if (!m.a_note) boutons.push(`<button class="btn btn-outline btn-sm" onclick="ouvrirNotation('${m.id}')">⭐ Noter</button>`);
      if (m.capitaine) boutons.push(`<button class="btn btn-outline btn-sm" onclick="MD.onRejoue('${m.id}')">🔁 On rejoue ?</button>`);
    }
    if (joue && m.type === 'terrain' && m.capitaine) boutons.push(`<button class="btn btn-outline btn-sm" onclick="MD.onRejoue('${m.id}')">🔁 Re-réserver</button>`);
    const score = m.score1 != null
      ? `<div class="md-score">${m.score1} - ${m.score2}${m.score_valide ? '' : ' <small>(à valider)</small>'}</div>` : '';
    return `<div class="md-card md-card-passe">
      <div class="md-card-head">
        <div><span class="md-card-titre">${esc(m.terrain)}</span><span class="md-card-lieu">${esc(MD.fmtJour(m.date_iso, true))}</span></div>
        ${m.statut === 'cancelled' ? STATUTS.cancelled : '<span class="tag tag-green">JOUÉ</span>'}
      </div>
      <div class="md-card-vs">${esc(m.equipe1 || '')}${m.type !== 'terrain' ? ` <span>vs</span> ${esc(m.equipe2 || '—')}` : ''}${score}</div>
      ${boutons.length ? `<div class="md-actions">${boutons.join('')}</div>` : ''}
    </div>`;
  }

  // Après un match : on demande le score et la note (une seule fois par match)
  function rappelApresMatch(passes) {
    const m = passes.find(x => x.statut === 'confirmed' && x.type !== 'terrain' && (!x.a_note || !x.score_valide)
      && Date.now() - MD.dateDebut(x) < 7 * 86400000);
    if (!m) return;
    const cle = 'md_rappel_post_' + m.id;
    if (localStorage.getItem(cle)) return;
    localStorage.setItem(cle, '1');
    setTimeout(() => {
      MD.modal('apres', 'Alors, ce match ?', `
        <div class="md-recap"><strong>${esc(m.equipe1)} vs ${esc(m.equipe2 || '')}</strong><br>${esc(m.terrain)} · ${esc(MD.fmtJour(m.date_iso, true))}</div>
        <p class="md-p">10 secondes pour saisir le score et noter l'adversaire. Ça fait monter ton niveau et ça aide les autres équipes.</p>
        <div class="modal-footer">
          ${!m.score_valide ? `<button class="btn btn-primary" onclick="MD.fermer('apres');ouvrirScore('${m.id}')">Saisir le score</button>` : ''}
          ${!m.a_note ? `<button class="btn btn-lime" onclick="MD.fermer('apres');ouvrirNotation('${m.id}')">Noter l'adversaire</button>` : ''}
        </div>`, 440);
    }, 1200);
  }

  // Le jour du match : rappel avec maillots, adresse et itinéraire
  function rappelProchainMatch(aVenir) {
    const m = aVenir.find(x => x.date_iso === MD.aujourdhui() && x.statut === 'confirmed');
    if (!m) return;
    const cle = 'md_rappel_jour_' + m.id;
    if (sessionStorage.getItem(cle)) return;
    sessionStorage.setItem(cle, '1');
    const f = MD.five(m.terrain);
    const min = MD.minutesDebut(m.heure);
    MD.modal('jourj', "C'est aujourd'hui ⚽", `
      <div class="md-recap"><strong>${esc(m.terrain)}</strong><br>${f && f.adresse ? esc(f.adresse) + '<br>' : ''}${min != null ? 'Coup d\'envoi ' + MD.fmtHeure(min) + ' · arrive vers ' + MD.fmtHeure(min - 15) : ''}</div>
      <div class="md-card-grid">
        <div><div class="md-k">${esc(m.equipe1)}</div><div class="md-v md-v-sm">${MD.pastille(m.couleur1) || '—'}</div></div>
        <div><div class="md-k">${esc(m.equipe2 || '')}</div><div class="md-v md-v-sm">${MD.pastille(m.couleur2) || '—'}</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="MD.fermer('jourj')">OK</button>
        <a class="btn btn-lime" href="${MD.lienMaps(f, m)}" target="_blank" rel="noopener">Itinéraire →</a>
      </div>`, 440);
  }

  MD.matchParId = function (id) { return MD.mesMatchs.find(m => m.id === id) || null; };
  MD.icsMatch = function (id) { const m = MD.matchParId(id); if (m) MD.ics(m); };

  // ---------------------------------------------------------------
  // Qui vient ? (liste de présence de l'équipe)
  // ---------------------------------------------------------------
  MD.quiVient = async function (id) {
    const m = MD.matchParId(id);
    MD.modal('presence', 'Qui vient ?', MD.chargement(), 520);
    let data;
    try { data = await MD.api('/api/matchs?presences=' + encodeURIComponent(id)); }
    catch (e) { MD.corps('presence').innerHTML = MD.vide('😕', 'Impossible de charger', e.message); return; }
    const ma = m ? (m.ma_equipe || 1) : 1;
    const liste = (data['equipe' + ma] || []);
    const groupe = (rep, titre) => {
      const l = liste.filter(p => p.reponse === rep);
      return l.length ? `<div class="md-k" style="margin-top:12px;">${titre} (${l.length})</div>${l.map(p => `<div class="md-pres-ligne">${esc(p.nom)}${p.moi ? ' <small>(toi)</small>' : ''}</div>`).join('')}` : '';
    };
    const moi = liste.find(p => p.moi);
    MD.corps('presence').innerHTML = `
      <div class="md-recap">${m ? `<strong>${esc(m.terrain)}</strong> · ${esc(MD.fmtJour(m.date_iso, true))}` : ''}</div>
      <div class="md-k">Ta réponse</div>
      <div class="md-seg">${['oui', 'peut', 'non'].map(r => `<button class="md-seg-btn${moi && moi.reponse === r ? ' sel' : ''}" onclick="MD.repondre('${id}',${ma},'${r}')">${{ oui: '✅ Je viens', peut: '🤔 Peut-être', non: '❌ Pas dispo' }[r]}</button>`).join('')}</div>
      ${groupe('oui', 'Viennent')}${groupe('peut', 'Peut-être')}${groupe('non', 'Absents')}
      ${!liste.length ? '<p class="md-p">Personne n\'a encore répondu. Envoie le lien à ton équipe.</p>' : ''}
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="MD.copier('${lien('presence=' + id + '&e=' + ma)}')">Copier le lien</button>
        <button class="btn btn-lime md-wa-solid" onclick="MD.invitePotes('${id}')">Envoyer sur WhatsApp</button>
      </div>`;
  };

  MD.repondre = async function (id, equipe, reponse, nom) {
    if (!MD.exigerConnexion('Connecte-toi pour répondre')) return;
    const s = MD.session();
    try {
      await MD.post('/api/matchs', { action: 'presence', matchId: id, equipe, reponse, nom: nom || s.pseudo || s.email.split('@')[0] });
      showToast(reponse === 'oui' ? '✅ C\'EST NOTÉ, À TOUT À L\'HEURE' : 'RÉPONSE ENREGISTRÉE');
      if (MD.matchParId(id)) { MD.quiVient(id); loadMesMatchs(); } else MD.fermer('presence');
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };

  MD.invitePotes = function (id) {
    const m = MD.matchParId(id);
    if (!m) return;
    const min = MD.minutesDebut(m.heure);
    const txt = `⚽ Five ${MD.fmtJour(m.date_iso, true)} ${min != null ? 'à ' + MD.fmtHeure(min) : ''} au ${m.terrain}`
      + (m.type !== 'terrain' && m.statut === 'confirmed' ? ` contre ${nomAdversaire(m)}` : '')
      + `.\nDis si tu viens en 1 clic : ${lien('presence=' + id + '&e=' + (m.ma_equipe || 1))}`;
    MD.whatsapp(txt);
  };

  MD.partagerMatch = function (id) {
    const m = MD.matchParId(id);
    if (!m) return;
    const min = MD.minutesDebut(m.heure);
    MD.partager('Cherche adversaire', `On cherche une équipe pour un five ${MD.fmtJour(m.date_iso, true)} ${min != null ? 'à ' + MD.fmtHeure(min) : ''} au ${m.terrain} (niveau ${m.niveau || 'tous'}). Chaud ?`, lien('match=' + id));
  };

  // Lien pour que chaque joueur paie sa part
  MD.lienPart = function (id, equipe) {
    const m = MD.matchParId(id);
    const url = lien('payer=' + id + '&e=' + equipe);
    MD.whatsapp(`💸 Five ${m ? MD.fmtJour(m.date_iso, true) + ' au ' + m.terrain : ''} : paie ta part ici en 30 secondes (CB, Apple Pay, Google Pay) 👉 ${url}`);
  };

  MD.ouvrirPaiementPart = async function (id, equipe) {
    if (!MD.exigerConnexion('Connecte-toi pour payer ta part')) return;
    MD.modal('part', 'Payer ma part', MD.chargement(), 440);
    try {
      const i = await MD.api(`/api/checkout?part=${encodeURIComponent(id)}&e=${equipe}`);
      MD.corps('part').innerHTML = `
        <div class="md-recap"><strong>${esc(i.terrain)}</strong><br>${esc(MD.fmtJour(i.date_iso, true))} · ${esc(i.heure || '')}<br>Équipe : ${esc(i.equipe || '')}</div>
        <div class="pay-summary">
          <div class="pay-row"><span class="pl">Ta part</span><span><strong>${MD.euros(i.montant / 100)}</strong></span></div>
          <div class="pay-row"><span class="pl">Déjà payé par l'équipe</span><span>${MD.euros(i.deja / 100)} / ${MD.euros(i.objectif / 100)}</span></div>
        </div>
        ${i.dejaPayeParMoi ? '<div class="md-banner">Tu as déjà payé ta part. Merci !</div>' : ''}
        <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('part')">Plus tard</button>
        ${i.dejaPayeParMoi ? '' : `<button class="btn btn-lime" id="part-btn" onclick="MD.payerPart('${esc(id)}',${equipe})">Payer ${MD.euros(i.montant / 100)} →</button>`}</div>`;
    } catch (e) { MD.corps('part').innerHTML = MD.vide('😕', 'Lien invalide', e.message); }
  };
  MD.payerPart = async function (id, equipe) {
    const b = document.getElementById('part-btn'); b.disabled = true; b.textContent = 'Redirection…';
    try { const r = await MD.post('/api/checkout', { role: 'part', matchId: id, equipe }); location.href = r.url; }
    catch (e) { showToast(e.message.toUpperCase(), 'error'); b.disabled = false; b.textContent = 'Payer →'; }
  };

  // ---------------------------------------------------------------
  // Il me manque des joueurs
  // ---------------------------------------------------------------
  MD.placesLibres = function (id) {
    const m = MD.matchParId(id);
    const actuel = m ? ((m.ma_equipe === 2 ? m.places_libres2 : m.places_libres1) || 0) : 0;
    MD.modal('places', 'Il me manque des joueurs', `
      <p class="md-p">Les joueurs sans équipe voient ton match et peuvent demander à compléter. Tu reçois un mail à chaque demande.</p>
      <div class="form-group"><label class="form-label">Places libres dans ton équipe</label>
        <select class="form-input" id="pl-n">${[0, 1, 2, 3, 4].map(n => `<option value="${n}" ${n === actuel ? 'selected' : ''}>${n === 0 ? 'Aucune (équipe complète)' : n}</option>`).join('')}</select></div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('places')">Annuler</button>
      <button class="btn btn-lime" onclick="MD.validerPlaces('${id}')">Enregistrer</button></div>`, 440);
  };
  MD.validerPlaces = async function (id) {
    try {
      await MD.post('/api/matchs', { action: 'placesLibres', matchId: id, n: parseInt(document.getElementById('pl-n').value, 10) });
      MD.fermer('places'); showToast('C\'EST PUBLIÉ'); loadMesMatchs();
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };

  // ---------------------------------------------------------------
  // Annulation : une seule règle, partout
  // ---------------------------------------------------------------
  window.annulerMatch = function (id) {
    const m = MD.matchParId(id);
    if (!m) return;
    const h = MD.heuresAvant(m);
    const rembourse = h == null || h >= 24;
    MD.modal('annuler2', 'Annuler le match', `
      <div class="md-recap"><strong>${esc(m.terrain)}</strong> · ${esc(MD.fmtJour(m.date_iso, true))} · ${esc(m.heure || '')}</div>
      <div class="md-banner ${rembourse ? '' : 'md-banner-red'}">${rembourse
        ? '✅ Plus de 24h avant le match : tout ce que ton équipe a payé est remboursé à 100 %.'
        : '❌ Moins de 24h avant le match : ce que ton équipe a payé n\'est pas remboursé.'}
        ${m.statut === 'confirmed' && m.type !== 'terrain' ? '<br>L\'équipe adverse est prévenue et remboursée intégralement.' : ''}</div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('annuler2')">Garder le match</button>
      <button class="btn md-danger-solid" id="an-btn" onclick="confirmerAnnulation('${id}')">Confirmer l'annulation</button></div>`, 460);
  };
  window.confirmerAnnulation = async function (id) {
    const b = document.getElementById('an-btn'); if (b) { b.disabled = true; b.textContent = 'Annulation…'; }
    try {
      const r = await MD.post('/api/refund', { matchId: id || window.annulationMatchId });
      MD.fermer('annuler2');
      showToast(r.rembourse ? 'MATCH ANNULÉ · REMBOURSEMENT EN COURS' : 'MATCH ANNULÉ');
      loadMesMatchs(); loadMatchs();
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); if (b) { b.disabled = false; b.textContent = "Confirmer l'annulation"; } }
  };

  // ---------------------------------------------------------------
  // Score : chaque capitaine saisit, validé quand les deux sont d'accord
  // ---------------------------------------------------------------
  window.ouvrirScore = function (id) {
    const m = MD.matchParId(id);
    if (!m) return;
    const attente = m.score1 != null && !m.score_valide;
    MD.modal('score2', 'Score du match', `
      ${attente ? `<div class="md-banner">${m.score_saisi_par_moi ? 'Tu as saisi ce score. On attend que l\'autre capitaine le valide.' : 'L\'autre capitaine a saisi ce score. Valide-le ou corrige-le.'}</div>` : ''}
      <div class="md-score-saisie">
        <div><div class="md-k">${esc(m.equipe1)}</div><input type="number" min="0" max="99" class="form-input" id="sc-1" value="${m.score1 != null ? m.score1 : ''}"></div>
        <div class="md-score-sep">-</div>
        <div><div class="md-k">${esc(m.equipe2 || '')}</div><input type="number" min="0" max="99" class="form-input" id="sc-2" value="${m.score2 != null ? m.score2 : ''}"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('score2')">Annuler</button>
      <button class="btn btn-lime" onclick="confirmerScore('${id}')">${attente && !m.score_saisi_par_moi ? 'Valider ce score' : 'Enregistrer'}</button></div>`, 440);
  };
  window.confirmerScore = async function (id) {
    const s1 = parseInt(document.getElementById('sc-1').value, 10), s2 = parseInt(document.getElementById('sc-2').value, 10);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) { showToast('SCORE INVALIDE', 'error'); return; }
    try {
      const r = await MD.post('/api/matchs', { action: 'score', matchId: id, score1: s1, score2: s2 });
      MD.fermer('score2');
      showToast(r.valide ? '✅ SCORE VALIDÉ PAR LES DEUX ÉQUIPES' : 'SCORE ENVOYÉ · EN ATTENTE DE L\'ADVERSAIRE');
      await loadMesMatchs();
      if (r.valide) MD.partagerResultat(id);
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };

  window.loadScores = async function () {
    const list = document.getElementById('scores-list'), hist = document.getElementById('scores-history');
    if (!list) return;
    if (!MD.mesMatchs.length) { try { MD.mesMatchs = await MD.api('/api/matchs?mine=1'); } catch (e) {} }
    const joues = MD.mesMatchs.filter(m => m.statut === 'confirmed' && m.type !== 'terrain' && MD.estPasse(m));
    const aSaisir = joues.filter(m => !m.score_valide);
    const valides = joues.filter(m => m.score_valide);
    list.innerHTML = aSaisir.length ? aSaisir.map(cartePasse).join('') : MD.vide('📊', 'Aucun score à saisir', 'Après chaque match, saisis le score ici.');
    if (hist) hist.innerHTML = valides.length ? valides.map(cartePasse).join('') : '';
  };

  // ---------------------------------------------------------------
  // Image du résultat à partager (Insta, WhatsApp)
  // ---------------------------------------------------------------
  MD.partagerResultat = async function (id) {
    const m = MD.matchParId(id);
    if (!m || m.score1 == null) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
    const x = c.getContext('2d');
    try { await document.fonts.load('900 120px "Barlow Condensed"'); } catch (e) {}
    x.fillStyle = '#181614'; x.fillRect(0, 0, 1080, 1080);
    x.fillStyle = '#C8F520'; x.fillRect(0, 0, 1080, 14); x.fillRect(0, 1066, 1080, 14);
    x.textAlign = 'center';
    x.fillStyle = '#fff'; x.font = '900 64px "Barlow Condensed", sans-serif';
    x.fillText('MATCH', 500, 140); x.fillStyle = '#C8F520'; x.fillText('DAY', 640, 140);
    const nom = (t, y) => { x.fillStyle = '#fff'; x.font = '900 78px "Barlow Condensed", sans-serif'; x.fillText(String(t || '').toUpperCase().slice(0, 22), 540, y); };
    nom(m.equipe1, 360);
    x.fillStyle = '#C8F520'; x.font = '900 260px "Barlow Condensed", sans-serif';
    x.fillText(m.score1 + ' - ' + m.score2, 540, 640);
    nom(m.equipe2, 790);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '500 36px Barlow, sans-serif';
    x.fillText((m.terrain + ' · ' + MD.fmtJour(m.date_iso, true)).toUpperCase(), 540, 900);
    x.fillText('matchday-alpha.vercel.app', 540, 980);
    c.toBlob(async blob => {
      const fichier = new File([blob], 'resultat-matchday.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
        try { await navigator.share({ files: [fichier], text: `${m.equipe1} ${m.score1}-${m.score2} ${m.equipe2} ⚽` }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'resultat-matchday.png';
      document.body.appendChild(a); a.click(); a.remove();
      showToast('IMAGE TÉLÉCHARGÉE');
    }, 'image/png');
  };

  // ---------------------------------------------------------------
  // On rejoue ? (même five, même heure, la semaine d'après)
  // ---------------------------------------------------------------
  MD.onRejoue = function (id) {
    const m = MD.matchParId(id);
    if (!m) return;
    let d = new Date((m.date_iso || MD.aujourdhui()) + 'T12:00:00');
    do { d = new Date(d.getTime() + 7 * 86400000); } while (MD.iso(d) < MD.aujourdhui());
    const iso = MD.iso(d);
    MD.ouvrirCreation({
      type: m.type || 'match', date: iso, five: m.terrain, debut: MD.minutesDebut(m.heure), duree: m.duree || 60,
      rejoue: m.type !== 'terrain' ? m.id : null,
      equipe1: m.ma_equipe === 2 ? m.equipe2 : m.equipe1
    });
    if (m.type !== 'terrain') showToast(`ON PROPOSERA LE MATCH À ${(nomAdversaire(m) || '').toUpperCase()} APRÈS TON PAIEMENT`);
  };

  // ---------------------------------------------------------------
  // Notation : adversaire + terrain, visible quand les deux ont noté
  // ---------------------------------------------------------------
  let note = { adv: 0, five: 0 };
  window.ouvrirNotation = function (id) {
    const m = MD.matchParId(id);
    if (!m) return;
    note = { adv: 0, five: 0 };
    const etoiles = (k) => `<div class="md-etoiles" data-k="${k}">${[1, 2, 3, 4, 5].map(v => `<span data-v="${v}" onclick="MD.etoile('${k}',${v})">★</span>`).join('')}</div>`;
    MD.modal('noter2', 'Comment ça s\'est passé ?', `
      <div class="md-recap"><strong>${esc(nomAdversaire(m))}</strong> · ${esc(m.terrain)} · ${esc(MD.fmtJour(m.date_iso, true))}</div>
      <div class="form-group"><label class="form-label">L'équipe adverse (fair-play, ponctualité)</label>${etoiles('adv')}</div>
      <div class="form-group"><label class="form-label">Le terrain</label>${etoiles('five')}</div>
      <div class="form-group"><label class="form-label">Un mot ? (optionnel)</label><input class="form-input" id="nt-com" maxlength="300" placeholder="Bonne ambiance, à refaire…"></div>
      <p class="md-p md-muted">Ta note reste cachée jusqu'à ce que l'autre équipe ait noté aussi (ou 7 jours après le match).</p>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('noter2')">Plus tard</button>
      <button class="btn btn-lime" onclick="confirmerNotation('${id}')">Envoyer →</button></div>`, 460);
  };
  MD.etoile = function (k, v) {
    note[k] = v;
    document.querySelectorAll(`.md-etoiles[data-k="${k}"] span`).forEach(s => s.classList.toggle('on', parseInt(s.dataset.v, 10) <= v));
  };
  window.confirmerNotation = async function (id) {
    if (!note.adv) { showToast('NOTE L\'ÉQUIPE ADVERSE', 'error'); return; }
    try {
      await MD.post('/api/notations', { match_id: id, note: note.adv, note_five: note.five || null, commentaire: (document.getElementById('nt-com').value || '').trim() });
      MD.fermer('noter2'); showToast('⭐ MERCI POUR TA NOTE'); loadMesMatchs();
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };

  // ---------------------------------------------------------------
  // Chat entre les deux équipes (stocké sur le serveur)
  // ---------------------------------------------------------------
  let chatId = null;
  window.ouvrirChat = function (id) {
    showPage('chat', document.getElementById('nav-chat'));
    if (id) setTimeout(() => openChatWindow(id), 50);
  };
  window.loadChatConversations = async function () {
    const el = document.getElementById('chat-list');
    if (!el) return;
    if (!MD.mesMatchs.length) { try { MD.mesMatchs = await MD.api('/api/matchs?mine=1'); } catch (e) {} }
    const convs = MD.mesMatchs.filter(m => m.statut === 'confirmed' && m.type !== 'terrain' && !(MD.estPasse(m) && Date.now() - MD.dateDebut(m) > 14 * 86400000));
    el.innerHTML = convs.length ? convs.map(m => `<div class="md-conv${chatId === m.id ? ' sel' : ''}" onclick="openChatWindow('${m.id}')">
        <div class="md-conv-nom">${esc(nomAdversaire(m))}</div>
        <div class="md-conv-sub">${esc(m.terrain)} · ${esc(MD.fmtJour(m.date_iso))}</div></div>`).join('')
      : '<div class="md-loading">Le chat s\'ouvre quand une équipe a rejoint ton match.</div>';
  };
  window.openChatWindow = function (id) {
    chatId = id;
    window.currentChatMatchId = id;
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-messages').style.display = 'block';
    document.getElementById('chat-input-area').style.display = 'flex';
    loadChatConversations();
    fetchChatMessages();
    clearInterval(window._chatPoll);
    window._chatPoll = setInterval(() => {
      const page = document.getElementById('page-chat');
      if (page && page.classList.contains('active') && !document.hidden) fetchChatMessages();
      else clearInterval(window._chatPoll);
    }, 6000);
  };
  window.fetchChatMessages = async function () {
    if (!chatId) return;
    const box = document.getElementById('chat-messages');
    try {
      const msgs = await MD.api('/api/matchs?chat=' + encodeURIComponent(chatId));
      const enBas = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
      box.innerHTML = msgs.length ? msgs.map(x => `<div class="md-msg${x.moi ? ' moi' : ''}">
          ${x.moi ? '' : `<div class="md-msg-de">${esc(x.de)}</div>`}
          <div class="md-msg-txt">${esc(x.texte)}</div>
          <div class="md-msg-h">${new Date(x.created_at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>`).join('')
        : '<div class="md-loading">Dis bonjour à l\'équipe adverse 👋 (couleur des maillots, retard, ballon…)</div>';
      if (enBas) box.scrollTop = box.scrollHeight;
    } catch (e) { box.innerHTML = `<div class="md-loading">${esc(e.message)}</div>`; }
  };
  window.sendChatMessage = async function () {
    const inp = document.getElementById('chat-input');
    const texte = (inp.value || '').trim();
    if (!texte || !chatId) return;
    inp.value = '';
    try { await MD.post('/api/matchs', { action: 'chat', matchId: chatId, texte }); fetchChatMessages(); }
    catch (e) { inp.value = texte; showToast(e.message.toUpperCase(), 'error'); }
  };
  window.envoyerMessage = window.sendChatMessage;
  window.renderChatMessages = function () {};
  window.loadChatFromStorage = function () {};

  // ---------------------------------------------------------------
  // Paiements : reçus depuis le serveur
  // ---------------------------------------------------------------
  window.loadPaiements = async function () {
    const list = document.getElementById('pay-list');
    if (!list) return;
    list.innerHTML = MD.chargement();
    try {
      const p = await MD.api('/api/checkout?paiements=1');
      const total = p.filter(x => x.statut === 'paye' || x.statut === 'rembourse').reduce((s, x) => s + x.montant, 0);
      const remb = p.filter(x => x.statut === 'rembourse').reduce((s, x) => s + x.montant, 0);
      document.getElementById('pay-total').textContent = MD.euros(total / 100);
      document.getElementById('pay-refunds').textContent = MD.euros(remb / 100);
      list.innerHTML = p.length ? p.map(x => `<div class="md-pay-ligne">
          <div><div class="md-v md-v-sm">${esc(x.terrain || 'Match')}</div><div class="md-s">${esc(MD.fmtJour(x.date_iso, true))} · ${esc({ acompte: 'Acompte', total: 'Paiement total', part: 'Ma part' }[x.mode] || x.mode)} · payé le ${new Date(x.created_at).toLocaleDateString('fr-FR')}</div></div>
          <div class="md-pay-montant">${MD.euros(x.montant / 100)}<div class="md-s">${x.statut === 'rembourse' ? '↩︎ Remboursé' : x.statut === 'paye' ? '✓ Payé' : esc(x.statut)}</div></div>
        </div>`).join('') : MD.vide('💳', 'Aucun paiement', 'Tes paiements apparaîtront ici.');
    } catch (e) { list.innerHTML = MD.vide('😕', 'Impossible de charger', e.message); }
  };

  // ---------------------------------------------------------------
  // Tableau de bord : prochains matchs
  // ---------------------------------------------------------------
  MD.majDashboardProchains = function (aVenir) {
    const c = document.getElementById('db-prochains-matchs');
    if (!c) return;
    c.innerHTML = aVenir.length ? aVenir.slice(0, 3).map(m => `<div class="md-mini" onclick="showPage('mes-matchs', document.getElementById('nav-mes-matchs'))">
        <div class="md-v md-v-sm">${esc(MD.fmtJour(m.date_iso, true))} · ${MD.minutesDebut(m.heure) != null ? MD.fmtHeure(MD.minutesDebut(m.heure)) : ''}</div>
        <div class="md-s">${esc(m.terrain)} · ${esc(nomAdversaire(m))}</div></div>`).join('')
      : MD.vide('⚽', 'Aucun match à venir', 'Réserve un five en 1 minute.', `<button class="btn btn-primary" onclick="openModal('creer')">+ Réserver</button>`);
  };
})();
