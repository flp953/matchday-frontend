// =====================================================================
// Matchday : alertes "préviens-moi", notifications push, app installable
// =====================================================================
(function () {
  const MD = window.MD;
  const esc = MD.esc;
  const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  function resumeAlerte(a) {
    const j = (a.jours && a.jours.length && a.jours.length < 7) ? a.jours.map(x => JOURS[x - 1]).join(', ') : 'Tous les jours';
    return `${j} · ${a.heure_min ? 'après ' + MD.fmtHeure(a.heure_min) : 'toute la journée'} · ${a.niveau || 'tous niveaux'}${a.ville ? ' · ' + a.ville : ''}`;
  }

  MD.formAlerte = function (pre) {
    if (!MD.exigerConnexion('Connecte-toi pour créer une alerte')) return;
    pre = pre || {};
    MD.modal('alerte', '🔔 Me prévenir', `
      <p class="md-p">On t'envoie un mail (et une notification si tu l'as activée) dès qu'une équipe publie un match qui correspond.</p>
      <div class="form-group"><label class="form-label">Quels jours ?</label>
        <div class="md-jours-sem">${JOURS.map((j, i) => `<label><input type="checkbox" value="${i + 1}" ${!pre.jours || pre.jours.includes(i + 1) ? 'checked' : ''}><span>${j}</span></label>`).join('')}</div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">À partir de</label>
          <select class="form-input" id="al-heure"><option value="">Peu importe</option>${[12, 17, 18, 19, 20, 21].map(h => `<option value="${h * 60}" ${pre.heure_min === h * 60 ? 'selected' : ''}>${h}h</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Niveau</label>
          <select class="form-input" id="al-niveau"><option value="">Tous</option>${['Débutant', 'Intermédiaire', 'Avancé'].map(n => `<option ${pre.niveau === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label">Ville ou quartier (optionnel)</label><input class="form-input" id="al-ville" maxlength="40" value="${esc(pre.ville || '')}" placeholder="Paris 11e, Montreuil…"></div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('alerte')">Annuler</button>
      <button class="btn btn-lime" onclick="MD.validerAlerte()">Créer l'alerte</button></div>`, 480);
  };

  MD.validerAlerte = async function () {
    const jours = Array.from(document.querySelectorAll('#modal-alerte .md-jours-sem input:checked')).map(i => parseInt(i.value, 10));
    if (!jours.length) { showToast('CHOISIS AU MOINS UN JOUR', 'error'); return; }
    try {
      await MD.post('/api/alertes', {
        jours, heure_min: parseInt(document.getElementById('al-heure').value, 10) || null,
        niveau: document.getElementById('al-niveau').value || null,
        ville: document.getElementById('al-ville').value.trim() || null
      });
      MD.fermer('alerte'); showToast('🔔 ALERTE CRÉÉE');
      if ('Notification' in window && Notification.permission === 'default') MD.proposerPush();
      if (document.getElementById('page-notifs').classList.contains('active')) loadNotifications();
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };

  // Depuis l'écran vide de "Trouver un match" : on reprend les filtres en cours
  MD.alerteDepuisFiltres = function () {
    const F = MD.filtres || {};
    const pre = {};
    if (F.quand === 'weekend') pre.jours = [5, 6, 7];
    if (F.quand === 'date' && F.date) { const d = new Date(F.date + 'T12:00:00').getDay(); pre.jours = [d === 0 ? 7 : d]; }
    if (F.heure === 'apres19') pre.heure_min = 19 * 60;
    if (F.heure === 'apres21') pre.heure_min = 21 * 60;
    if (F.quand === 'soir') pre.heure_min = 18 * 60;
    if (F.niveau) pre.niveau = F.niveau;
    if (F.q) pre.ville = F.q;
    MD.formAlerte(pre);
  };

  MD.supprimerAlerte = async function (id) {
    try { await MD.del('/api/alertes?id=' + encodeURIComponent(id)); loadNotifications(); } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
  };

  // ---------------------------------------------------------------
  // Page "Notifications" : alertes + activité de mes matchs
  // ---------------------------------------------------------------
  window.loadNotifications = async function () {
    const c = document.getElementById('notifs-container');
    if (!c) return;
    if (!MD.connecte()) { c.innerHTML = ''; return; }
    c.innerHTML = MD.chargement();
    let alertes = [];
    try { alertes = await MD.api('/api/alertes'); } catch (e) {}
    if (!MD.mesMatchs.length) { try { MD.mesMatchs = await MD.api('/api/matchs?mine=1'); } catch (e) {} }
    const pushOk = 'Notification' in window && Notification.permission === 'granted';
    const activite = [];
    MD.mesMatchs.forEach(m => {
      if (m.statut === 'confirmed' && m.type !== 'terrain' && !MD.estPasse(m)) activite.push({ t: MD.dateDebut(m), txt: `🔥 ${m.ma_equipe === 1 ? (m.equipe2 || 'Une équipe') + ' a relevé ton défi' : 'Tu affrontes ' + m.equipe1} · ${MD.fmtJour(m.date_iso, true)} au ${m.terrain}` });
      if (m.statut === 'open' && !MD.estPasse(m)) activite.push({ t: MD.dateDebut(m), txt: `⏳ ${m.terrain} · ${MD.fmtJour(m.date_iso, true)} : on cherche encore un adversaire` });
      if (MD.estPasse(m) && m.statut === 'confirmed' && m.type !== 'terrain' && (!m.a_note || !m.score_valide)) activite.push({ t: MD.dateDebut(m), txt: `⭐ Pense à ${!m.score_valide ? 'saisir le score' : ''}${!m.score_valide && !m.a_note ? ' et ' : ''}${!m.a_note ? 'noter l\'adversaire' : ''} (${m.terrain})` });
    });
    activite.sort((a, b) => (b.t || 0) - (a.t || 0));
    c.innerHTML = `
      <div class="md-card">
        <div class="md-card-head"><span class="md-card-titre">Mes alertes</span><button class="btn btn-lime btn-sm" onclick="MD.formAlerte()">+ Nouvelle alerte</button></div>
        ${alertes.length ? alertes.map(a => `<div class="md-pay-ligne"><div>${esc(resumeAlerte(a))}</div><button class="btn btn-outline btn-sm" onclick="MD.supprimerAlerte('${esc(a.id)}')">Supprimer</button></div>`).join('')
        : '<p class="md-p" style="padding:0 18px 16px;">Aucune alerte. Crée-en une pour être prévenu dès qu\'un match qui te va est publié.</p>'}
      </div>
      <div class="md-card">
        <div class="md-card-head"><span class="md-card-titre">Notifications sur cet appareil</span>
          ${pushOk ? '<span class="tag tag-green">ACTIVÉES</span>' : `<button class="btn btn-outline btn-sm" onclick="MD.activerPush()">Activer</button>`}</div>
        <p class="md-p" style="padding:0 18px 16px;">Adversaire trouvé, match demain, nouveau match qui correspond à tes alertes.${MD.installable ? ' <button class="md-lien" onclick="MD.installer()">Installer l\'app sur l\'écran d\'accueil →</button>' : ''}</p>
      </div>
      <div class="section-title">Activité</div>
      ${activite.length ? activite.map(a => `<div class="md-pay-ligne"><div>${esc(a.txt)}</div></div>`).join('') : MD.vide('🔔', 'Rien de neuf', 'Tes prochains matchs et rappels apparaîtront ici.')}`;
  };

  // ---------------------------------------------------------------
  // App installable (PWA) et notifications push
  // ---------------------------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
  let evtInstall = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evtInstall = e; MD.installable = true; });
  MD.installer = async function () {
    if (!evtInstall) { showToast('UTILISE "AJOUTER À L\'ÉCRAN D\'ACCUEIL" DANS TON NAVIGATEUR'); return; }
    evtInstall.prompt(); evtInstall = null; MD.installable = false;
  };

  function b64ToUint8(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
  MD.activerPush = async function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { showToast('PAS SUPPORTÉ SUR CE NAVIGATEUR (SUR IPHONE : INSTALLE L\'APP D\'ABORD)', 'error'); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { showToast('NOTIFICATIONS REFUSÉES', 'error'); return; }
      const { cle } = await MD.api('/api/alertes?vapid=1');
      if (!cle) { showToast('NOTIFICATIONS PAS ENCORE CONFIGURÉES CÔTÉ SERVEUR', 'error'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(cle) });
      await MD.post('/api/alertes', { action: 'push', subscription: sub.toJSON() });
      showToast('🔔 NOTIFICATIONS ACTIVÉES');
      if (document.getElementById('page-notifs').classList.contains('active')) loadNotifications();
    } catch (e) { showToast((e.message || 'ERREUR').toUpperCase(), 'error'); }
  };
  MD.proposerPush = function () {
    MD.modal('push', 'Être prévenu sur ton téléphone ?', `
      <p class="md-p">Une notification quand une équipe relève ton défi, la veille du match, et quand un match correspond à tes alertes. Rien d'autre.</p>
      <div class="modal-footer"><button class="btn btn-outline" onclick="MD.fermer('push')">Plus tard</button>
      <button class="btn btn-lime" onclick="MD.fermer('push');MD.activerPush()">Activer</button></div>`, 420);
  };
})();
