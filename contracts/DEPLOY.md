# Deploying the pack sale

Two contracts. Deploy `HoodCards` first, then `HoodPacksSale`, then point them
at each other. Use Remix so your private key never leaves your wallet.

Network: **Robinhood Chain**, chain id **4663**, RPC `https://rpc.mainnet.chain.robinhood.com/`

Known addresses:

| What | Address |
| --- | --- |
| $HPACK token | `0xddf18b20888898ffa4e32357912fb8957e0f711f` |
| Treasury (revenue receiver) | `0xe09265d1d2c1015736199e450fc3803a0f43b20a` |

---

## 1. HoodCards

Constructor:

| Arg | Value |
| --- | --- |
| `baseURI_` | `https://hoodpacks.fun/api/card/` |
| `owner_` | your deployer address |

Note the base URI is not serving anything yet. `tokenURI` will return
`https://hoodpacks.fun/api/card/<cardId>.json`, so metadata has to exist there
before marketplaces can render a card. `setBaseURI` can move it later.

## 2. HoodPacksSale

Constructor:

| Arg | Value |
| --- | --- |
| `hpack_` | `0xddf18b20888898ffa4e32357912fb8957e0f711f` |
| `cards_` | address from step 1 |
| `treasury_` | `0xe09265d1d2c1015736199e450fc3803a0f43b20a` |
| `owner_` | your deployer address |
| `weights` | `[200,600,1400,2800,5000]` |
| `rarityCardIds` | `[[1,2,3],[4,5,6,7,8],[9,10,11,12,13],[14,15,16,17,18],[19,20,21,22,23,24]]` |

`weights` are per card slot out of 10000 and match the odds table published in
the whitepaper: Legendary 2%, Epic 6%, Rare 14%, Uncommon 28%, Common 50%.
They are written at construction and cannot be changed afterwards. Getting them
wrong means redeploying.

Card ids follow the Set 1 roster order used across the site: 1 Robin Hood
through 24 Longbow.

## 3. Wire them together

On `HoodCards`, call:

```
setMinter(<HoodPacksSale address>)
```

Until this is done every open reverts, because the sale contract is not allowed
to mint.

## 4. Hand me the sale address

I put it in `config.js` under `packs.address`. That single line flips the site:
the Open Pack and Bundle buttons start calling the contract, and the
"opening is not live yet" notices remove themselves.

---

## Before you launch this

**Card art is incomplete.** 16 of the 24 faces exist. Cards 17 to 24 (Gilbert
with the White Hand, David of Doncaster, and the six Commons) have no artwork,
and Commons are 50% of every pull. Launching now means half of what people open
has no picture.

**Randomness is not VRF.** The seed mixes `prevrandao`, the previous block hash,
the buyer and a nonce. Every pull is replayable from the emitted event, which is
what the whitepaper promises, but a sequencer could in principle influence the
outcome. Chainlink is a Robinhood Chain launch partner, so VRF is the upgrade
path when the numbers get big enough to be worth attacking.

**Nothing is audited.** These contracts were written in one sitting. Money moves
through `_open`. Read it before you trust it with other people's funds.
