import type { Principal } from "@icp-sdk/core/principal";

export type Time = bigint;

export interface PublicLandInfo {
  landId: bigint;
  biome: string;
  principal: Principal;
}

export interface ModifierInstance {
  modifierInstanceId: bigint;
  modifierType: string;
  model_url: string;
  rarity_tier: bigint;
  multiplier_value: number;
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface LandData {
  landId: bigint;
  principal: Principal;
  biome: string;
  cycleCharge: bigint;
  chargeCap: bigint;
  upgradeLevel: bigint;
  baseTokenMultiplier: number;
  lastClaimTime: Time;
  lastChargeUpdate: Time;
  attachedModifications: ModifierInstance[];
  coordinates?: Coordinates;
  plotName?: string;
  decorationURL?: string;
}

export interface LootCache {
  cache_id: bigint;
  owner: Principal;
  tier: bigint;
  discovered_at: Time;
  is_opened: boolean;
}

export type DiscoverCacheResult =
  | { __kind__: "success"; success: LootCache }
  | {
      __kind__: "insufficientTokens";
      insufficientTokens: { required: bigint; current: bigint };
    }
  | { __kind__: "paymentFailed"; paymentFailed: string }
  | {
      __kind__: "insufficientCharge";
      insufficientCharge: { required: bigint; current: bigint };
    };

export type ClaimResult =
  | {
      __kind__: "success";
      success: {
        tokensClaimed: bigint;
        newBalance: bigint;
        nextClaimTime: Time;
      };
    }
  | { __kind__: "mintFailed"; mintFailed: string }
  | {
      __kind__: "cooldown";
      cooldown: { currentBalance: bigint; remainingTime: bigint };
    }
  | {
      __kind__: "insufficientCharge";
      insufficientCharge: { required: bigint; current: bigint };
    };

export type UpgradeResult =
  | { __kind__: "maxLevelReached" }
  | {
      __kind__: "success";
      success: { newLevel: bigint; remainingTokens: bigint };
    }
  | {
      __kind__: "insufficientTokens";
      insufficientTokens: { required: bigint; current: bigint };
    };

export interface TopLandEntry {
  upgradeLevel: bigint;
  principal: Principal;
  tokenBalance: bigint;
  biome: string;
  landId: bigint;
  plotName?: string;
}

export interface Modifier {
  mod_id: bigint;
  rarity_tier: bigint;
  name: string;
  multiplier_value: number;
  asset_url: string;
}

export type CrystalKind =
  | { __kind__: "Burnite" }
  | { __kind__: "Synthex" }
  | { __kind__: "Cryonix" };
export type CrystalTier = { __kind__: "T1" } | { __kind__: "T2" };
export interface CrystalItem {
  kind: CrystalKind;
  tier: CrystalTier;
  quantity: bigint;
}
export type BoosterKind =
  | { __kind__: "B250" }
  | { __kind__: "B500" }
  | { __kind__: "B1000" };
export interface BoosterItem {
  kind: BoosterKind;
  quantity: bigint;
}
export interface KeeperHeartItem {
  biome: string;
}
export interface CacheDropMod {
  modId: bigint;
  rarityTier: bigint;
  subtype: string;
  instanceId: bigint;
}
export type CacheDropItem =
  | { __kind__: "mod"; mod: CacheDropMod }
  | { __kind__: "crystal"; crystal: CrystalItem }
  | { __kind__: "booster"; booster: BoosterItem }
  | { __kind__: "keeperHeart"; keeperHeart: KeeperHeartItem };
export interface CacheOpenResult {
  items: CacheDropItem[];
  energySpent: bigint;
}
export interface FullInventory {
  crystals: CrystalItem[];
  boosters: BoosterItem[];
  keeperHearts: KeeperHeartItem[];
}

export type UserRole =
  | { __kind__: "admin" }
  | { __kind__: "user" }
  | { __kind__: "guest" };

// Marketplace types
export type ItemType = { __kind__: "Land" } | { __kind__: "Modifier" };
export interface Listing {
  listingId: bigint;
  itemId: bigint;
  itemType: ItemType;
  seller: Principal;
  price: bigint;
  isActive: boolean;
  biome: string;
}

export interface BackendActor {
  getLandData(): Promise<LandData[]>;
  getLandDataQuery(): Promise<LandData[] | null>;
  getCallerUserRole(): Promise<string>;
  isCallerAdmin(): Promise<boolean>;
  initializeAccessControl(): Promise<void>;
  claimRewards(landId: bigint): Promise<ClaimResult>;
  upgradePlot(landId: bigint, cost: bigint): Promise<UpgradeResult>;
  applyModifier(modifierInstanceId: bigint, landId: bigint): Promise<void>;
  removeModifier(landId: bigint, modifierInstanceId: bigint): Promise<void>;
  mintLand(): Promise<LandData>;
  getTopLands(limit: bigint): Promise<TopLandEntry[]>;
  getMyModifierInventory(): Promise<ModifierInstance[]>;
  getMyLootCaches(): Promise<LootCache[]>;
  discoverLootCache(tier: bigint): Promise<DiscoverCacheResult>;
  processCache(cacheId: bigint): Promise<ModifierInstance>;
  getAllLandsPublic(): Promise<PublicLandInfo[]>;
  getLandDataById(
    landId: bigint,
  ): Promise<{ __kind__: "Some"; value: LandData } | { __kind__: "None" }>;
  adminGetLandData(user: Principal): Promise<LandData[] | null>;
  setMarketplaceCanister(marketplace: Principal): Promise<void>;
  setGovernanceCanister(governance: Principal): Promise<void>;
  setTokenCanister(token: Principal): Promise<void>;
  getLandOwner(landId: bigint): Promise<Principal | null>;
  transferLand(to: Principal, landId: bigint): Promise<boolean>;
  transferModifier(
    from: Principal,
    to: Principal,
    modifierInstanceId: bigint,
  ): Promise<boolean>;
  adminSetAllModifiers(modifier_list: Modifier[]): Promise<void>;
  getAllModifiers(): Promise<Modifier[]>;
  getModifierById(mod_id: bigint): Promise<Modifier | null>;
  getModifiersByTier(tier: bigint): Promise<Modifier[]>;
  assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
  openCache(cacheId: bigint): Promise<CacheOpenResult>;
  useBooster(kind: BoosterKind): Promise<void>;
  getFullInventory(): Promise<FullInventory>;
  // Built-in marketplace
  list_item(itemId: bigint, itemType: ItemType, price: bigint): Promise<bigint>;
  buy_item(listingId: bigint): Promise<boolean>;
  cancelListing(listingId: bigint): Promise<boolean>;
  getAllActiveListings(): Promise<Listing[]>;
  getUserListings(user: Principal): Promise<Listing[]>;
  getActiveListing(listingId: bigint): Promise<Listing | null>;
  // Governance
  gStakeTokens(
    amount: bigint,
  ): Promise<
    | { __kind__: "success"; success: { newStake: bigint } }
    | { __kind__: "insufficientTokens" }
    | { __kind__: "transferFailed" }
  >;
  gUnstakeTokens(amount: bigint): Promise<void>;
  gClaimVestedRewards(): Promise<bigint>;
  gGetMyStakeInfo(): Promise<{
    stake: bigint;
    lockEndsAt: bigint;
    weight: bigint;
    unclaimedRewards: bigint;
    claimableVest: bigint;
    pendingVest: bigint;
  }>;
  gGetStakedBalance(p: Principal): Promise<bigint>;
  gGetTotalWeightedStake(): Promise<bigint>;
  gReceiveIncome(amount: bigint): Promise<void>;
  gGetTreasuryBalance(): Promise<bigint>;
  gGetDeveloperFund(): Promise<bigint>;
  gGetInsuranceReserve(): Promise<bigint>;
  gCreateProposal(
    title: string,
    description: string,
    category: string,
  ): Promise<bigint>;
  gVote(
    proposalId: bigint,
    choice: boolean,
  ): Promise<
    | { __kind__: "success" }
    | { __kind__: "proposalNotFound" }
    | { __kind__: "proposalNotActive" }
    | { __kind__: "alreadyVoted" }
    | { __kind__: "notStaker" }
  >;
  gGetAllProposals(): Promise<
    Array<{
      id: bigint;
      title: string;
      description: string;
      category: string;
      proposer: Principal;
      createdAt: bigint;
      votesYes: bigint;
      votesNo: bigint;
      isActive: boolean;
    }>
  >;
  gGetActiveProposals(): Promise<
    Array<{
      id: bigint;
      title: string;
      description: string;
      category: string;
      proposer: Principal;
      createdAt: bigint;
      votesYes: bigint;
      votesNo: bigint;
      isActive: boolean;
    }>
  >;
  gGetMyVotes(): Promise<
    Array<{ proposalId: bigint; choice: boolean; weight: bigint }>
  >;
  gGetLeaderboard(limit: bigint): Promise<
    Array<{
      principal: Principal;
      stake: bigint;
      weight: bigint;
      topBiome: string;
      maxMods: bigint;
      unclaimedRewards: bigint;
    }>
  >;
  gCalcWeight(p: Principal): Promise<bigint>;
  gAdminCloseProposal(proposalId: bigint): Promise<void>;
  gAdminWithdrawTreasury(amount: bigint): Promise<void>;
}
