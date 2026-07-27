// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHoodCards {
    function mint(address to, uint16 cardId) external returns (uint256);
}

/// @title HoodPacksSale
/// @notice Sells and opens HoodPacks card packs for $HPACK.
/// @dev    Design constraints taken from the published whitepaper:
///           - the rarity table is written at construction and can never change
///           - there is no pre-reveal: the pull resolves inside the same call
///           - every open emits the seed and the resulting card ids, so any
///             disputed pull can be replayed from public data
///         Prices are the only mutable parameter, because $HPACK is volatile and
///         a fixed token price would drift away from the intended entry cost.
contract HoodPacksSale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- config

    IERC20 public immutable hpack;
    IHoodCards public immutable cards;

    /// @notice Where the non-burned share of every sale goes.
    address public treasury;

    /// @notice Share of each sale that is burned, in basis points.
    uint16 public constant BURN_BPS = 250; // 2.5%

    address public constant BURN_SINK = 0x000000000000000000000000000000000000dEaD;

    struct Tier {
        string name;
        uint256 price;      // per single open, in $HPACK wei
        uint8 cardsPerPack;
        bool enabled;
    }

    /// @notice tierId => tier. Ids match the site: 0 Obsidian .. 4 Tempest.
    Tier[] public tiers;

    /// @notice Cumulative rarity weights out of 10000, immutable after deploy.
    ///         Order: Legendary, Epic, Rare, Uncommon, Common.
    uint16[5] public cumulativeWeights;

    /// @notice Card ids belonging to each rarity bucket, immutable after deploy.
    uint16[][5] private _byRarity;

    /// @notice Bundles are 12 opens charged as 12, kept explicit so the site and
    ///         the contract cannot drift apart on what a bundle means.
    uint8 public constant BUNDLE_SIZE = 12;

    uint256 public nonce;

    // ---------------------------------------------------------------- events

    event PackOpened(
        address indexed buyer,
        uint8 indexed tierId,
        uint256 paid,
        uint256 burned,
        bytes32 seed,
        uint16[] cardIds
    );
    event TreasurySet(address indexed treasury);
    event PriceSet(uint8 indexed tierId, uint256 price);
    event TierEnabled(uint8 indexed tierId, bool enabled);

    // ---------------------------------------------------------------- errors

    error BadTier();
    error TierDisabled();
    error ZeroAddress();
    error EmptyBucket();

    // ----------------------------------------------------------- constructor

    /// @param rarityCardIds Card ids per rarity bucket, in the order
    ///        Legendary, Epic, Rare, Uncommon, Common.
    /// @param weights Per-slot odds out of 10000 in the same order. Must sum to
    ///        10000. The published table is 200 / 600 / 1400 / 2800 / 5000.
    constructor(
        address hpack_,
        address cards_,
        address treasury_,
        address owner_,
        uint16[5] memory weights,
        uint16[][5] memory rarityCardIds
    ) Ownable(owner_) {
        if (hpack_ == address(0) || cards_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        hpack = IERC20(hpack_);
        cards = IHoodCards(cards_);
        treasury = treasury_;

        uint16 running;
        for (uint256 i = 0; i < 5; i++) {
            if (rarityCardIds[i].length == 0) revert EmptyBucket();
            running += weights[i];
            cumulativeWeights[i] = running;
            _byRarity[i] = rarityCardIds[i];
        }
        require(running == 10000, "weights must sum to 10000");

        // Tier ids match the site ordering.
        tiers.push(Tier("Hood Obsidian", 53_000 ether, 7, true));
        tiers.push(Tier("Hood Plasma",   52_000 ether, 7, true));
        tiers.push(Tier("Hood Magma",    48_000 ether, 5, true));
        tiers.push(Tier("Hood Aurora",   45_000 ether, 5, true));
        tiers.push(Tier("Hood Tempest",  38_000 ether, 5, true));
    }

    // ------------------------------------------------------------------ read

    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    function cardsInRarity(uint8 rarity) external view returns (uint16[] memory) {
        return _byRarity[rarity];
    }

    /// @notice Total $HPACK charged for `packCount` opens of `tierId`.
    function quote(uint8 tierId, uint8 packCount) public view returns (uint256) {
        if (tierId >= tiers.length) revert BadTier();
        return tiers[tierId].price * packCount;
    }

    // ----------------------------------------------------------------- write

    /// @notice Buy and open a single pack.
    function openPack(uint8 tierId) external nonReentrant returns (uint16[] memory) {
        return _open(tierId, 1);
    }

    /// @notice Buy and open a 12 pack bundle in one transaction.
    function openBundle(uint8 tierId) external nonReentrant returns (uint16[] memory) {
        return _open(tierId, BUNDLE_SIZE);
    }

    function _open(uint8 tierId, uint8 packCount) private returns (uint16[] memory cardIds) {
        if (tierId >= tiers.length) revert BadTier();
        Tier memory t = tiers[tierId];
        if (!t.enabled) revert TierDisabled();

        uint256 total = t.price * packCount;
        uint256 burnCut = (total * BURN_BPS) / 10000;

        // Pull payment first, then split. Reverts if allowance or balance is short.
        hpack.safeTransferFrom(msg.sender, address(this), total);
        hpack.safeTransfer(BURN_SINK, burnCut);
        hpack.safeTransfer(treasury, total - burnCut);

        uint256 slots = uint256(t.cardsPerPack) * packCount;
        cardIds = new uint16[](slots);

        // One seed per open, mixed per slot. Recorded in the event so the whole
        // pull can be recomputed by anyone from public data.
        bytes32 seed = keccak256(
            abi.encodePacked(block.prevrandao, blockhash(block.number - 1), msg.sender, nonce++, total)
        );

        for (uint256 i = 0; i < slots; i++) {
            uint256 roll = uint256(keccak256(abi.encodePacked(seed, i)));
            cardIds[i] = _draw(roll);
            cards.mint(msg.sender, cardIds[i]);
        }

        emit PackOpened(msg.sender, tierId, total, burnCut, seed, cardIds);
    }

    /// @dev Picks a rarity by the immutable weight table, then a face uniformly
    ///      from that rarity's bucket.
    function _draw(uint256 roll) private view returns (uint16) {
        uint16 r = uint16(roll % 10000);
        uint8 rarity = 4;
        for (uint8 i = 0; i < 5; i++) {
            if (r < cumulativeWeights[i]) {
                rarity = i;
                break;
            }
        }
        uint16[] storage bucket = _byRarity[rarity];
        return bucket[(roll >> 16) % bucket.length];
    }

    // ----------------------------------------------------------------- admin

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    /// @notice Prices track the token, odds never move.
    function setPrice(uint8 tierId, uint256 price) external onlyOwner {
        if (tierId >= tiers.length) revert BadTier();
        tiers[tierId].price = price;
        emit PriceSet(tierId, price);
    }

    function setTierEnabled(uint8 tierId, bool enabled) external onlyOwner {
        if (tierId >= tiers.length) revert BadTier();
        tiers[tierId].enabled = enabled;
        emit TierEnabled(tierId, enabled);
    }

    /// @notice Recovers tokens sent here by mistake. Sale proceeds never rest in
    ///         this contract, they are split inside the same transaction.
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
