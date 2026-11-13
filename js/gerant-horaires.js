// =====================================================================
// Matchday gérant : terrains, horaires par plage, exceptions par date et
// planning de la journée par terrain. Remplace la page "Mes terrains".
// =====================================================================
(function () {
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(path, opts) {
    const res = await apiFetch(path, opts);
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) throw new Error((data && data.error) || 'Erreur, réessayez.');
    return data;
  }
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const five = () => (typeof currentFive !== 'undefined' && currentFive) || '';
  const toast = m => (typeof showToast === 'function' ? showToast(m) : alert(m));

  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const DUREES = [60, 90, 120];
  const fd = d => d % 60 ? Math.floor(d / 60) + 'h' + String(d % 60).padStart(2, '0') : d / 60 + 'h';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const min = h => { const m = String(h || '').match(/^(\d{1,2})[:h](\d{2})?/); return m ? +m[1] * 60 + (+m[2] || 0) : null; };
  const hhmm = x => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');

  // État de la page
  const S = { onglet: 'planning', date: iso(new Date()), terrains: [], plages: [], exceptions: [], mois: null, exc: null, planning: null };

  // ---------------------------------------------------------------
  // Styles (scopés à .gh)
  // ---------------------------------------------------------------
  const css = `
  .gh { font-family: 'Barlow', system-ui, sans-serif; color: var(--ink); }
  .gh-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line-heavy, #ccc); margin-bottom: 20px; overflow-x: auto; }
  .gh-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px; font: 600 14px 'Barlow', sans-serif; color: var(--muted); cursor: pointer; white-space: nowrap; margin-bottom: -1px; }
  .gh-tabs button.on { color: var(--ink); border-bottom-color: var(--ink); }
  .gh-aide { font-size: 13px; color: var(--muted); margin: -6px 0 16px; line-height: 1.5; max-width: 720px; }
  .gh-carte { background: #fff; border: 1px solid var(--line, #e5e5e5); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .gh-ligne { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .gh input[type=text], .gh input[type=time], .gh input[type=number], .gh input[type=date], .gh select { border: 1px solid var(--line-heavy, #ccc); border-radius: 6px; padding: 8px 10px; font: 500 14px 'Barlow', sans-serif; background: #fff; color: var(--ink); }
  .gh input[type=time] { width: 128px; } .gh input[type=number] { width: 84px; }
  .gh-btn { border: 1px solid var(--ink); background: var(--ink); color: #fff; border-radius: 6px; padding: 8px 14px; font: 600 13px 'Barlow', sans-serif; cursor: pointer; }
  .gh-btn.clair { background: #fff; color: var(--ink); border-color: var(--line-heavy, #ccc); }
  .gh-btn.rouge { background: #fff; color: var(--red); border-color: transparent; }
  .gh-btn:disabled { opacity: .5; }
  .gh-jour { display: grid; grid-template-columns: 110px 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--line, #eee); }
  .gh-jour:last-child { border-bottom: 0; }
  .gh-jour-nom { font-weight: 700; font-size: 14px; padding-top: 8px; }
  .gh-plage { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 6px 0; }
  .gh-plage label { font-size: 13px; display: inline-flex; gap: 4px; align-items: center; }
  .gh-sep { color: var(--muted); font-size: 13px; }
  .gh-ferme { color: var(--muted); font-size: 13px; padding-top: 8px; }
  .gh-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .gh-cal .t { font-size: 11px; font-weight: 600; color: var(--muted); text-align: center; padding: 4px 0; }
  .gh-cal button { aspect-ratio: 1.3; border: 1px solid var(--line, #e5e5e5); background: #fff; border-radius: 6px; font: 600 14px 'Barlow', sans-serif; cursor: pointer; position: relative; color: var(--ink); }
  .gh-cal button:disabled { opacity: .35; cursor: default; }
  .gh-cal button.exc { border-color: var(--blue); color: var(--blue); }
  .gh-cal button.ferme { background: #F6E3DF; border-color: var(--red); color: var(--red); }
  .gh-cal button.sel { outline: 2px solid var(--ink); outline-offset: 1px; }
  .gh-cal button small { position: absolute; bottom: 3px; left: 0; right: 0; font-size: 9px; font-weight: 600; }
  .gh-planning { overflow-x: auto; }
  .gh-grille { display: grid; position: relative; min-width: 560px; }
  .gh-col-t { font-weight: 700; font-size: 13px; text-align: center; padding: 8px 4px; border-bottom: 1px solid var(--line-heavy, #ccc); }
  .gh-heures { position: relative; }
  .gh-h { position: absolute; left: 0; right: 4px; font-size: 11px; color: var(--muted); text-align: right; transform: translateY(-50%); font-family: 'DM Mono', monospace; }
  .gh-col { position: relative; border-left: 1px solid var(--line, #eee); background-image: linear-gradient(var(--line, #eee) 1px, transparent 1px); }
  .gh-ev { position: absolute; left: 3px; right: 3px; border-radius: 5px; padding: 4px 6px; font-size: 12px; line-height: 1.25; overflow: hidden; cursor: default; }
  .gh-ev b { display: block; font-size: 12px; }
  .gh-ev.match { background: #111010; color: #fff; }
  .gh-ev.open { background: #E7F3EC; color: #0B6340; border: 1px solid #9FCFB3; }
  .gh-ev.pending { background: #F4F4F4; color: var(--muted); border: 1px dashed #bbb; }
  .gh-ev.bloque { background: repeating-linear-gradient(45deg, #F6E3DF, #F6E3DF 6px, #FBEFEC 6px, #FBEFEC 12px); color: var(--red); border: 1px solid #E6B4AA; cursor: pointer; }
  .gh-ferme-zone { position: absolute; left: 0; right: 0; background: rgba(0,0,0,.035); }
  .gh-legende { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 10px; }
  .gh-legende i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  @media (max-width: 640px) { .gh-jour { grid-template-columns: 1fr; gap: 4px; } .gh-jour-nom { padding-top: 0; } }
  `;
  function styles() { if (document.getElementById('gh-css')) return; const s = document.createElement('style'); s.id = 'gh-css'; s.textContent = css; document.head.appendChild(s); }

  // ---------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------
  async function charger() {
    const c = await api('/api/fives?config=' + encodeURIComponent(five()));
    S.terrains = c.terrains || []; S.plages = c.plages || []; S.exceptions = c.exceptions || [];
  }

  window.loadTerrains = async function () {
    styles();
    const page = document.getElementById('page-terrains');
    if (!page) return;
    const btnAncien = page.querySelector('.topbar .btn'); if (btnAncien) btnAncien.remove();
    const titre = page.querySelector('.page-title'); if (titre) titre.innerHTML = 'Terrains <em>&amp; horaires</em>';
    const zone = page.querySelector('.content-area');
    if (!five()) { zone.innerHTML = '<div class="gh"><div class="gh-aide">Sélectionnez un five.</div></div>'; return; }
    zone.innerHTML = '<div class="gh"><div class="gh-aide">Chargement…</div></div>';
    try { await charger(); } catch (e) { zone.innerHTML = `<div class="gh"><div class="gh-aide">${esc(e.message)}</div></div>`; return; }
    rendre();
  };

  function rendre() {
    const zone = document.querySelector('#page-terrains .content-area');
    const tabs = [['planning', 'Planning du jour'], ['horaires', 'Horaires de la semaine'], ['exceptions', 'Jours particuliers'], ['terrains', 'Terrains']];
    zone.innerHTML = `<div class="gh">
      <div class="gh-tabs">${tabs.map(([k, t]) => `<button class="${S.onglet === k ? 'on' : ''}" onclick="GH.onglet('${k}')">${t}</button>`).join('')}</div>
      <div id="gh-corps"></div></div>`;
    ({ planning: vuePlanning, horaires: vueHoraires, exceptions: vueExceptions, terrains: vueTerrains })[S.onglet]();
  }
  const corps = h => { document.getElementById('gh-corps').innerHTML = h; };

  // ---------------------------------------------------------------
  // Terrains
  // ---------------------------------------------------------------
  let T = [];
  function vueTerrains() {
    T = S.terrains.length ? S.terrains.map(t => ({ id: t.id, nom: t.nom })) : [{ nom: 'Terrain 1' }];
    dessinerTerrains();
  }
  function dessinerTerrains() {
    corps(`<div class="gh-aide">Donnez un nom à chaque terrain (Terrain 1, Terrain Cruyff…). Les joueurs ne choisissent pas le terrain : Matchday l'attribue automatiquement à la réservation. Vous le voyez dans le planning.</div>
      <div class="gh-carte">
        ${T.map((t, i) => `<div class="gh-ligne" style="padding:5px 0"><span style="width:22px;color:var(--muted);font-size:13px">${i + 1}</span>
          <input type="text" maxlength="40" value="${esc(t.nom)}" oninput="GH.tNom(${i}, this.value)" style="flex:1;max-width:320px">
          ${T.length > 1 ? `<button class="gh-btn rouge" onclick="GH.tSuppr(${i})">Retirer</button>` : ''}</div>`).join('')}
        <div class="gh-ligne" style="margin-top:12px">
          <button class="gh-btn clair" onclick="GH.tAjout()">Ajouter un terrain</button>
          <span style="flex:1"></span>
          <button class="gh-btn" onclick="GH.tSave(this)">Enregistrer</button>
        </div>
      </div>`);
  }

  // ---------------------------------------------------------------
  // Horaires de la semaine (plages)
  // ---------------------------------------------------------------
  let P = null; // { 1: [{debut, fin, durees, prix_joueur}], … }
  function vueHoraires() {
    P = {};
    for (let j = 1; j <= 7; j++) P[j] = S.plages.filter(p => p.jour === j).sort((a, b) => min(a.debut) - min(b.debut)).map(p => ({ debut: p.debut, fin: p.fin, durees: (p.durees || [60, 90]).slice(), prix_joueur: p.prix_joueur }));
    dessinerHoraires();
  }
  function lignePlage(p, j, i) {
    return `<div class="gh-plage">
      <input type="time" step="1800" value="${esc(p.debut)}" onchange="GH.p(${j},${i},'debut',this.value)"><span class="gh-sep">à</span>
      <input type="time" step="1800" value="${esc(p.fin)}" onchange="GH.p(${j},${i},'fin',this.value)">
      <span class="gh-sep" style="margin-left:6px">Durées</span>
      ${DUREES.map(d => `<label><input type="checkbox" ${p.durees.includes(d) ? 'checked' : ''} onchange="GH.pDuree(${j},${i},${d},this.checked)">${fd(d)}</label>`).join('')}
      <span class="gh-sep" style="margin-left:6px">Prix / joueur / h</span>
      <input type="number" min="3" max="60" step="0.5" value="${p.prix_joueur != null ? p.prix_joueur : ''}" onchange="GH.p(${j},${i},'prix_joueur',this.value)"> €
      <button class="gh-btn rouge" onclick="GH.pSuppr(${j},${i})">Retirer</button>
    </div>`;
  }
  function dessinerHoraires() {
    corps(`<div class="gh-aide">Découpez chaque journée en plages. Pour chaque plage : les durées que les joueurs peuvent réserver et le prix par joueur pour une heure (heures creuses, heures pleines). Exemple : 08:00 à 18:00 en 1h ou 1h30 à 7 €, puis 18:00 à 23:00 en 1h30 uniquement à 10 €. Un jour sans plage est fermé.</div>
      <div class="gh-carte">
        ${[1, 2, 3, 4, 5, 6, 7].map(j => `<div class="gh-jour"><div class="gh-jour-nom">${JOURS[j - 1]}</div><div>
          ${P[j].length ? P[j].map((p, i) => lignePlage(p, j, i)).join('') : '<div class="gh-ferme">Fermé</div>'}
          <div class="gh-ligne" style="margin-top:6px">
            <button class="gh-btn clair" onclick="GH.pAjout(${j})">Ajouter une plage</button>
            ${j === 1 ? '<button class="gh-btn clair" onclick="GH.copier()">Copier le lundi sur tous les jours</button>' : ''}
          </div></div></div>`).join('')}
        <div class="gh-ligne" style="margin-top:14px;justify-content:flex-end"><button class="gh-btn" onclick="GH.pSave(this)">Enregistrer les horaires</button></div>
      </div>`);
  }
  function plageSuivante(l) {
    const der = l[l.length - 1];
    const prix = der ? der.prix_joueur : 8;
    if (!der) return { debut: '09:00', fin: '23:00', durees: [60, 90], prix_joueur: prix };
    const d = min(der.fin) || 18 * 60;
    return { debut: hhmm(d), fin: hhmm(Math.min(24 * 60 - 1, d + 180)), durees: [90], prix_joueur: prix };
  }
  function verifierPlages(l, ctx) {
    const tri = l.slice().sort((a, b) => min(a.debut) - min(b.debut));
    for (let i = 0; i < tri.length; i++) {
      const p = tri[i];
      if (min(p.debut) == null || min(p.fin) == null || min(p.fin) <= min(p.debut)) return `${ctx} : une plage finit avant de commencer.`;
      if (!p.durees.length) return `${ctx} : choisissez au moins une durée.`;
      if (!(parseFloat(p.prix_joueur) >= 3)) return `${ctx} : indiquez un prix par joueur.`;
      if (i && min(p.debut) < min(tri[i - 1].fin)) return `${ctx} : deux plages se chevauchent.`;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Jours particuliers : calendrier + exception
  // ---------------------------------------------------------------
  function vueExceptions() {
    if (!S.mois) { const d = new Date(); S.mois = new Date(d.getFullYear(), d.getMonth(), 1); }
    dessinerExceptions();
  }
  function dessinerExceptions() {
    const m = S.mois, debutMois = new Date(m.getFullYear(), m.getMonth(), 1), nbJ = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const decal = (debutMois.getDay() + 6) % 7, aujourd = iso(new Date());
    const cases = [];
    for (let i = 0; i < decal; i++) cases.push('<span></span>');
    for (let d = 1; d <= nbJ; d++) {
      const x = iso(new Date(m.getFullYear(), m.getMonth(), d)), e = S.exceptions.find(y => y.date === x);
      cases.push(`<button ${x < aujourd ? 'disabled' : ''} class="${e ? (e.ferme ? 'ferme' : 'exc') : ''} ${S.exc && S.exc.date === x ? 'sel' : ''}" onclick="GH.choisir('${x}')">${d}${e ? `<small>${e.ferme ? 'Fermé' : 'Modifié'}</small>` : ''}</button>`);
    }
    const titreMois = m.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    corps(`<div class="gh-aide">Choisissez une date pour la fermer ou changer ses horaires ce jour-là (ouvrir plus tard, fermer plus tôt, tarif spécial). Le reste de la semaine ne change pas. Les réservations déjà prises ne sont pas annulées automatiquement.</div>
      <div style="display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;align-items:start" class="gh-exc">
        <div class="gh-carte">
          <div class="gh-ligne" style="justify-content:space-between;margin-bottom:10px">
            <button class="gh-btn clair" onclick="GH.mois(-1)">Précédent</button><b style="text-transform:capitalize">${esc(titreMois)}</b><button class="gh-btn clair" onclick="GH.mois(1)">Suivant</button>
          </div>
          <div class="gh-cal">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="t">${x}</span>`).join('')}${cases.join('')}</div>
          <div class="gh-legende"><span><i style="border:1px solid var(--blue)"></i>Horaires modifiés</span><span><i style="background:#F6E3DF;border:1px solid var(--red)"></i>Fermé</span></div>
        </div>
        <div id="gh-exc-detail">${detailException()}</div>
      </div>
      ${S.exceptions.length ? `<div class="gh-carte"><b style="font-size:14px">À venir</b>${S.exceptions.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(e => `<div class="gh-ligne" style="padding:8px 0;border-bottom:1px solid var(--line,#eee)">
        <span style="min-width:160px;text-transform:capitalize">${new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span style="flex:1;color:var(--muted);font-size:13px">${e.ferme ? 'Fermé' : (e.plages || []).map(p => `${p.debut}–${p.fin} (${p.durees.map(fd).join('/')}, ${p.prix_joueur} €)`).join(' · ')}${e.raison ? ' · ' + esc(e.raison) : ''}</span>
        <button class="gh-btn clair" onclick="GH.choisir('${e.date}')">Modifier</button></div>`).join('')}</div>` : ''}`);
  }
  function detailException() {
    const e = S.exc;
    if (!e) return '<div class="gh-carte"><div class="gh-aide" style="margin:0">Cliquez sur une date du calendrier.</div></div>';
    const lib = new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `<div class="gh-carte">
      <b style="text-transform:capitalize;font-size:16px">${esc(lib)}</b>
      <div class="gh-ligne" style="margin:12px 0">
        <label style="font-size:14px"><input type="radio" name="gh-ouv" ${!e.ferme ? 'checked' : ''} onchange="GH.excFerme(false)"> Ouvert avec ces horaires</label>
        <label style="font-size:14px;margin-left:12px"><input type="radio" name="gh-ouv" ${e.ferme ? 'checked' : ''} onchange="GH.excFerme(true)"> Fermé toute la journée</label>
      </div>
      ${e.ferme ? '' : e.plages.map((p, i) => lignePlage(p, 0, i)).join('') + '<button class="gh-btn clair" style="margin-top:6px" onclick="GH.pAjout(0)">Ajouter une plage</button>'}
      <div style="margin-top:12px"><input type="text" maxlength="80" placeholder="Raison (optionnel, ex. travaux, tournoi)" value="${esc(e.raison || '')}" oninput="GH.excRaison(this.value)" style="width:100%"></div>
      <div class="gh-ligne" style="margin-top:14px">
        ${e.existe ? '<button class="gh-btn rouge" onclick="GH.excSuppr(this)">Revenir aux horaires normaux</button>' : ''}
        <span style="flex:1"></span>
        <button class="gh-btn" onclick="GH.excSave(this)">Enregistrer ce jour</button>
      </div></div>`;
  }
  function plagesSemaine(isoD) {
    const d = new Date(isoD + 'T12:00:00').getDay(), j = d === 0 ? 7 : d;
    return S.plages.filter(p => p.jour === j).map(p => ({ debut: p.debut, fin: p.fin, durees: (p.durees || []).slice(), prix_joueur: p.prix_joueur }));
  }

  // ---------------------------------------------------------------
  // Planning du jour : une colonne par terrain
  // ---------------------------------------------------------------
  async function vuePlanning() {
    corps('<div class="gh-aide">Chargement…</div>');
    try { S.planning = await api('/api/fives?planning=' + encodeURIComponent(five()) + '&date=' + S.date); }
    catch (e) { return corps(`<div class="gh-aide">${esc(e.message)}</div>`); }
    dessinerPlanning();
  }
  function dessinerPlanning() {
    const p = S.planning, ts = p.terrains || [];
    const plages = p.plages || [];
    const ouv = plages.length ? Math.min(...plages.map(x => x.debut)) : 9 * 60, ferm = plages.length ? Math.max(...plages.map(x => x.fin)) : 23 * 60;
    const de = Math.floor(Math.min(ouv, 8 * 60) / 60) * 60, a = Math.ceil(Math.max(ferm, 22 * 60) / 60) * 60;
    const PX = 0.9, H = (a - de) * PX, y = m => (m - de) * PX;
    const idx = id => ts.findIndex(t => t.id && t.id === id);
    const cols = ts.map(() => []);
    const sans = [];
    const sm = x => min(x.heure);
    (p.matchs || []).forEach(m => { const i = idx(m.terrain_id); (i >= 0 ? cols[i] : sans).push({ k: 'm', x: m }); });
    (p.bloques || []).forEach(b => { if (b.terrain_id) { const i = idx(b.terrain_id); if (i >= 0) cols[i].push({ k: 'b', x: b }); } else cols.forEach(c => c.push({ k: 'b', x: b })); });
    sans.forEach(e => { const s0 = sm(e.x), e0 = s0 + (e.x.duree || 60); const i = cols.findIndex(c => !c.some(o => { const s1 = sm(o.x); return s0 < s1 + (o.x.duree || 60) && s1 < e0; })); (cols[i >= 0 ? i : 0]).push(e); });
    const fermes = [];
    let cur = de;
    plages.slice().sort((x, z) => x.debut - z.debut).forEach(pl => { if (pl.debut > cur) fermes.push([cur, pl.debut]); cur = Math.max(cur, pl.fin); });
    if (cur < a) fermes.push([cur, a]);
    const evt = e => {
      const s0 = sm(e.x), d = e.x.duree || 60, top = y(s0), h = d * PX - 2;
      const plage = `${hhmm(s0)}–${hhmm(s0 + d)}`;
      if (e.k === 'b') return `<div class="gh-ev bloque" style="top:${top}px;height:${h}px" title="Cliquer pour débloquer" onclick="GH.debloquer('${e.x.id}')"><b>Bloqué</b>${plage}${e.x.raison ? ' · ' + esc(e.x.raison) : ''}</div>`;
      const m = e.x, cl = m.statut === 'confirmed' ? 'match' : m.statut === 'open' ? 'open' : 'pending';
      const titre = m.type === 'terrain' ? esc(m.equipe1) : `${esc(m.equipe1)}${m.equipe2 ? ' vs ' + esc(m.equipe2) : ''}`;
      const st = m.statut === 'confirmed' ? 'Confirmé' : m.statut === 'open' ? 'Cherche un adversaire' : 'Paiement en cours';
      return `<div class="gh-ev ${cl}" style="top:${top}px;height:${h}px" title="${titre} · ${st}"><b>${plage}</b>${titre}<div style="opacity:.75">${st}</div></div>`;
    };
    const heures = []; for (let h = de; h <= a; h += 60) heures.push(`<div class="gh-h" style="top:${y(h)}px">${hhmm(h)}</div>`);
    const libDate = new Date(S.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    corps(`<div class="gh-ligne" style="margin-bottom:14px">
        <button class="gh-btn clair" onclick="GH.jour(-1)">Veille</button>
        <input type="date" value="${S.date}" onchange="GH.date(this.value)">
        <button class="gh-btn clair" onclick="GH.jour(1)">Lendemain</button>
        <b style="text-transform:capitalize;margin-left:8px">${esc(libDate)}</b>
        ${p.exception ? `<span style="font-size:12px;color:var(--blue);margin-left:6px">${p.exception.ferme ? 'Fermé ce jour' : 'Horaires modifiés ce jour'}</span>` : ''}
      </div>
      <div class="gh-carte gh-planning">
        <div class="gh-grille" style="grid-template-columns:52px repeat(${ts.length}, minmax(120px,1fr))">
          <div></div>${ts.map(t => `<div class="gh-col-t">${esc(t.nom)}</div>`).join('')}
          <div class="gh-heures" style="height:${H}px">${heures.join('')}</div>
          ${cols.map(c => `<div class="gh-col" style="height:${H}px;background-size:100% ${60 * PX}px">${fermes.map(([f1, f2]) => `<div class="gh-ferme-zone" style="top:${y(f1)}px;height:${(f2 - f1) * PX}px"></div>`).join('')}${c.map(evt).join('')}</div>`).join('')}
        </div>
        <div class="gh-legende"><span><i style="background:#111010"></i>Match confirmé</span><span><i style="background:#E7F3EC;border:1px solid #9FCFB3"></i>Cherche un adversaire</span><span><i style="background:#F6E3DF;border:1px solid #E6B4AA"></i>Bloqué</span><span><i style="background:rgba(0,0,0,.06)"></i>Fermé</span></div>
      </div>
      <div class="gh-carte">
        <b style="font-size:14px">Bloquer un créneau</b>
        <div class="gh-aide" style="margin:4px 0 10px">Maintenance, location hors Matchday, cours… Le créneau disparaît de l'app pour ce terrain.</div>
        <div class="gh-ligne">
          <input type="time" id="gh-b-h" step="1800" value="18:00">
          <select id="gh-b-d">${[30, 60, 90, 120, 180, 240].map(d => `<option value="${d}" ${d === 60 ? 'selected' : ''}>${fd(d)}</option>`).join('')}</select>
          <select id="gh-b-t"><option value="">Tous les terrains</option>${ts.filter(t => t.id).map(t => `<option value="${t.id}">${esc(t.nom)}</option>`).join('')}</select>
          <input type="text" id="gh-b-r" maxlength="80" placeholder="Raison (optionnel)" style="flex:1;min-width:160px">
          <button class="gh-btn" onclick="GH.bloquer(this)">Bloquer</button>
        </div>
      </div>`);
  }

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------
  async function avec(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message); }
    if (btn) btn.disabled = false;
  }
  const listeExc = () => (S.exc ? S.exc.plages : null);
  window.GH = {
    onglet(k) { S.onglet = k; S.exc = null; rendre(); },
    // terrains
    tNom(i, v) { T[i].nom = v; },
    tAjout() { T.push({ nom: 'Terrain ' + (T.length + 1) }); dessinerTerrains(); },
    tSuppr(i) { T.splice(i, 1); dessinerTerrains(); },
    tSave(btn) {
      return avec(btn, async () => {
        if (T.some(t => !t.nom.trim())) throw new Error('Chaque terrain doit avoir un nom.');
        await post('/api/fives', { action: 'terrains', five: five(), terrains: T.map(t => ({ id: t.id, nom: t.nom.trim() })) });
        await charger(); vueTerrains(); toast('TERRAINS ENREGISTRÉS');
      });
    },
    // plages (j = 0 : plages de l'exception en cours)
    p(j, i, k, v) { const l = j ? P[j] : listeExc(); l[i][k] = k === 'prix_joueur' ? parseFloat(v) : v; },
    pDuree(j, i, d, on) { const l = j ? P[j] : listeExc(); const p = l[i]; p.durees = on ? [...new Set(p.durees.concat(d))].sort((a, b) => a - b) : p.durees.filter(x => x !== d); },
    pAjout(j) { const l = j ? P[j] : listeExc(); l.push(plageSuivante(l)); j ? dessinerHoraires() : redessinerExc(); },
    pSuppr(j, i) { const l = j ? P[j] : listeExc(); l.splice(i, 1); j ? dessinerHoraires() : redessinerExc(); },
    copier() { for (let j = 2; j <= 7; j++) P[j] = P[1].map(p => ({ ...p, durees: p.durees.slice() })); dessinerHoraires(); },
    pSave(btn) {
      return avec(btn, async () => {
        for (let j = 1; j <= 7; j++) { const err = verifierPlages(P[j], JOURS[j - 1]); if (err) throw new Error(err); }
        const plages = []; for (let j = 1; j <= 7; j++) P[j].forEach(p => plages.push({ jour: j, ...p }));
        await post('/api/fives', { action: 'plages', five: five(), plages });
        await charger(); vueHoraires(); toast('HORAIRES ENREGISTRÉS');
      });
    },
    // exceptions
    mois(n) { S.mois = new Date(S.mois.getFullYear(), S.mois.getMonth() + n, 1); dessinerExceptions(); },
    choisir(x) {
      const e = S.exceptions.find(y => y.date === x);
      S.exc = e ? { date: x, ferme: !!e.ferme, plages: (e.plages || []).map(p => ({ ...p, durees: (p.durees || []).slice() })), raison: e.raison || '', existe: true }
        : { date: x, ferme: false, plages: plagesSemaine(x), raison: '', existe: false };
      if (!S.exc.ferme && !S.exc.plages.length) S.exc.plages.push(plageSuivante([]));
      const d = new Date(x + 'T12:00:00'); S.mois = new Date(d.getFullYear(), d.getMonth(), 1);
      dessinerExceptions();
    },
    excFerme(v) { S.exc.ferme = v; if (!v && !S.exc.plages.length) S.exc.plages.push(plageSuivante([])); redessinerExc(); },
    excRaison(v) { S.exc.raison = v; },
    excSave(btn) {
      return avec(btn, async () => {
        if (!S.exc.ferme) { const err = verifierPlages(S.exc.plages, 'Ce jour'); if (err) throw new Error(err); }
        await post('/api/fives', { action: 'exception', five: five(), date: S.exc.date, ferme: S.exc.ferme, plages: S.exc.plages, raison: S.exc.raison });
        await charger(); S.exc.existe = true; dessinerExceptions(); toast('JOUR ENREGISTRÉ');
      });
    },
    excSuppr(btn) {
      return avec(btn, async () => {
        await post('/api/fives', { action: 'supprimerException', five: five(), date: S.exc.date });
        await charger(); S.exc = null; dessinerExceptions(); toast('HORAIRES NORMAUX RÉTABLIS');
      });
    },
    // planning
    jour(n) { const d = new Date(S.date + 'T12:00:00'); d.setDate(d.getDate() + n); S.date = iso(d); vuePlanning(); },
    date(v) { if (v) { S.date = v; vuePlanning(); } },
    bloquer(btn) {
      return avec(btn, async () => {
        const v = id => document.getElementById(id).value;
        await post('/api/fives', { action: 'bloquer', five: five(), date: S.date, heure: v('gh-b-h'), duree: parseInt(v('gh-b-d'), 10), terrain_id: v('gh-b-t') || null, raison: v('gh-b-r') || null });
        toast('CRÉNEAU BLOQUÉ'); vuePlanning();
      });
    },
    async debloquer(id) {
      if (!confirm('Débloquer ce créneau ?')) return;
      try { await api('/api/fives?bloque=' + encodeURIComponent(id), { method: 'DELETE' }); toast('CRÉNEAU DÉBLOQUÉ'); vuePlanning(); } catch (e) { toast(e.message); }
    }
  };
  function redessinerExc() { const z = document.getElementById('gh-exc-detail'); if (z) z.innerHTML = detailException(); }

  // Recharger quand on change de five
  const ancienLoadData = window.loadData;
  if (typeof ancienLoadData === 'function') {
    window.loadData = async function () {
      const r = await ancienLoadData.apply(this, arguments);
      const page = document.getElementById('page-terrains');
      if (page && page.classList.contains('active')) window.loadTerrains();
      return r;
    };
  }
})();
