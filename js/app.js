// =====================================================================
// Matchday : app joueur. Une seule page, 4 onglets, des feuilles du bas.
// Objectif : réserver ou défier une équipe en moins d'une minute.
// =====================================================================
const API_BASE = 'https://matchday-backend-eight.vercel.app';
const SESSION_KEY = 'matchday_session';

const App = (() => {
  // ---------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const js = (t) => esc(JSON.stringify(String(t == null ? '' : t)));

  function session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
  function nomJoueur() { const s = session(); return s ? (s.pseudo || s.email.split('@')[0]) : ''; }

  async function api(path, opts) {
    opts = opts || {};
    const s = session();
    const headers = Object.assign({}, opts.headers || {});
    if (s && s.token) headers.Authorization = 'Bearer ' + s.token;
    if (opts.body && typeof opts.body !== 'string') { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
    const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
    if (res.status === 401 && s && !path.startsWith('/api/auth')) { deconnexion(true); throw new Error('Session expirée, reconnecte-toi.'); }
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) throw new Error((data && data.error) || 'Erreur, réessaie.');
    return data;
  }
  const post = (p, b) => api(p, { method: 'POST', body: b || {} });

  let toastT;
  function toast(msg, erreur) {
    const t = $('toast');
    t.textContent = msg; t.className = 'ok' + (erreur ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 3200);
  }

  // Dates (heures de Paris, saisies telles quelles)
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const auj = () => iso(new Date());
  const decale = n => iso(new Date(Date.now() + n * 86400000));
  function minutesDebut(h) {
    if (!h) return null;
    const m = String(h).split(/[–-]/)[0].trim().toLowerCase().match(/^(\d{1,2})\s*[h:]\s*(\d{2})?/);
    return m ? parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0) : null;
  }
  function debut(m) {
    if (!m || !m.date_iso) return null;
    const d = new Date(m.date_iso + 'T00:00:00'); const min = minutesDebut(m.heure);
    d.setMinutes(min == null ? 20 * 60 : min); return d;
  }
  const passe = m => { const d = debut(m); return !!d && d.getTime() + (m.duree || 60) * 60000 < Date.now(); };
  const hAvant = m => { const d = debut(m); return d ? (d - Date.now()) / 3600000 : null; };
  const fh = min => Math.floor(min / 60) + 'h' + (min % 60 ? String(min % 60).padStart(2, '0') : '');
  function jour(isoD, long) {
    if (!isoD) return '';
    if (isoD === auj()) return "Aujourd'hui";
    if (isoD === decale(1)) return 'Demain';
    return new Date(isoD + 'T12:00:00').toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const euros = v => v == null ? '—' : (Math.round(v * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';

  // Distance
  function km(f) {
    if (!pos || !f || f.lat == null || f.lng == null) return null;
    const R = 6371, r = x => x * Math.PI / 180, lat = parseFloat(f.lat), lng = parseFloat(f.lng);
    const a = Math.sin(r(lat - pos.lat) / 2) ** 2 + Math.cos(r(pos.lat)) * Math.cos(r(lat)) * Math.sin(r(lng - pos.lng) / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  const fkm = d => d == null ? '' : d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1).replace('.', ',') + ' km';
  const maps = (f, m) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent((f && f.adresse) || ((m && m.terrain) + ' ' + ((m && m.lieu) || '')));

  // Prix : chaque five fixe un prix par joueur (pour 1h)
  const pjFive = (f, duree) => { const base = parseFloat(f.prix_joueur) || Math.round((parseFloat(f.prix) || 80) / 10); return Math.round(base * (duree || 60) / 60 * 100) / 100; };
  const pjMatch = m => parseFloat(m.prix_joueur) || Math.round((parseInt(String(m.prix || '').replace(/\D/g, ''), 10) || 80) / 10);

  const COULEURS = [['blanc', '#F5F5F5'], ['noir', '#141210'], ['rouge', '#E63012'], ['bleu', '#1B5FDB'], ['vert', '#1E9E4A'], ['jaune', '#F2C200'], ['orange', '#F07A1A']];

  // ---------------------------------------------------------------
  // État
  // ---------------------------------------------------------------
  let pos = null, fives = [], publics = [], mes = [], vueActive = 'jouer';
  try { const p = JSON.parse(localStorage.getItem('md_pos')); if (p && Date.now() - p.t < 6 * 3600000) pos = p; } catch (e) {}

  // ---------------------------------------------------------------
  // Localisation : on la demande dès l'ouverture
  // ---------------------------------------------------------------
  function majLoc() {
    const b = $('loc');
    if (pos) { b.textContent = '📍 Autour de moi'; b.classList.remove('off'); }
    else { b.textContent = '📍 Activer ma position'; b.classList.add('off'); }
  }
  function localiser(insister) {
    return new Promise(resolve => {
      if (!navigator.geolocation) { if (insister) toast('Ton navigateur ne donne pas ta position', true); return resolve(null); }
      navigator.geolocation.getCurrentPosition(p => {
        pos = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
        localStorage.setItem('md_pos', JSON.stringify(pos));
        majLoc(); if (vueActive === 'jouer') vueJouer(); resolve(pos);
      }, () => {
        majLoc();
        if (insister) toast('Position refusée : autorise-la dans ton navigateur', true);
        resolve(null);
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    });
  }

  // ---------------------------------------------------------------
  // Créneaux libres d'un five
  // ---------------------------------------------------------------
  function horaires(txt) {
    const t = String(txt || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?\s*[-–à]\s*(\d{1,2})\s*[h:]?\s*(\d{2})?/i);
    if (!t) return { ouv: 9 * 60, ferm: 23 * 60 };
    let ouv = parseInt(t[1], 10) * 60 + (t[2] ? parseInt(t[2], 10) : 0), ferm = parseInt(t[3], 10) * 60 + (t[4] ? parseInt(t[4], 10) : 0);
    if (ferm <= ouv) ferm = 24 * 60;
    return { ouv, ferm };
  }
  // type 'match' : au moins 3h d'avance (le temps qu'une équipe relève le défi)
  function libres(f, isoD, duree, type) {
    const { ouv, ferm } = horaires(f.horaires);
    const cap = parseInt(f.nb_terrains, 10) || 1;
    const pris = publics.filter(m => m.terrain === f.nom && m.date_iso === isoD && m.statut !== 'cancelled')
      .map(m => { const d = minutesDebut(m.heure); return d == null ? null : [d, d + (m.duree || 60)]; })
      .concat((f.bloques || []).filter(b => b.date === isoD).map(b => { const d = minutesDebut(b.heure); return d == null ? null : [d, d + (b.duree || 60)]; }))
      .filter(Boolean);
    const now = new Date(), mini = isoD === auj() ? now.getHours() * 60 + now.getMinutes() + (type === 'terrain' ? 60 : 180) : 0;
    const out = [];
    for (let h = ouv; h + duree <= ferm; h += 30) {
      if (h < mini) continue;
      if (pris.filter(([a, b]) => h < b && a < h + duree).length < cap) out.push(h);
    }
    return out;
  }
  function prochainCreneau(f) {
    for (let i = 0; i < 7; i++) { const d = decale(i), l = libres(f, d, 60, 'match'); if (l.length) return { d, h: l[0] }; }
    return null;
  }

  // ---------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------
  async function charger() {
    const [f, m] = await Promise.all([api('/api/fives').catch(() => fives), api('/api/matchs').catch(() => publics)]);
    fives = Array.isArray(f) ? f : []; publics = Array.isArray(m) ? m : [];
  }
  async function chargerMes() {
    try { mes = await api('/api/matchs?mine=1'); } catch (e) { mes = mes || []; }
    const n = mes.filter(m => m.statut !== 'cancelled' && !passe(m)).length;
    const p = $('nb-mes'); p.textContent = n; p.hidden = !n;
    return mes;
  }

  // ---------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------
  function aller(v) {
    vueActive = v;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.vue === v));
    window.scrollTo(0, 0);
    ({ jouer: vueJouer, mes: vueMes, classement: vueClassement, profil: vueProfil })[v]();
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => aller(t.dataset.vue)));

  const squelettes = n => Array.from({ length: n }, () => '<div class="squelette"></div>').join('');
  const vide = (i, t, p, btn) => `<div class="vide"><i>${i}</i><b>${t}</b><p>${p}</p>${btn || ''}</div>`;

  // ---------------------------------------------------------------
  // Onglet JOUER
  // ---------------------------------------------------------------
  async function vueJouer() {
    const v = $('vue');
    if (!fives.length) v.innerHTML = `<div class="vue">${squelettes(4)}</div>`;
    await charger();
    if (vueActive !== 'jouer') return;
    const fs = fives.map(f => ({ f, d: km(f) })).sort((a, b) => (a.d == null ? 9e9 : a.d) - (b.d == null ? 9e9 : b.d));
    const defis = publics.filter(m => m.statut === 'open' && m.type !== 'terrain' && (hAvant(m) || 0) > 2)
      .map(m => ({ m, d: km(fives.find(f => f.nom === m.terrain)) }))
      .sort((a, b) => debut(a.m) - debut(b.m)).slice(0, 8);

    v.innerHTML = `<div class="vue">
      <div class="titre">Salut ${esc(nomJoueur())} 👋</div>
      <div class="sous">${pos ? 'Les fives les plus proches de toi.' : 'Active ta position pour voir les fives autour de toi.'}</div>
      ${!pos ? `<button class="btn lime plein" onclick="App.localiser(true)">📍 Voir les fives autour de moi</button>` : ''}

      ${defis.length ? `<div class="section"><h2>⚔️ Ils cherchent un adversaire</h2><small>${defis.length}</small></div>
      ${defis.map(({ m, d }) => carteDefi(m, d)).join('')}` : ''}

      <div class="section"><h2>🏟️ Fives ${pos ? 'autour de toi' : ''}</h2><small>${fs.length}</small></div>
      ${fs.length ? fs.map(({ f, d }) => carteFive(f, d)).join('') : vide('🏟️', 'Aucun five pour l\'instant', 'Les fives partenaires arrivent bientôt.')}
      ${!defis.length && fs.length ? `<div class="info">Personne ne cherche d'adversaire pour l'instant. Réserve un five : ton défi apparaîtra ici pour les autres équipes. <button class="btn petit clair" style="margin-top:8px" onclick="App.alerte()">🔔 Me prévenir quand un match tombe</button></div>` : ''}
    </div>`;
  }

  function carteDefi(m, d) {
    const min = minutesDebut(m.heure), s = m.stats1 || {};
    const fiab = s.joues ? `${s.joues} match${s.joues > 1 ? 's' : ''}${s.note ? ' · ★ ' + s.note : ''}${s.annulations === 0 ? ' · 0 annulation' : ''}` : 'Nouvelle équipe';
    return `<div class="carte tap" onclick="App.defier(${js(m.id)})">
      <div class="ligne">
        <div class="heure">${min != null ? fh(min) : ''}<small>${esc(jour(m.date_iso))}</small></div>
        <div class="grow"><div class="nom">${esc(m.equipe1)}</div><div class="fiab">${esc(fiab)}</div>
          <div class="meta">${esc(m.terrain)}${d != null ? ' · ' + fkm(d) : ''}</div></div>
        <div class="prix">${euros(pjMatch(m))}<small>/joueur</small></div>
      </div>
      <div class="actions"><span class="badge ${m.niveau === 'Avancé' ? 'rouge' : m.niveau === 'Débutant' ? 'lime' : 'bleu'}">${esc(m.niveau || 'Tous niveaux')}</span><span style="flex:1"></span><button class="btn petit lime">Relever le défi →</button></div>
    </div>`;
  }

  function carteFive(f, d) {
    const p = prochainCreneau(f);
    const img = f.photos && f.photos[0] ? `<img src="${esc(f.photos[0])}" alt="" loading="lazy">` : esc(f.nom.split(' ').map(x => x[0]).join('').slice(0, 2));
    const auj0 = libres(f, auj(), 60, 'terrain').slice(0, 8);
    return `<div class="carte tap" onclick="App.reserver(${js(f.nom)})">
      <div class="ligne">
        <div class="five-img">${img}</div>
        <div class="grow"><div class="nom">${esc(f.nom)}</div>
          <div class="meta">${esc(f.lieu || '')}${d != null ? ' · ' + fkm(d) : ''}${f.note_moyenne ? ' · ★ ' + f.note_moyenne : ''}</div>
          <div class="meta">${p ? 'Dispo ' + jour(p.d).toLowerCase() + ' à ' + fh(p.h) : 'Complet cette semaine'}</div></div>
        <div class="prix">${euros(pjFive(f, 60))}<small>/joueur</small></div>
      </div>
      ${auj0.length ? `<div class="creneaux">${auj0.map(h => `<span class="cr">${fh(h)}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------
  // Feuille du bas
  // ---------------------------------------------------------------
  function ouvrir(html) {
    $('feuille').innerHTML = '<div class="poignee"></div>' + html;
    $('feuille').scrollTop = 0;
    $('voile').classList.add('ouvert'); $('feuille').classList.add('ouvert');
  }
  function fermer() {
    $('voile').classList.remove('ouvert'); $('feuille').classList.remove('ouvert');
    clearInterval(chatT);
  }
  const tete = (t, s) => `<div class="f-titre"><div><h3>${t}</h3>${s ? `<div class="meta" style="margin-top:4px">${s}</div>` : ''}</div><button class="fermer" onclick="App.fermer()">✕</button></div>`;

  // Bloc paiement commun : acompte (1 part) ou tout payer (5 parts)
  let mode = 'acompte';
  function blocPaiement(pj, parts) {
    const total = pj * parts;
    return `<div class="etiquette">Paiement</div>
      <div class="payer">
        <button class="opt ${mode === 'acompte' ? 'on' : ''}" onclick="App.mode('acompte')"><span class="t">Acompte</span><b>${euros(pj)}</b><small>1 part. Le reste sur place.</small></button>
        <button class="opt ${mode === 'total' ? 'on' : ''}" onclick="App.mode('total')"><span class="t">Tout payer</span><b>${euros(total)}</b><small>${parts} parts. Rien sur place.</small></button>
      </div>
      <div class="recap">
        <div><span>Prix par joueur</span><b>${euros(pj)}</b></div>
        <div><span>${parts === 5 ? 'Ton équipe (5 joueurs)' : 'Le terrain (10 joueurs)'}</span><b>${euros(total)}</b></div>
        <div><span>À payer sur place</span><b>${euros(mode === 'acompte' ? total - pj : 0)}</b></div>
      </div>`;
  }
  function couleurs(sel, exclure) {
    return `<div class="couleurs">${COULEURS.filter(c => c[0] !== exclure).map(([id, hex]) => `<button class="coul ${id === sel ? 'on' : ''}" style="background:${hex}" title="${id}" onclick="App.couleur('${id}')"></button>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------
  // RÉSERVER un five
  // ---------------------------------------------------------------
  const R = {};
  function reserver(nom, pre) {
    const f = fives.find(x => x.nom === nom);
    if (!f) return;
    Object.assign(R, { five: f, date: auj(), h: null, duree: 60, type: 'match', couleur: 'blanc', equipe: localStorage.getItem('md_equipe') || nomJoueur() + ' FC', rejoue: null }, pre || {});
    mode = 'acompte';
    // Premier jour avec un créneau libre
    if (!pre || !pre.date) for (let i = 0; i < 14; i++) { if (libres(f, decale(i), R.duree, R.type).length) { R.date = decale(i); break; } }
    rendreReserver();
  }
  function rendreReserver() {
    const f = R.five, pj = pjFive(f, R.duree), parts = R.type === 'terrain' ? 10 : 5;
    const l = libres(f, R.date, R.duree, R.type);
    if (R.h != null && !l.includes(R.h)) R.h = null;
    const equip = [f.surfaces, f.vestiaires && 'Vestiaires', f.douches && 'Douches', f.parking && 'Parking', f.metro && '🚇 ' + f.metro].filter(Boolean);
    const d = km(f);
    ouvrir(`${tete(esc(f.nom), `${esc(f.adresse || f.lieu || '')}${d != null ? ' · ' + fkm(d) : ''} · <a href="${maps(f)}" target="_blank" rel="noopener">Itinéraire</a>`)}
      ${equip.length ? `<div class="actions" style="margin-top:0">${equip.map(e => `<span class="badge">${esc(e)}</span>`).join('')}</div>` : ''}
      <div class="etiquette">Tu veux…</div>
      <div class="seg">
        <button class="${R.type === 'match' ? 'on' : ''}" onclick="App.r({type:'match'})">⚔️ Défier une équipe</button>
        <button class="${R.type === 'terrain' ? 'on' : ''}" onclick="App.r({type:'terrain'})">🤝 Jouer entre potes</button>
      </div>
      <div class="etiquette">Quel jour ?</div>
      <div class="jours">${Array.from({ length: 14 }, (_, i) => decale(i)).map(x => {
        const dt = new Date(x + 'T12:00:00');
        return `<button class="jour ${x === R.date ? 'on' : ''}" onclick="App.r({date:'${x}'})"><small>${i0(x)}</small><b>${dt.getDate()}</b></button>`;
      }).join('')}</div>
      <div class="etiquette" style="display:flex;justify-content:space-between;align-items:center">À quelle heure ?
        <span class="seg" style="margin:0;padding:3px;width:auto"><button style="padding:5px 10px" class="${R.duree === 60 ? 'on' : ''}" onclick="App.r({duree:60})">1h</button><button style="padding:5px 10px" class="${R.duree === 90 ? 'on' : ''}" onclick="App.r({duree:90})">1h30</button></span></div>
      ${l.length ? `<div class="grille">${l.map(h => `<button class="cr ${R.h === h ? 'on' : ''}" onclick="App.r({h:${h}})">${fh(h)}</button>`).join('')}</div>`
        : `<div class="info">${R.type === 'match' ? 'Plus de créneau ce jour-là (un défi doit commencer dans plus de 3h). Essaie un autre jour.' : 'Complet ce jour-là. Essaie un autre jour.'}</div>`}
      ${R.h != null ? `
        <div class="etiquette">Ton équipe</div>
        <input class="champ" id="r-equipe" maxlength="40" value="${esc(R.equipe)}" oninput="App.r({equipe:this.value}, true)">
        ${R.type === 'match' ? `<div class="etiquette">Couleur de vos maillots</div>${couleurs(R.couleur)}` : ''}
        ${blocPaiement(pj, parts)}
        <div style="height:14px"></div>
        <button class="btn lime plein" id="r-btn" onclick="App.payerReservation()">Payer ${euros(mode === 'acompte' ? pj : pj * parts)} · ${esc(jour(R.date))} ${fh(R.h)}</button>
        <div class="note">${R.type === 'match' ? 'Si aucune équipe ne relève ton défi 2h avant, tu es remboursé à 100 %. ' : ''}Annulation gratuite jusqu'à 24h avant le match.</div>` : ''}
    `);
  }
  const i0 = x => x === auj() ? 'Auj.' : x === decale(1) ? 'Dem.' : new Date(x + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  function r(maj, silencieux) {
    if (maj.type || maj.date || maj.duree) maj.h = maj.h != null ? maj.h : null;
    Object.assign(R, maj);
    if (maj.equipe != null) localStorage.setItem('md_equipe', maj.equipe);
    if (silencieux) return;
    const y = $('feuille').scrollTop;
    rendreReserver();
    $('feuille').scrollTop = maj.h != null ? $('feuille').scrollHeight : y;
  }
  async function payerReservation() {
    const nom = (R.equipe || '').trim();
    if (nom.length < 2) return toast('Donne un nom à ton équipe', true);
    const b = $('r-btn'); b.disabled = true; b.textContent = 'Réservation…';
    try {
      const rep = await post('/api/matchs', {
        action: 'creer', terrain: R.five.nom, date_iso: R.date, heure_debut: String(Math.floor(R.h / 60)).padStart(2, '0') + ':' + String(R.h % 60).padStart(2, '0'),
        duree: R.duree, type: R.type, equipe1: nom, couleur1: R.type === 'match' ? R.couleur : null, niveau: 'Intermédiaire', rejoue_de: R.rejoue
      });
      const pay = await post('/api/checkout', { role: 'creer', matchId: rep.match.id, mode });
      location.href = pay.url;
    } catch (e) { toast(e.message, true); b.disabled = false; rendreReserver(); }
  }

  // ---------------------------------------------------------------
  // DÉFIER une équipe
  // ---------------------------------------------------------------
  let D = null;
  function defier(id) {
    const m = publics.find(x => x.id === id);
    if (!m) return toast('Ce match n\'est plus disponible', true);
    D = { m, couleur: m.couleur1 === 'noir' ? 'blanc' : 'noir', equipe: localStorage.getItem('md_equipe') || nomJoueur() + ' FC' };
    mode = 'acompte';
    rendreDefi();
  }
  function rendreDefi() {
    const m = D.m, f = fives.find(x => x.nom === m.terrain), s = m.stats1 || {}, min = minutesDebut(m.heure), pj = pjMatch(m);
    ouvrir(`${tete('Relever le défi', `${esc(jour(m.date_iso, true))}${min != null ? ' · ' + fh(min) + '–' + fh(min + (m.duree || 60)) : ''}`)}
      <div class="carte">
        <div class="meta">Ton adversaire</div>
        <div class="nom" style="font-size:22px;font-family:'Barlow Condensed',sans-serif;font-weight:900;text-transform:uppercase">${esc(m.equipe1)}</div>
        <div class="actions" style="margin-top:6px">
          <span class="badge ${m.niveau === 'Avancé' ? 'rouge' : 'bleu'}">${esc(m.niveau || 'Tous niveaux')}</span>
          <span class="badge">${s.joues ? s.joues + ' matchs' : 'Nouvelle équipe'}</span>
          ${s.note ? `<span class="badge">★ ${s.note} fair-play</span>` : ''}
          ${s.joues ? `<span class="badge">${s.annulations || 0} annulation${s.annulations > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      <div class="carte"><div class="nom">${esc(m.terrain)}</div><div class="meta">${esc((f && f.adresse) || m.lieu || '')} · <a href="${maps(f, m)}" target="_blank" rel="noopener">Itinéraire</a></div></div>
      <div class="etiquette">Ton équipe</div>
      <input class="champ" id="d-equipe" maxlength="40" value="${esc(D.equipe)}" oninput="App.d({equipe:this.value})">
      <div class="etiquette">Couleur de vos maillots</div>${couleurs(D.couleur, m.couleur1)}
      ${blocPaiement(pj, 5)}
      <div style="height:14px"></div>
      <button class="btn lime plein" id="d-btn" onclick="App.payerDefi()">Payer ${euros(mode === 'acompte' ? pj : pj * 5)} et jouer</button>
      <div class="note">Annulation gratuite jusqu'à 24h avant. Si une autre équipe est plus rapide, tu es remboursé.</div>`);
  }
  function d(maj) { Object.assign(D, maj); if (maj.equipe != null) localStorage.setItem('md_equipe', maj.equipe); }
  async function payerDefi() {
    const nom = (D.equipe || '').trim();
    if (nom.length < 2) return toast('Donne un nom à ton équipe', true);
    const b = $('d-btn'); b.disabled = true; b.textContent = 'Redirection…';
    try {
      const pay = await post('/api/checkout', { role: 'rejoindre', matchId: D.m.id, mode, equipe_nom: nom, couleur: D.couleur });
      location.href = pay.url;
    } catch (e) { toast(e.message, true); b.disabled = false; rendreDefi(); }
  }

  // ---------------------------------------------------------------
  // Onglet MES MATCHS
  // ---------------------------------------------------------------
  let ongletMes = 'avenir';
  async function vueMes() {
    const v = $('vue');
    v.innerHTML = `<div class="vue"><div class="titre">Mes <em>matchs</em></div>${squelettes(2)}</div>`;
    await chargerMes();
    if (!fives.length) await charger();
    if (vueActive !== 'mes') return;
    const avenir = mes.filter(m => m.statut !== 'cancelled' && !passe(m)).sort((a, b) => debut(a) - debut(b));
    const passes = mes.filter(m => passe(m) || m.statut === 'cancelled').sort((a, b) => debut(b) - debut(a));
    const liste = ongletMes === 'avenir' ? avenir : passes;
    v.innerHTML = `<div class="vue">
      <div class="titre">Mes <em>matchs</em></div><div style="height:12px"></div>
      <div class="seg"><button class="${ongletMes === 'avenir' ? 'on' : ''}" onclick="App.ongletMes('avenir')">À venir (${avenir.length})</button><button class="${ongletMes === 'passes' ? 'on' : ''}" onclick="App.ongletMes('passes')">Passés</button></div>
      ${liste.length ? liste.map(carteMien).join('') : ongletMes === 'avenir'
        ? vide('⚽', 'Aucun match prévu', 'Réserve un five ou relève un défi.', `<button class="btn lime" onclick="App.aller('jouer')">Trouver un five</button>`)
        : vide('🏆', 'Pas encore de match joué', 'Ton historique s\'affichera ici.')}
    </div>`;
  }

  function carteMien(m) {
    const f = fives.find(x => x.nom === m.terrain), min = minutesDebut(m.heure);
    const adv = m.type === 'terrain' ? 'Entre potes' : (m.ma_equipe === 2 ? m.equipe1 : m.equipe2);
    const statut = { pending_payment: '<span class="badge">Paiement en cours</span>', open: '<span class="badge lime">En attente d\'adversaire</span>', confirmed: '<span class="badge noir">Confirmé ✓</span>', cancelled: '<span class="badge rouge">Annulé</span>' }[m.statut] || '';
    const fini = passe(m), joue = m.statut === 'confirmed' && fini && m.type !== 'terrain';
    const b = [];
    if (!fini && m.statut !== 'cancelled') {
      if (m.statut === 'confirmed' && m.type !== 'terrain') b.push(`<button class="btn petit" onclick="App.chat(${js(m.id)})">💬 Chat</button>`);
      if (m.statut === 'open' && m.capitaine) b.push(`<button class="btn petit lime" onclick="App.partager(${js(m.id)})">📣 Trouver un adversaire</button>`);
      b.push(`<a class="btn petit clair" href="${maps(f, m)}" target="_blank" rel="noopener">🗺️ Y aller</a>`);
      b.push(`<button class="btn petit clair" onclick="App.agenda(${js(m.id)})">📅</button>`);
      if (m.capitaine && (m.statut === 'open' || m.statut === 'confirmed')) b.push(`<button class="btn petit danger" onclick="App.annuler(${js(m.id)})">Annuler</button>`);
    }
    if (joue) {
      if (!m.score_valide && m.capitaine) b.push(`<button class="btn petit lime" onclick="App.score(${js(m.id)})">${m.score1 != null ? 'Valider le score' : 'Saisir le score'}</button>`);
      if (!m.a_note && m.capitaine) b.push(`<button class="btn petit" onclick="App.noter(${js(m.id)})">⭐ Noter</button>`);
    }
    if (fini && m.statut === 'confirmed' && m.capitaine) b.push(`<button class="btn petit clair" onclick="App.rejouer(${js(m.id)})">🔁 Rejouer</button>`);
    const score = m.score1 != null ? `<span class="badge lime" style="font-size:14px">${m.score1} - ${m.score2}${m.score_valide ? '' : ' ?'}</span>` : '';
    return `<div class="carte">
      <div class="ligne" style="justify-content:space-between"><div class="meta" style="font-weight:700;text-transform:capitalize">${esc(jour(m.date_iso, true))}${min != null ? ' · ' + fh(min) : ''}</div>${statut}</div>
      <div class="nom" style="margin-top:8px">${esc(m.terrain)}</div>
      <div class="vs">${esc(m.ma_equipe === 2 ? m.equipe2 : m.equipe1)} <span>vs</span> ${esc(adv || 'en attente…')} ${score}</div>
      ${m.statut === 'open' && !fini ? `<div class="info">On te prévient dès qu'une équipe relève le défi. Sans adversaire 2h avant, tu es remboursé.</div>` : ''}
      ${m.statut === 'confirmed' && !fini && m.type !== 'terrain' ? `<div class="meta" style="margin-top:8px">Maillots : vous en ${esc(m.ma_equipe === 2 ? m.couleur2 || '—' : m.couleur1 || '—')}, eux en ${esc(m.ma_equipe === 2 ? m.couleur1 || '—' : m.couleur2 || '—')}</div>` : ''}
      ${b.length ? `<div class="actions">${b.join('')}</div>` : ''}
    </div>`;
  }
  const mien = id => mes.find(m => m.id === id);

  function partager(id) {
    const m = mien(id); if (!m) return;
    const min = minutesDebut(m.heure);
    const txt = `⚽ On cherche une équipe pour un five ${jour(m.date_iso, true).toLowerCase()}${min != null ? ' à ' + fh(min) : ''} au ${m.terrain}. Chauds ?`;
    const url = location.origin + '/app?match=' + m.id;
    if (navigator.share) navigator.share({ title: 'Matchday', text: txt, url }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(txt + '\n' + url), '_blank');
  }
  function agenda(id) {
    const m = mien(id), dd = debut(m); if (!dd) return;
    const fin = new Date(dd.getTime() + (m.duree || 60) * 60000), f = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const five = fives.find(x => x.nom === m.terrain);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matchday//FR', 'BEGIN:VEVENT', 'UID:' + m.id + '@matchday', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(dd), 'DTEND:' + f(fin),
      'SUMMARY:Five ' + m.terrain, 'LOCATION:' + ((five && five.adresse) || m.terrain).replace(/[,;]/g, ' '), 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Five dans 2h', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'five-matchday.ics'; a.click();
  }

  function annuler(id) {
    const m = mien(id); if (!m) return;
    const h = hAvant(m), ok = h == null || h >= 24;
    ouvrir(`${tete('Annuler ?', esc(m.terrain) + ' · ' + esc(jour(m.date_iso, true)))}
      <div class="info ${ok ? '' : 'rouge'}">${ok ? '✅ Plus de 24h avant : tout ce que tu as payé est remboursé.' : '❌ Moins de 24h avant : ce que tu as payé n\'est pas remboursé.'}${m.statut === 'confirmed' && m.type !== 'terrain' ? ' L\'autre équipe est prévenue et remboursée.' : ''}</div>
      <div style="height:16px"></div>
      <button class="btn plein" style="background:var(--red)" id="a-btn" onclick="App.confirmerAnnulation(${js(id)})">Oui, annuler le match</button>
      <div style="height:8px"></div><button class="btn clair plein" onclick="App.fermer()">Garder le match</button>`);
  }
  async function confirmerAnnulation(id) {
    $('a-btn').disabled = true;
    try { const r2 = await post('/api/refund', { matchId: id }); fermer(); toast(r2.rembourse ? 'Match annulé · remboursement en cours' : 'Match annulé'); vueMes(); }
    catch (e) { toast(e.message, true); $('a-btn').disabled = false; }
  }

  function rejouer(id) {
    const m = mien(id); if (!m) return;
    let dd = new Date(m.date_iso + 'T12:00:00');
    do { dd = new Date(dd.getTime() + 7 * 86400000); } while (iso(dd) < auj());
    reserver(m.terrain, { date: iso(dd), h: minutesDebut(m.heure), duree: m.duree || 60, type: m.type || 'match', rejoue: m.type !== 'terrain' ? m.id : null, equipe: m.ma_equipe === 2 ? m.equipe2 : m.equipe1 });
    if (m.type !== 'terrain') toast('On proposera la revanche à ' + (m.ma_equipe === 2 ? m.equipe1 : m.equipe2));
  }

  // Chat
  let chatId = null, chatT = null;
  async function chat(id) {
    chatId = id; const m = mien(id);
    ouvrir(`${tete('💬 Chat', esc(m ? (m.ma_equipe === 2 ? m.equipe1 : m.equipe2) + ' · ' + m.terrain : ''))}
      <div class="msgs" id="msgs"><div class="meta">Chargement…</div></div>
      <form class="saisie" onsubmit="event.preventDefault(); App.envoyer()"><input class="champ" id="c-txt" placeholder="Ton message…" maxlength="1000" autocomplete="off"><button class="btn lime">➤</button></form>`);
    await lireChat(); clearInterval(chatT); chatT = setInterval(lireChat, 5000);
  }
  async function lireChat() {
    if (!chatId || !$('msgs')) return clearInterval(chatT);
    try {
      const l = await api('/api/matchs?chat=' + encodeURIComponent(chatId)), box = $('msgs');
      const bas = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
      box.innerHTML = l.length ? l.map(x => `<div class="msg ${x.moi ? 'moi' : ''}">${x.moi ? '' : `<div class="de">${esc(x.de)}</div>`}${esc(x.texte)}<small>${new Date(x.created_at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('')
        : '<div class="meta" style="text-align:center;padding:30px 0">Dis bonjour 👋 (retard, ballon, maillots…)</div>';
      if (bas) box.scrollTop = box.scrollHeight;
    } catch (e) {}
  }
  async function envoyer() {
    const i = $('c-txt'), t = i.value.trim(); if (!t) return;
    i.value = '';
    try { await post('/api/matchs', { action: 'chat', matchId: chatId, texte: t }); lireChat(); } catch (e) { i.value = t; toast(e.message, true); }
  }

  // Score
  function score(id) {
    const m = mien(id); if (!m) return;
    const attente = m.score1 != null && !m.score_valide;
    ouvrir(`${tete('Score du match', esc(m.terrain))}
      ${attente ? `<div class="info">${m.score_saisi_par_moi ? 'On attend que l\'autre capitaine valide.' : 'L\'autre capitaine a saisi ce score : valide-le ou corrige-le.'}</div><div style="height:12px"></div>` : ''}
      <div class="score">
        <div><div class="etiquette" style="margin-top:0">${esc(m.equipe1)}</div><input class="champ" id="s1" type="number" min="0" max="99" inputmode="numeric" value="${m.score1 != null ? m.score1 : ''}"></div>
        <div class="titre" style="padding-bottom:10px">-</div>
        <div><div class="etiquette" style="margin-top:0">${esc(m.equipe2 || '')}</div><input class="champ" id="s2" type="number" min="0" max="99" inputmode="numeric" value="${m.score2 != null ? m.score2 : ''}"></div>
      </div><div style="height:16px"></div>
      <button class="btn lime plein" onclick="App.envoyerScore(${js(id)})">${attente && !m.score_saisi_par_moi ? 'Valider ce score' : 'Envoyer'}</button>`);
  }
  async function envoyerScore(id) {
    const s1 = parseInt($('s1').value, 10), s2 = parseInt($('s2').value, 10);
    if (isNaN(s1) || isNaN(s2)) return toast('Score incomplet', true);
    try { const r2 = await post('/api/matchs', { action: 'score', matchId: id, score1: s1, score2: s2 }); fermer(); toast(r2.valide ? '✅ Score validé par les deux équipes' : 'Envoyé · en attente de l\'adversaire'); vueMes(); }
    catch (e) { toast(e.message, true); }
  }

  // Notes
  let N = {};
  function noter(id) {
    const m = mien(id); if (!m) return;
    N = { id, adv: 0, five: 0 };
    const et = k => `<div class="etoiles" data-k="${k}">${[1, 2, 3, 4, 5].map(v => `<button onclick="App.etoile('${k}',${v})">★</button>`).join('')}</div>`;
    ouvrir(`${tete('Ton avis', esc(m.terrain))}
      <div class="etiquette">L'équipe adverse (fair-play, ponctualité)</div>${et('adv')}
      <div class="etiquette">Le terrain</div>${et('five')}
      <div class="etiquette">Un mot ? (optionnel)</div><input class="champ" id="n-com" maxlength="300" placeholder="Bonne ambiance, à refaire…">
      <div class="note">Ta note reste cachée jusqu'à ce que l'autre équipe ait noté aussi.</div><div style="height:12px"></div>
      <button class="btn lime plein" onclick="App.envoyerNote()">Envoyer</button>`);
  }
  function etoile(k, v) { N[k] = v; document.querySelectorAll(`.etoiles[data-k="${k}"] button`).forEach((b, i) => b.classList.toggle('on', i < v)); }
  async function envoyerNote() {
    if (!N.adv) return toast('Note l\'équipe adverse', true);
    try { await post('/api/notations', { match_id: N.id, note: N.adv, note_five: N.five || null, commentaire: $('n-com').value.trim() }); fermer(); toast('⭐ Merci !'); vueMes(); }
    catch (e) { toast(e.message, true); }
  }

  // ---------------------------------------------------------------
  // Onglet CLASSEMENT
  // ---------------------------------------------------------------
  const CL = { mois: iso(new Date()).slice(0, 7), ville: '', tri: 'points' };
  async function vueClassement() {
    const v = $('vue');
    v.innerHTML = `<div class="vue"><div class="titre">Classe<em>ment</em></div>${squelettes(3)}</div>`;
    let r2; try { r2 = await api(`/api/matchs?classement=1&mois=${CL.mois}&ville=${encodeURIComponent(CL.ville)}`); } catch (e) { r2 = { joueurs: [], villes: [] }; }
    if (vueActive !== 'classement') return;
    const mois = Array.from({ length: 6 }, (_, i) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - i); return iso(x).slice(0, 7); });
    let j = (r2.joueurs || []).slice();
    if (CL.tri === 'note') j = j.filter(x => x.nb_notes >= 2).sort((a, b) => b.note - a.note);
    else j.sort((a, b) => b.points - a.points || b.victoires - a.victoires);
    v.innerHTML = `<div class="vue">
      <div class="titre">Classe<em>ment</em></div><div class="sous">Chaque match joué : 12 pts. Victoire : +3.</div>
      <div class="ligne" style="gap:8px;margin-bottom:12px">
        <select class="champ" style="padding:11px" onchange="App.cl({mois:this.value})"><option value="">Toute la saison</option>${mois.map(m => `<option value="${m}" ${m === CL.mois ? 'selected' : ''}>${new Date(m + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`).join('')}</select>
        <select class="champ" style="padding:11px" onchange="App.cl({ville:this.value})"><option value="">Toutes les villes</option>${(r2.villes || []).map(x => `<option ${x === CL.ville ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </div>
      <div class="seg"><button class="${CL.tri === 'points' ? 'on' : ''}" onclick="App.cl({tri:'points'})">🏆 Points</button><button class="${CL.tri === 'note' ? 'on' : ''}" onclick="App.cl({tri:'note'})">🤝 Fair-play</button></div>
      <div class="carte">${j.length ? j.slice(0, 50).map((x, i) => `<div class="rang ${x.moi ? 'moi' : ''} ${i < 3 ? 'podium' : ''}"><span class="n">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><div class="grow"><div class="nom" style="font-size:15px">${esc(x.nom)}${x.moi ? ' (toi)' : ''}</div><div class="meta">${esc(x.niveau)} · ${x.matchs} match${x.matchs > 1 ? 's' : ''}</div></div><span class="v">${CL.tri === 'note' ? '★ ' + x.note : x.points + ' pts'}</span></div>`).join('')
        : vide('🏆', 'Personne pour l\'instant', CL.tri === 'note' ? 'Il faut au moins 2 avis pour apparaître.' : 'Joue un match pour entrer au classement.')}</div>
    </div>`;
  }
  function cl(maj) { Object.assign(CL, maj); vueClassement(); }

  // ---------------------------------------------------------------
  // Onglet PROFIL
  // ---------------------------------------------------------------
  async function vueProfil() {
    const v = $('vue'), s = session();
    v.innerHTML = `<div class="vue">${squelettes(3)}</div>`;
    const [st, alertes, pays] = await Promise.all([
      api('/api/matchs?mesStats=1').catch(() => ({})), api('/api/alertes').catch(() => []), api('/api/checkout?paiements=1').catch(() => [])
    ]);
    if (vueActive !== 'profil') return;
    const p = st.progression || { actuel: 1000, min: 900, max: 1080 };
    const pct = Math.max(4, Math.min(100, Math.round((p.actuel - p.min) / Math.max(1, p.max - p.min) * 100)));
    const push = 'Notification' in window && Notification.permission === 'granted';
    const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    v.innerHTML = `<div class="vue">
      <div class="profil-tete">
        <div class="avatar">${esc(nomJoueur().slice(0, 2).toUpperCase())}</div>
        <div class="grow">
          <div class="nom" style="font-size:20px">${esc(nomJoueur())} <button onclick="App.pseudo()" style="color:var(--lime);font-size:13px">✎</button></div>
          <div style="color:rgba(255,255,255,.55);font-size:13px">${esc(s.email)}</div>
          <div class="niv"><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700"><span style="color:var(--lime)">${esc(st.niveau || 'Débutant')}</span><span style="color:rgba(255,255,255,.5)">${st.prochain_niveau ? 'vers ' + esc(st.prochain_niveau) : 'Niveau max'}</span></div><div class="barre"><div style="width:${pct}%"></div></div></div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${st.joues || 0}</b><small>Matchs</small></div>
        <div class="stat"><b>${st.victoires || 0}</b><small>Victoires</small></div>
        <div class="stat"><b>${st.points || 0}</b><small>Points</small></div>
        <div class="stat"><b>${st.note ? st.note : '—'}</b><small>Fair-play</small></div>
      </div>
      <div class="section"><h2>Badges</h2></div>
      <div class="badges">${(st.badges || []).map(b => `<div class="bdg ${b.ok ? '' : 'off'}" title="${esc(b.desc)}"><i>${esc(b.icone)}</i>${esc(b.nom)}</div>`).join('')}</div>

      <div class="section"><h2>🔔 Alertes</h2><button class="btn petit lime" onclick="App.alerte()">+ Ajouter</button></div>
      <div class="carte">${alertes.length ? alertes.map(a => `<div class="ligne" style="padding:6px 0"><div class="grow meta" style="color:var(--ink)">${(a.jours || []).length < 7 ? a.jours.map(x => JOURS[x - 1]).join(', ') : 'Tous les jours'}${a.heure_min ? ' · après ' + fh(a.heure_min) : ''}${a.niveau ? ' · ' + esc(a.niveau) : ''}${a.ville ? ' · ' + esc(a.ville) : ''}</div><button class="btn petit clair" onclick="App.supprAlerte(${js(a.id)})">✕</button></div>`).join('')
        : '<div class="meta">On te prévient quand une équipe publie un match qui te va.</div>'}
        <div class="actions"><button class="btn petit ${push ? 'clair' : ''}" onclick="App.push()" ${push ? 'disabled' : ''}>${push ? '✓ Notifications activées' : 'Activer les notifications'}</button></div>
      </div>

      <div class="section"><h2>💳 Paiements</h2><small>${pays.length}</small></div>
      <div class="carte">${pays.length ? pays.slice(0, 10).map(x => `<div class="ligne" style="padding:6px 0"><div class="grow"><div style="font-weight:600;font-size:14px">${esc(x.terrain || 'Match')}</div><div class="meta">${esc(jour(x.date_iso))} · ${x.mode === 'total' ? 'Tout payé' : 'Acompte'}</div></div><div class="prix" style="font-size:15px">${euros(x.montant / 100)}<small>${x.statut === 'rembourse' ? 'Remboursé' : 'Payé'}</small></div></div>`).join('') : '<div class="meta">Aucun paiement pour l\'instant.</div>'}</div>

      <div class="carte liste">
        ${installable ? '<button onclick="App.installer()">📲 Installer l\'app <span>›</span></button>' : ''}
        <a href="/">Comment ça marche <span>›</span></a>
        <a href="/cgu">CGU et confidentialité <span>›</span></a>
        <a href="/contact">Contact <span>›</span></a>
        <button onclick="App.deconnexion()" style="color:var(--red)">Se déconnecter</button>
      </div>
    </div>`;
  }
  function pseudo() {
    ouvrir(`${tete('Ton pseudo')}<input class="champ" id="p-ps" maxlength="30" value="${esc(nomJoueur())}"><div style="height:12px"></div><button class="btn lime plein" onclick="App.savePseudo()">Enregistrer</button>`);
  }
  async function savePseudo() {
    const p = $('p-ps').value.trim();
    try { await post('/api/auth', { action: 'profil', pseudo: p }); const s = session(); s.pseudo = p; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); fermer(); toast('Pseudo enregistré'); vueProfil(); }
    catch (e) { toast(e.message, true); }
  }

  // Alertes
  const A = { jours: [1, 2, 3, 4, 5, 6, 7], heure: 18 * 60, niveau: '' };
  function alerte() {
    const J = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    ouvrir(`${tete('🔔 Me prévenir', 'Un mail (et une notif) dès qu\'un match qui te va est publié.')}
      <div class="etiquette">Quels jours ?</div>
      <div class="jours">${J.map((j, i) => `<button class="jour ${A.jours.includes(i + 1) ? 'on' : ''}" style="width:auto;padding:10px 12px" onclick="App.aj(${i + 1})"><b style="font-size:15px">${j}</b></button>`).join('')}</div>
      <div class="etiquette">À partir de</div>
      <select class="champ" onchange="App.al({heure:parseInt(this.value,10)||null})"><option value="">Peu importe</option>${[12, 17, 18, 19, 20, 21].map(h => `<option value="${h * 60}" ${A.heure === h * 60 ? 'selected' : ''}>${h}h</option>`).join('')}</select>
      <div class="etiquette">Niveau</div>
      <select class="champ" onchange="App.al({niveau:this.value})"><option value="">Tous</option>${['Débutant', 'Intermédiaire', 'Avancé'].map(n => `<option ${A.niveau === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <div style="height:16px"></div><button class="btn lime plein" onclick="App.creerAlerte()">Créer l'alerte</button>`);
  }
  function aj(j) { A.jours = A.jours.includes(j) ? A.jours.filter(x => x !== j) : A.jours.concat(j); alerte(); }
  function al(m) { Object.assign(A, m); }
  async function creerAlerte() {
    if (!A.jours.length) return toast('Choisis au moins un jour', true);
    try { await post('/api/alertes', { jours: A.jours, heure_min: A.heure, niveau: A.niveau || null }); fermer(); toast('🔔 Alerte créée'); if ('Notification' in window && Notification.permission === 'default') setTimeout(push, 600); if (vueActive === 'profil') vueProfil(); }
    catch (e) { toast(e.message, true); }
  }
  async function supprAlerte(id) { try { await api('/api/alertes?id=' + encodeURIComponent(id), { method: 'DELETE' }); vueProfil(); } catch (e) { toast(e.message, true); } }

  // Notifications push + app installable
  let installable = false, evtInstall = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evtInstall = e; installable = true; });
  function installer() { if (evtInstall) { evtInstall.prompt(); evtInstall = null; installable = false; } }
  async function push() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Sur iPhone : installe d\'abord l\'app (Partager > Sur l\'écran d\'accueil)', true);
    try {
      if (await Notification.requestPermission() !== 'granted') return toast('Notifications refusées', true);
      const { cle } = await api('/api/alertes?vapid=1');
      if (!cle) return toast('Notifications pas encore configurées', true);
      const pad = '='.repeat((4 - cle.length % 4) % 4), raw = atob((cle + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([...raw].map(c => c.charCodeAt(0))) });
      await post('/api/alertes', { action: 'push', subscription: sub.toJSON() });
      toast('🔔 Notifications activées'); if (vueActive === 'profil') vueProfil();
    } catch (e) { toast(e.message || 'Erreur', true); }
  }

  // ---------------------------------------------------------------
  // Connexion
  // ---------------------------------------------------------------
  function ecranAuth(q) {
    ['login', 'inscription', 'oubli', 'envoye'].forEach(x => { $('f-' + x).hidden = x !== q; });
    $('auth').classList.add('ouvert');
  }
  async function connexion() {
    const b = $('l-btn'); $('l-err').textContent = ''; b.disabled = true;
    try {
      const r2 = await post('/api/auth', { action: 'login', email: $('l-email').value.trim(), password: $('l-mdp').value, role: 'joueur' });
      localStorage.setItem(SESSION_KEY, JSON.stringify(r2.user));
      $('auth').classList.remove('ouvert'); demarrer();
    } catch (e) {
      $('l-err').innerHTML = esc(e.message) + (/confirm/i.test(e.message) ? ' <button type="button" style="color:var(--lime);text-decoration:underline" onclick="App.renvoyer()">Renvoyer le mail</button>' : '');
    }
    b.disabled = false;
  }
  async function renvoyer() { try { await post('/api/auth', { action: 'renvoyer', email: $('l-email').value.trim() }); toast('Mail renvoyé'); } catch (e) { toast(e.message, true); } }
  async function inscription() {
    const b = $('i-btn'); $('i-err').textContent = ''; b.disabled = true;
    try {
      const email = $('i-email').value.trim();
      await post('/api/auth', { action: 'register', email, password: $('i-mdp').value, phone: $('i-tel').value.trim(), pseudo: $('i-pseudo').value.trim(), role: 'joueur' });
      $('envoye-txt').textContent = `On t'a envoyé un lien à ${email}. Clique dessus pour activer ton compte (regarde aussi les spams).`;
      $('l-email').value = email; ecranAuth('envoye');
    } catch (e) { $('i-err').textContent = e.message; }
    b.disabled = false;
  }
  async function oubli() {
    const b = $('o-btn'); b.disabled = true;
    try { await api('/api/reset', { method: 'POST', body: { email: $('o-email').value.trim() } }); $('envoye-txt').textContent = 'Si un compte existe avec cet email, tu as reçu un lien pour choisir un nouveau mot de passe.'; ecranAuth('envoye'); }
    catch (e) { $('o-err').textContent = e.message; }
    b.disabled = false;
  }
  function deconnexion(expire) {
    localStorage.removeItem(SESSION_KEY); fermer(); ecranAuth('login');
    if (expire) toast('Session expirée, reconnecte-toi', true);
  }

  // ---------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------
  async function demarrer() {
    majLoc();
    const p = new URLSearchParams(location.search);
    const paiement = p.get('payment'), matchId = p.get('matchId') || p.get('match');
    if ([...p.keys()].length) history.replaceState({}, '', location.pathname);
    aller('jouer');
    if (!pos) localiser(false);
    chargerMes();

    if (paiement === 'cancel') return toast('Paiement annulé, rien n\'a été débité');
    if (paiement === 'success' && matchId) {
      toast('✅ Paiement reçu, confirmation…');
      for (let i = 0; i < 10; i++) {
        await new Promise(r3 => setTimeout(r3, 1500));
        await chargerMes();
        const m = mien(matchId);
        if (m && m.statut !== 'pending_payment') {
          aller('mes');
          return toast(m.statut === 'confirmed' ? (m.type === 'terrain' ? '✅ Five réservé !' : '🔥 Match confirmé !') : m.statut === 'cancelled' ? 'Match annulé et remboursé' : '✅ Réservé ! On te prévient dès qu\'une équipe relève le défi');
        }
      }
      return aller('mes');
    }
    if (p.get('match')) { await charger(); defier(p.get('match')); }
  }

  async function init() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const p = new URLSearchParams(location.search);
    if (p.get('verifier')) {
      try { await post('/api/auth', { action: 'verifier', token: p.get('verifier') }); toast('✅ Email confirmé, tu peux te connecter'); }
      catch (e) { toast(e.message, true); }
      history.replaceState({}, '', location.pathname);
    }
    if (p.get('reset')) { location.href = '/reset?token=' + encodeURIComponent(p.get('reset')); return; }
    const s = session();
    if (!s || !s.token) { localStorage.removeItem(SESSION_KEY); ecranAuth('login'); return; }
    demarrer();
  }

  // Les fonctions appelées depuis le HTML
  return {
    init, aller, localiser, reserver, r, payerReservation, defier, d, payerDefi, fermer,
    mode: m => { mode = m; if ($('r-btn')) rendreReserver(); else rendreDefi(); },
    couleur: c => { if ($('r-btn')) { R.couleur = c; rendreReserver(); } else { D.couleur = c; rendreDefi(); } },
    ongletMes: o => { ongletMes = o; vueMes(); }, partager, agenda, annuler, confirmerAnnulation, rejouer,
    chat, envoyer, score, envoyerScore, noter, etoile, envoyerNote, cl, pseudo, savePseudo,
    alerte, aj, al, creerAlerte, supprAlerte, push, installer,
    ecranAuth, connexion, renvoyer, inscription, oubli, deconnexion
  };
})();

App.init();
