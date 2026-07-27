(function () {
  'use strict';

  var CFG = window.HOODPACKS || {};
  var CHAIN = CFG.chain || {};
  var TOKEN = CFG.token || {};

  /* ---------------- toasts ---------------- */

  var toastHost = null;
  function host() {
    if (toastHost && document.body.contains(toastHost)) return toastHost;
    toastHost = document.querySelector('[data-hp-toasts]');
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.setAttribute('data-hp-toasts', '');
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastHost);
    }
    return toastHost;
  }

  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'hp-toast' + (kind ? ' hp-toast--' + kind : '');
    el.textContent = msg;
    host().appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-in'); });
    setTimeout(function () {
      el.classList.remove('is-in');
      setTimeout(function () { el.remove(); }, 250);
    }, 4200);
  }

  /* ---------------- helpers ---------------- */

  function hasProvider() { return typeof window.ethereum !== 'undefined'; }
  function short(a) { return a.slice(0, 6) + '...' + a.slice(-4); }
  function tokenReady() { return !!(TOKEN.address && /^0x[0-9a-fA-F]{40}$/.test(TOKEN.address)); }

  function pad32(addr) { return addr.replace(/^0x/, '').toLowerCase().padStart(64, '0'); }

  // format a base-unit BigInt into a human string with thousands separators
  function formatUnits(raw, decimals) {
    var neg = raw < 0n;
    if (neg) raw = -raw;
    var base = 10n ** BigInt(decimals);
    var whole = raw / base;
    var frac = raw % base;
    var out = whole.toLocaleString('en-US');
    if (whole < 1000n && frac > 0n) {
      var f = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
      if (f) out += '.' + f;
    }
    return (neg ? '-' : '') + out;
  }

  /* ---------------- state ---------------- */

  var addr = '';
  var decimals = null;
  var btn = document.getElementById('wallet-btn');
  var pill = null;

  function connected() { return !!addr; }

  function balanceTargets() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-hpack-balance]'));
  }

  function ensurePill() {
    if (pill && document.body.contains(pill)) return pill;
    if (!btn || !btn.parentElement) return null;
    pill = document.createElement('span');
    pill.className = 'hp-balance';
    pill.setAttribute('data-hpack-balance', '');
    btn.parentElement.insertBefore(pill, btn);
    return pill;
  }

  function setBalanceText(txt) {
    if (tokenReady() && connected()) ensurePill();
    balanceTargets().forEach(function (el) {
      el.textContent = txt;
    });
  }

  function paint() {
    if (btn) {
      btn.textContent = connected() ? short(addr) : 'Connect Wallet';
      btn.disabled = false;
    }
    if (!connected()) {
      if (pill) { pill.remove(); pill = null; }
      balanceTargets().forEach(function (el) { el.textContent = '--'; });
    }
  }

  /* ---------------- chain reads ---------------- */

  async function ethCall(to, data) {
    return await window.ethereum.request({
      method: 'eth_call',
      params: [{ to: to, data: data }, 'latest']
    });
  }

  async function readDecimals() {
    if (TOKEN.decimals != null) return TOKEN.decimals;
    if (decimals != null) return decimals;
    try {
      var hex = await ethCall(TOKEN.address, '0x313ce567'); // decimals()
      decimals = parseInt(hex, 16);
      if (!Number.isFinite(decimals)) decimals = 18;
    } catch (e) {
      decimals = 18;
    }
    return decimals;
  }

  async function refreshBalance() {
    if (!tokenReady() || !connected() || !hasProvider()) {
      setBalanceText('--');
      return;
    }
    try {
      var d = await readDecimals();
      var hex = await ethCall(TOKEN.address, '0x70a08231' + pad32(addr)); // balanceOf(address)
      var raw = BigInt(hex && hex !== '0x' ? hex : '0x0');
      setBalanceText(formatUnits(raw, d) + ' $' + (TOKEN.symbol || 'HPACK'));
    } catch (e) {
      setBalanceText('--');
    }
  }

  /* ---------------- network ---------------- */

  async function currentChainId() {
    try { return await window.ethereum.request({ method: 'eth_chainId' }); }
    catch (e) { return null; }
  }

  async function ensureChain() {
    if (!CHAIN.hexId) return true;
    var now = await currentChainId();
    if (now && now.toLowerCase() === CHAIN.hexId.toLowerCase()) return true;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN.hexId }]
      });
      return true;
    } catch (e) {
      if (e && e.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CHAIN.hexId,
              chainName: CHAIN.name,
              rpcUrls: [CHAIN.rpc],
              blockExplorerUrls: [CHAIN.explorer],
              nativeCurrency: CHAIN.currency
            }]
          });
          return true;
        } catch (e2) {
          toast('Add ' + CHAIN.name + ' in your wallet to continue.', 'warn');
          return false;
        }
      }
      toast('Switch to ' + CHAIN.name + ' to see your balance.', 'warn');
      return false;
    }
  }

  /* ---------------- connect ---------------- */

  async function connect(silent) {
    if (!hasProvider()) {
      if (!silent) toast('No wallet detected. Install MetaMask, then reload.', 'warn');
      return false;
    }
    try {
      var accounts = await window.ethereum.request({
        method: silent ? 'eth_accounts' : 'eth_requestAccounts'
      });
      if (!accounts || !accounts.length) return false;

      addr = accounts[0];
      paint();
      if (!silent) {
        await ensureChain();
        toast('Wallet connected: ' + short(addr), 'ok');
      }
      refreshBalance();
      return true;
    } catch (e) {
      if (!silent) {
        toast(e && e.code === 4001 ? 'Connection rejected.' : 'Could not connect. Try again.', 'warn');
      }
      return false;
    }
  }

  function disconnect() {
    addr = '';
    decimals = null;
    paint();
    toast('Wallet disconnected.');
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (connected()) disconnect(); else connect(false);
    });
    paint();
  }

  if (hasProvider()) {
    window.ethereum.on('accountsChanged', function (a) {
      addr = a && a.length ? a[0] : '';
      paint();
      refreshBalance();
    });
    window.ethereum.on('chainChanged', function () { window.location.reload(); });
    connect(true);
  } else {
    paint();
  }

  /* ---------------- pack actions ---------------- */

  function packName() {
    var h = document.querySelector('main h1');
    return h ? h.textContent.trim() : 'This pack';
  }

  // Never prompts for a wallet — connecting is the header button's job.
  function openPack(kind) {
    var what = kind === 'bundle' ? '12x bundle' : 'single open';
    var sale = (CFG.packs || {}).address;
    if (!sale) {
      toast(packName() + ' — ' + what + ' goes live at launch. Follow @getHoodPacks for the drop.');
      return;
    }
    toast('Opening is not wired to the sale contract yet.', 'warn');
  }

  /* ---------------- delegated clicks ---------------- */

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('button') : null;
    if (!t) return;
    var label = (t.textContent || '').trim().toLowerCase();

    if (label === 'view details') {
      ev.preventDefault();
      var wrap = t.parentElement;
      var link = wrap && wrap.querySelector('a[href]');
      if (!link) {
        var card = t.closest('.group');
        link = card && card.querySelector('a[href*="/packs/"]');
      }
      if (link) window.location.href = link.getAttribute('href');
      return;
    }

    if (label === 'open pack') { ev.preventDefault(); openPack('single'); return; }
    if (label === 'bundle') { ev.preventDefault(); openPack('bundle'); return; }
    if (label === 'connect metamask') { ev.preventDefault(); if (btn) btn.click(); return; }
  });

  /* ---------------- mobile menu ---------------- */

  var toggle = document.querySelector('button[aria-label="Toggle menu"]');
  var nav = document.querySelector('header nav');
  if (toggle && nav) {
    var panel = document.createElement('div');
    panel.className = 'hp-mobile-nav';
    nav.querySelectorAll('a[href]').forEach(function (a) {
      var c = document.createElement('a');
      c.href = a.getAttribute('href');
      c.textContent = a.textContent.trim();
      panel.appendChild(c);
    });
    document.querySelector('header').appendChild(panel);

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      var open = panel.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && !toggle.contains(e.target)) {
        panel.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- debug handle ---------------- */

  window.HoodPacks = {
    address: function () { return addr; },
    refresh: refreshBalance,
    config: CFG
  };
})();
