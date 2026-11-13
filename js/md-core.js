// =====================================================================
// Matchday : socle commun des nouvelles fonctionnalités
// Chargé après le script principal de l'app. Les fonctions de l'app
// sont remplacées par affectation (window.x = ...) et jamais par une
// nouvelle déclaration "function x", pour éviter les boucles infinies
// dues au hoisting.
// =====================================================================
(function () {
  const MD = window.MD = window.MD || {};

  // ---------- Texte ----------
  MD.esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  // Pour mettre une valeur dans un attribut onclick="f('...')"
  MD.js = function (t) { return MD.esc(JSON.stringify(String(t == null ? '' : t))); };

  // ---------- API ----------
  MD.api = async function (path, opts) {
    const res = await apiFetch(path, opts);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) throw new Error((data && data.error) || 'Erreur, réessaie.');
    return data;
  };
  MD.post = function (path, body) {
    return MD.api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  };
  MD.del = function (path) { return MD.api(path, { method: 'DELETE' }); };

  MD.session = function () { try { return getSession(); } catch (e) { return null; } };
  MD.connecte = function () { const s = MD.session(); return !!(s && s.token); };
  MD.exigerConnexion = function (raison) {
    if (MD.connecte()) return true;
    try { sessionStorage.setItem('md_apres_login', location.search); } catch (e) {}
    showToast((raison || 'Connecte-toi pour continuer').toUpperCase(), 'error');
    const g = document.getElementById('authGate'); if (g) g.classList.add('show');
    return false;
  };

  // ---------- Dates et heures ----------
  // Accepte "19h", "19h30", "19:30", "10:00 – 11:00", "19h–20h"
  MD.minutesDebut = function (heure) {
    if (!heure) return null;
    const debut = String(heure).split(/[–-]/)[0].trim().toLowerCase();
    const m = debut.match(/^(\d{1,2})\s*[h:]\s*(\d{2})?/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  };
  MD.dateDebut = function (match) {
    if (!match || !match.date_iso) return null;
    const min = MD.minutesDebut(match.heure);
    const d = new Date(match.date_iso + 'T00:00:00');
    if (min != null) d.setMinutes(min);
    else d.setHours(20);
    return d;
  };
  MD.fmtHeure = function (min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? String(m).padStart(2, '0') : '');
  };
  MD.fmtPlage = function (min, duree) { return MD.fmtHeure(min) + '–' + MD.fmtHeure(min + (duree || 60)); };
  MD.iso = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  MD.aujourdhui = function () { return MD.iso(new Date()); };
  MD.fmtJour = function (iso, long) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    const auj = MD.aujourdhui();
    const dem = MD.iso(new Date(Date.now() + 86400000));
    if (iso === auj) return long ? "Aujourd'hui" : "Auj.";
    if (iso === dem) return 'Demain';
    return d.toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
  };
  MD.heuresAvant = function (match) {
    const d = MD.dateDebut(match);
    return d ? (d - Date.now()) / 3600000 : null;
  };
  MD.estPasse = function (match) {
    const d = MD.dateDebut(match);
    if (!d) return false;
    return d.getTime() + (match.duree || 60) * 60000 < Date.now();
  };
  // "2026–27" : la saison commence en août
  MD.saison = function () {
    const d = new Date(), y = d.getFullYear();
    const debut = d.getMonth() >= 7 ? y : y - 1;
    return debut + '–' + String((debut + 1) % 100).padStart(2, '0');
  };

  // ---------- Prix ----------
  MD.prixTerrain = function (m) {
    const p = parseInt(String((m && (m.prix != null ? m.prix : m.price)) || '').replace(/[^\d]/g, ''), 10);
    return isNaN(p) ? null : p;
  };
  MD.parJoueur = function (prixTerrain, nb) {
    if (!prixTerrain) return null;
    const v = prixTerrain / (nb || 10);
    return Math.round(v * 10) / 10;
  };
  MD.euros = function (v) {
    if (v == null) return '—';
    return (Math.round(v * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
  };

  // ---------- Position ----------
  MD.position = function () {
    const lat = parseFloat(localStorage.getItem('md_lat')), lng = parseFloat(localStorage.getItem('md_lng'));
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
  };
  MD.localiser = function () {
    return new Promise((resolve) => {
      const p = MD.position();
      if (p) return resolve(p);
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(pos => {
        localStorage.setItem('md_lat', pos.coords.latitude);
        localStorage.setItem('md_lng', pos.coords.longitude);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, () => resolve(null), { timeout: 8000 });
    });
  };
  MD.distanceKm = function (a, b) {
    if (!a || !b || b.lat == null || b.lng == null) return null;
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  };
  MD.fmtKm = function (km) { return km == null ? '' : (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km'); };

  // ---------- Fives ----------
  MD.fives = [];
  MD.chargerFives = async function () {
    try { MD.fives = await MD.api('/api/fives'); } catch (e) { MD.fives = MD.fives || []; }
    return MD.fives;
  };
  MD.five = function (nom) { return (MD.fives || []).find(f => (f.nom || f.name) === nom) || null; };
  MD.lienMaps = function (f, m) {
    const q = (f && (f.adresse || ((f.nom || '') + ' ' + (f.lieu || '')))) || ((m && (m.terrain + ' ' + (m.lieu || ''))) || '');
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
  };

  // ---------- Modales ----------
  // Crée (une seule fois) une modale avec le même style que celles de l'app.
  MD.modal = function (id, titre, contenu, largeur) {
    let o = document.getElementById('modal-' + id);
    if (!o) {
      o = document.createElement('div');
      o.className = 'modal-overlay';
      o.id = 'modal-' + id;
      o.addEventListener('click', e => { if (e.target === o) MD.fermer(id); });
      document.body.appendChild(o);
    }
    o.innerHTML = `<div class="modal md-modal" style="max-width:${largeur || 520}px;">
      <div class="modal-header">
        <div class="modal-title">${titre}</div>
        <button class="modal-close" onclick="MD.fermer('${id}')">✕</button>
      </div>
      <div class="md-modal-body" id="md-body-${id}">${contenu}</div>
    </div>`;
    o.classList.add('open');
    return o;
  };
  MD.corps = function (id) { return document.getElementById('md-body-' + id); };
  MD.fermer = function (id) { const o = document.getElementById('modal-' + id); if (o) o.classList.remove('open'); };

  MD.chargement = function (txt) { return `<div class="md-loading">${MD.esc(txt || 'Chargement…')}</div>`; };
  MD.vide = function (icone, titre, sous, boutons) {
    return `<div class="empty-block md-empty"><div class="e-icon">${icone}</div><div class="e-title">${titre}</div><div class="e-sub">${sous}</div>${boutons ? `<div class="md-empty-actions">${boutons}</div>` : ''}</div>`;
  };

  // ---------- Partage ----------
  MD.partager = async function (titre, texte, url) {
    if (navigator.share) {
      try { await navigator.share({ title: titre, text: texte, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    MD.whatsapp(texte + (url ? '\n' + url : ''));
  };
  MD.whatsapp = function (texte) {
    window.open('https://wa.me/?text=' + encodeURIComponent(texte), '_blank', 'noopener');
  };
  MD.copier = async function (texte, ok) {
    try { await navigator.clipboard.writeText(texte); showToast(ok || 'LIEN COPIÉ'); }
    catch (e) { prompt('Copie ce lien :', texte); }
  };

  // ---------- Fichier calendrier (.ics) ----------
  MD.ics = function (m) {
    const debut = MD.dateDebut(m);
    if (!debut) { showToast('DATE DU MATCH INCONNUE', 'error'); return; }
    const fin = new Date(debut.getTime() + (m.duree || 60) * 60000);
    const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const f5 = MD.five(m.terrain);
    const titre = m.type === 'terrain' ? `Five · ${m.terrain}` : `${m.equipe1 || 'Match'} vs ${m.equipe2 || '?'} · ${m.terrain}`;
    const lignes = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matchday//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + m.id + '@matchday', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(debut), 'DTEND:' + f(fin),
      'SUMMARY:' + titre.replace(/[,;]/g, ' '),
      'LOCATION:' + ((f5 && f5.adresse) || (m.terrain + ' ' + (m.lieu || ''))).replace(/[,;]/g, ' '),
      'DESCRIPTION:Match Matchday. Arrive 10 min avant.',
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Match dans 2h', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([lignes.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'match-matchday.ics';
    document.body.appendChild(a); a.click(); a.remove();
  };

  // ---------- Couleurs de maillot ----------
  MD.COULEURS = [
    { id: 'blanc', nom: 'Blanc', hex: '#F5F5F5' }, { id: 'noir', nom: 'Noir', hex: '#181614' },
    { id: 'rouge', nom: 'Rouge', hex: '#E63012' }, { id: 'bleu', nom: 'Bleu', hex: '#1B5FDB' },
    { id: 'vert', nom: 'Vert', hex: '#1E9E4A' }, { id: 'jaune', nom: 'Jaune', hex: '#F2C200' },
    { id: 'orange', nom: 'Orange', hex: '#F07A1A' }, { id: 'chasubles', nom: 'Chasubles', hex: '#C8F520' }
  ];
  MD.couleur = function (id) { return MD.COULEURS.find(c => c.id === id) || null; };
  MD.pastille = function (id) {
    const c = MD.couleur(id);
    return c ? `<span class="md-pastille" style="background:${c.hex}" title="${c.nom}"></span>${c.nom}` : '';
  };
  MD.choixCouleur = function (nomChamp, selection, exclure) {
    return `<div class="md-couleurs">${MD.COULEURS.filter(c => c.id !== exclure).map(c =>
      `<label class="md-couleur"><input type="radio" name="${nomChamp}" value="${c.id}" ${c.id === selection ? 'checked' : ''}><span style="background:${c.hex}"></span>${c.nom}</label>`
    ).join('')}</div>`;
  };

  // ---------- Niveaux ----------
  MD.niveauTag = function (n) {
    const cls = n === 'Débutant' ? 'tag-green' : n === 'Avancé' ? 'tag-red' : 'tag-blue';
    return `<span class="tag ${cls}" style="font-size:9px;">${MD.esc(n || 'Tous niveaux')}</span>`;
  };

  // ---------- Fiabilité d'une équipe (affichée avant de rejoindre) ----------
  MD.blocStats = function (s) {
    if (!s || !s.joues) return `<span class="md-new">Nouvelle équipe</span>`;
    const parts = [`${s.joues} match${s.joues > 1 ? 's' : ''}`];
    if (s.note) parts.push(`★ ${s.note}`);
    if (s.annulations != null) parts.push(s.annulations === 0 ? '0 annulation' : `${s.annulations} annul.`);
    return `<span class="md-stats">${parts.map(MD.esc).join(' · ')}</span>`;
  };
})();
