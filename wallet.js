(function(){
  var btn = document.getElementById('wallet-btn');
  if (!btn) return;
  var connected = false;
  var addr = '';

  function short(a) { return a.slice(0,6) + '...' + a.slice(-4); }

  function updateBtn() {
    if (connected && addr) {
      btn.textContent = short(addr);
      btn.disabled = false;
      btn.classList.remove('disabled:cursor-not-allowed','disabled:opacity-50');
    } else {
      btn.textContent = 'Connect Wallet';
      btn.disabled = false;
      btn.classList.remove('disabled:cursor-not-allowed','disabled:opacity-50');
    }
  }

  btn.addEventListener('click', async function() {
    if (connected && addr) {
      connected = false;
      addr = '';
      updateBtn();
      return;
    }
    if (typeof window.ethereum === 'undefined') {
      window.open('https://metamask.io/download/', '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length) {
        addr = accounts[0];
        connected = true;
        updateBtn();
      }
    } catch(e) {
      if (e.code !== 4001) console.error(e);
    }
  });

  if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', function(accounts) {
      if (accounts.length) { addr = accounts[0]; connected = true; }
      else { addr = ''; connected = false; }
      updateBtn();
    });
    window.ethereum.on('chainChanged', function() { window.location.reload(); });
  }

  updateBtn();
})();
