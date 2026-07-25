(function () {
  'use strict';

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

  /* ---------------- wallet ---------------- */

  var RH_CHAIN_ID = null; // set once Robinhood Chain params are final
  var addr = '';
  var btn = document.getElementById('wallet-btn');

  function short(a) { return a.slice(0, 6) + '...' + a.slice(-4); }
  function connected() { return !!addr; }

  function paint() {
    if (!btn) return;
    btn.textContent = connected() ? short(addr) : 'Connect Wallet';
    btn.disabled = false;
  }

  function hasProvider() { return typeof window.ethereum !== 'undefined'; }

  async function connect(silent) {
    if (!hasProvider()) {
      if (!silent) toast('No wallet detected. Install MetaMask, then reload.', 'warn');
      return false;
    }
    try {
      var accounts = await window.ethereum.request({
        method: silent ? 'eth_accounts' : 'eth_requestAccounts'
      });
      if (accounts && accounts.length) {
        addr = accounts[0];
        paint();
        if (!silent) toast('Wallet connected: ' + short(addr), 'ok');
        return true;
      }
      return false;
    } catch (e) {
      if (e && e.code === 4001) {
        if (!silent) toast('Connection rejected.', 'warn');
      } else if (!silent) {
        toast('Could not connect. Try again.', 'warn');
      }
      return false;
    }
  }

  function disconnect() {
    addr = '';
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
    });
    window.ethereum.on('chainChanged', function () { window.location.reload(); });
    connect(true);
  }

  /* ---------------- pack actions ---------------- */

  function packName() {
    var h = document.querySelector('main h1');
    return h ? h.textContent.trim() : 'This pack';
  }

  // Pack actions never prompt for a wallet — connecting is the header
  // button's job and nothing else's.
  function openPack(kind) {
    var what = kind === 'bundle' ? '12x bundle' : 'single open';
    toast(packName() + ' — ' + what + ' goes live at launch. Follow @getHoodPacks for the drop.');
  }

  /* ---------------- delegated clicks ---------------- */

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('button') : null;
    if (!t) return;

    var label = (t.textContent || '').trim().toLowerCase();

    // "View Details" sits next to the pack link — follow it
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
})();
