// =====================================================================
// Matchday : inscription avec vérification de l'email
// =====================================================================
(function () {
  const MD = window.MD;

  // Email plus strict : pas de guillemets, pas d'espaces, un domaine valide
  MD.emailValide = function (e) {
    return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(String(e || '').trim());
  };
  window.validateEmail = MD.emailValide;

  // Lien reçu par mail : /app?verifier=TOKEN
  const ancienInit = window.agInit;
  window.agInit = async function () {
    const p = new URLSearchParams(location.search);
    const token = p.get('verifier');
    if (!token) return ancienInit.apply(this, arguments);
    history.replaceState({}, '', location.pathname);
    try {
      await MD.post('/api/auth', { action: 'verifier', token });
      showToast('✅ EMAIL CONFIRMÉ · TU PEUX TE CONNECTER');
    } catch (e) { showToast(e.message.toUpperCase(), 'error'); }
    return ancienInit.apply(this, arguments);
  };

  // Connexion : si l'email n'est pas confirmé, on propose de renvoyer le mail
  const ancienLogin = window.agHandleLogin;
  window.agHandleLogin = async function () {
    await ancienLogin.apply(this, arguments);
    const err = document.getElementById('agLoginError');
    if (err && /confirm/i.test(err.textContent) && !err.querySelector('button')) {
      const b = document.createElement('button');
      b.className = 'md-lien'; b.textContent = 'Renvoyer le mail de confirmation';
      b.onclick = async () => {
        try { await MD.post('/api/auth', { action: 'renvoyer', email: document.getElementById('agLoginEmail').value.trim() }); showToast('MAIL RENVOYÉ'); }
        catch (e) { showToast(e.message.toUpperCase(), 'error'); }
      };
      err.appendChild(document.createElement('br')); err.appendChild(b);
    }
  };

  // Après inscription : le message dit d'aller confirmer l'email
  const ancienRegister = window.agHandleRegister;
  window.agHandleRegister = async function () {
    await ancienRegister.apply(this, arguments);
    const ok = document.getElementById('agSectionSuccess');
    if (ok && ok.classList.contains('active') && !ok.dataset.md) {
      ok.dataset.md = '1';
      const p = document.createElement('p');
      p.className = 'md-verif';
      p.innerHTML = '📩 Dernière étape : clique sur le lien qu\'on vient de t\'envoyer par mail pour activer ton compte (pense à regarder les spams).';
      ok.insertBefore(p, ok.firstChild.nextSibling);
    }
  };
})();
