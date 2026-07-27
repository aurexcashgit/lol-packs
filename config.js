/* HoodPacks runtime config.
   Drop the token address in here once $HPACK is deployed and the whole
   site starts reading balances. Nothing else needs to change. */

window.HOODPACKS = {

  // ---- token -------------------------------------------------------------
  // Paste the $HPACK contract address here. Leave empty until it exists:
  // every balance readout stays as "--" and nothing errors.
  token: {
    address: '',          // e.g. '0xAbC...123'
    symbol: 'HPACK',
    decimals: null        // null = read decimals() from the contract
  },

  // ---- pack sale contract ------------------------------------------------
  // Fill when pack opening ships. Until then Open Pack reports launch status.
  packs: {
    address: ''
  },

  // ---- Robinhood Chain ---------------------------------------------------
  chain: {
    id: 4663,
    hexId: '0x1237',
    name: 'Robinhood Chain',
    rpc: 'https://rpc.mainnet.chain.robinhood.com/',
    explorer: 'https://robinhoodchain.blockscout.com/',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  }
};
