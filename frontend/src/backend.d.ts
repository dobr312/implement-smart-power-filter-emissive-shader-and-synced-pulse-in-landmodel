import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export type Time = bigint;
export interface LootCache {
    owner: Principal;
    tier: bigint;
    cache_id: bigint;
    discovered_at: Time;
    is_opened: boolean;
}
export interface Coordinates {
    lat: number;
    lon: number;
}
export type ClaimResult = {
    __kind__: "success";
    success: {
        tokensClaimed: bigint;
        newBalance: bigint;
        nextClaimTime: Time;
    };
} | {
    __kind__: "mintFailed";
    mintFailed: string;
} | {
    __kind__: "cooldown";
    cooldown: {
        currentBalance: bigint;
        remainingTime: bigint;
    };
} | {
    __kind__: "insufficientCharge";
    insufficientCharge: {
        required: bigint;
        current: bigint;
    };
};
export interface LandData {
    decorationURL?: string;
    baseTokenMultiplier: number;
    lastChargeUpdate: Time;
    upgradeLevel: bigint;
    principal: Principal;
    landId: bigint;
    lastClaimTime: Time;
    biome: string;
    chargeCap: bigint;
    cycleCharge: bigint;
    plotName: string;
    coordinates: Coordinates;
    attachedModifications: Array<ModifierInstance>;
}
export type DiscoverCacheResult = {
    __kind__: "success";
    success: LootCache;
} | {
    __kind__: "insufficientTokens";
    insufficientTokens: {
        required: bigint;
        current: bigint;
    };
} | {
    __kind__: "paymentFailed";
    paymentFailed: string;
} | {
    __kind__: "insufficientCharge";
    insufficientCharge: {
        required: bigint;
        current: bigint;
    };
};
export interface http_header {
    value: string;
    name: string;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface TopLandEntry {
    upgradeLevel: bigint;
    principal: Principal;
    tokenBalance: bigint;
    plotName: string;
}
export interface TransformationInput {
    context: Uint8Array;
    response: http_request_result;
}
export interface Modifier {
    name: string;
    asset_url: string;
    mod_id: bigint;
    rarity_tier: bigint;
    multiplier_value: number;
}
export type UpgradeResult = {
    __kind__: "maxLevelReached";
    maxLevelReached: null;
} | {
    __kind__: "success";
    success: {
        newLevel: bigint;
        remainingTokens: bigint;
    };
} | {
    __kind__: "insufficientTokens";
    insufficientTokens: {
        required: bigint;
        current: bigint;
    };
};
export interface ModifierInstance {
    modifierInstanceId: bigint;
    modifierType: string;
    model_url: string;
    rarity_tier: bigint;
    multiplier_value: number;
}
export interface UserProfile {
    name: string;
}
export interface Modification {
    model_url: string;
    mod_id: bigint;
    rarity_tier: bigint;
    multiplier_value: number;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    adminGetLandData(user: Principal): Promise<Array<LandData> | null>;
    adminSetAllModifiers(modifier_list: Array<Modifier>): Promise<void>;
    applyModifier(modifierInstanceId: bigint, landId: bigint): Promise<void>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    claimRewards(landId: bigint): Promise<ClaimResult>;
    discoverLootCache(tier: bigint): Promise<DiscoverCacheResult>;
    getAllModifiers(): Promise<Array<Modifier>>;
    getAssetCanisterCycleBalance(): Promise<string>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getCurrentCbrBalance(): Promise<bigint>;
    getHighestRarityModification(): Promise<Modification | null>;
    getLandCanisterCycleBalance(): Promise<string>;
    getLandData(): Promise<Array<LandData>>;
    getLandDataQuery(): Promise<Array<LandData> | null>;
    getLandOwner(landId: bigint): Promise<Principal | null>;
    getModifierById(mod_id: bigint): Promise<Modifier | null>;
    getModifiersByTier(tier: bigint): Promise<Array<Modifier>>;
    getMyLootCaches(): Promise<Array<LootCache>>;
    getMyModifications(): Promise<Array<Modification>>;
    getTopLands(limit: bigint): Promise<Array<TopLandEntry>>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    initializeAccessControl(): Promise<void>;
    isCallerAdmin(): Promise<boolean>;
    mintLand(): Promise<LandData>;
    processCache(cache_id: bigint): Promise<ModifierInstance>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    setGovernanceCanister(governance: Principal): Promise<void>;
    setMarketplaceCanister(marketplace: Principal): Promise<void>;
    setTokenCanister(token: Principal): Promise<void>;
    transferLand(to: Principal, landId: bigint): Promise<boolean>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
    updateDecoration(landId: bigint, url: string): Promise<void>;
    updatePlotName(landId: bigint, name: string): Promise<void>;
    upgradePlot(landId: bigint, cost: bigint): Promise<UpgradeResult>;
    useConsumableBuff(item_id: bigint): Promise<void>;
}
