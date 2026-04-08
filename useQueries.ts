import { formatTokenBalance } from "@/lib/tokenUtils";
import type {
  LandData,
  ModifierInstance,
  Time,
  TopLandEntry,
} from "@/types/backendTypes";
import type { Principal } from "@icp-sdk/core/principal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  GProposal,
  GStakeInfo,
  GStakeResult,
  GStakerLeaderboardEntry,
  GVoteRecord,
  GVoteResult,
} from "../governance-backend";
import { useActor } from "./useActor";
import { useGovernanceActor } from "./useGovernanceActor";
import { useInternetIdentity } from "./useInternetIdentity";
import { useTokenActor } from "./useTokenActor";

// Local types for governance (re-exported for component use)
export type {
  GProposal as Proposal,
  GStakeInfo,
  GStakerLeaderboardEntry,
  GVoteRecord,
};

enum ItemType {
  Land = "Land",
  Modifier = "Modifier",
}

interface Listing {
  listingId: bigint;
  itemId: bigint;
  itemType: ItemType;
  seller: Principal;
  price: bigint;
  isActive: boolean;
  biome: string;
}

type BuyResult =
  | {
      __kind__: "success";
      success: {
        buyer: Principal;
        seller: Principal;
        price: bigint;
      };
    }
  | {
      __kind__: "listingNotFound";
      listingNotFound: null;
    }
  | {
      __kind__: "listingNotActive";
      listingNotActive: null;
    }
  | {
      __kind__: "insufficientFunds";
      insufficientFunds: {
        required: bigint;
        available: bigint;
      };
    }
  | {
      __kind__: "transferFailed";
      transferFailed: string;
    }
  | {
      __kind__: "cannotBuyOwnListing";
      cannotBuyOwnListing: null;
    };

// Land Data Query
export function useGetLandData() {
  const { actor, isFetching } = useActor();

  return useQuery<LandData[]>({
    queryKey: ["landData"],
    queryFn: async () => {
      if (!actor) return [];
      console.log("Fetching land data...");
      const result = await actor.getLandData();
      console.log("Land data fetched:", result);
      return result;
    },
    enabled: !!actor && !isFetching,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

// Token Balance Query with Enhanced Retry
export function useGetTokenBalance() {
  const { actor: tokenActor, isFetching } = useTokenActor();
  const { identity } = useInternetIdentity();

  return useQuery({
    queryKey: ["tokenBalance", identity?.getPrincipal().toString()],
    queryFn: async () => {
      if (!tokenActor || !identity) {
        console.log(
          "Token balance query skipped - actor or identity not available",
        );
        return BigInt(0);
      }

      const principal = identity.getPrincipal();
      console.log("Getting CBR balance for Principal:", principal.toString());

      try {
        const balance = await tokenActor.icrc1_balance_of({
          owner: principal,
          subaccount: [],
        });
        console.log(
          "CBR balance response:",
          balance,
          "Formatted:",
          formatTokenBalance(balance),
        );
        return balance;
      } catch (error: any) {
        console.error("CBR balance fetch error:", error);
        throw error;
      }
    },
    enabled: !!tokenActor && !!identity && !isFetching,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 10000,
  });
}

// Debug Token Balance Hook
export function useDebugTokenBalance() {
  const { actor: tokenActor } = useTokenActor();
  const { identity } = useInternetIdentity();

  return useMutation({
    mutationFn: async () => {
      if (!tokenActor || !identity) {
        throw new Error("Token actor or identity not available");
      }

      const principal = identity.getPrincipal();
      console.log(
        "\uD83D\uDD0D Debug: Fetching CBR balance for Principal:",
        principal.toString(),
      );

      const balance = await tokenActor.icrc1_balance_of({
        owner: principal,
        subaccount: [],
      });

      console.log("\uD83D\uDD0D Debug: Raw balance response:", balance);
      console.log(
        "\uD83D\uDD0D Debug: Formatted balance:",
        formatTokenBalance(balance),
      );

      return balance;
    },
    onSuccess: (balance) => {
      toast.success(`Balance updated: ${formatTokenBalance(balance)} CBR`);
    },
    onError: (error: any) => {
      console.error("\uD83D\uDD0D Debug: Balance fetch failed:", error);
      toast.error(`Balance fetch error: ${error.message || "Unknown error"}`);
    },
  });
}

// Canister Token Balance Query (Admin Only)
export function useGetCanisterTokenBalance() {
  const { actor: tokenActor } = useTokenActor();

  return useQuery({
    queryKey: ["canisterTokenBalance"],
    queryFn: async () => {
      if (!tokenActor) {
        console.log(
          "Canister balance query skipped - token actor not available",
        );
        return BigInt(0);
      }

      console.log("Getting canister token balance...");

      try {
        const balance = await tokenActor.getCanisterTokenBalance();
        console.log(
          "Canister token balance response:",
          balance,
          "Formatted:",
          formatTokenBalance(balance),
        );
        return balance;
      } catch (error: any) {
        console.error("Canister balance fetch error:", error);
        throw error;
      }
    },
    enabled: !!tokenActor,
    retry: 2,
    retryDelay: 2000,
  });
}

// Debug Canister Balance Hook (Admin Only)
export function useDebugCanisterBalance() {
  const { actor: tokenActor } = useTokenActor();

  return useMutation({
    mutationFn: async () => {
      if (!tokenActor) {
        throw new Error("Token actor not available");
      }

      console.log("\uD83D\uDD0D Debug: Fetching canister token balance...");

      const balance = await tokenActor.getCanisterTokenBalance();

      console.log(
        "\uD83D\uDD0D Debug: Raw canister balance response:",
        balance,
      );
      console.log(
        "\uD83D\uDD0D Debug: Formatted canister balance:",
        formatTokenBalance(balance),
      );

      return balance;
    },
    onSuccess: (balance) => {
      toast.success(`Contract balance: ${formatTokenBalance(balance)} CBR`);
    },
    onError: (error: any) => {
      console.error(
        "\uD83D\uDD0D Debug: Canister balance fetch failed:",
        error,
      );
      toast.error(
        `Contract balance error: ${error.message || "Unknown error"}`,
      );
    },
  });
}

// Claim Rewards Mutation
export function useClaimRewards() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (landId: bigint) => {
      if (!actor) throw new Error("Actor not available");
      console.log("Claiming rewards for land:", landId);
      const result = await actor.claimRewards(landId);
      console.log("Claim result:", result);
      return result;
    },
    onSuccess: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      queryClient.invalidateQueries({ queryKey: ["landData"] });
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success("Rewards claimed!");
    },
    onError: (error: any) => {
      console.error("Claim rewards error:", error);
      toast.error(`Claim error: ${error.message || "Unknown error"}`);
    },
  });
}

// Upgrade Plot Mutation
export function useUpgradePlot() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ landId, cost }: { landId: bigint; cost: bigint }) => {
      if (!actor) throw new Error("Actor not available");
      console.log("Upgrading plot:", landId, "Cost:", cost);
      const result = await actor.upgradePlot(landId, cost);
      console.log("Upgrade result:", result);
      return result;
    },
    onSuccess: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      queryClient.invalidateQueries({ queryKey: ["landData"] });
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success("Plot upgraded!");
    },
    onError: (error: any) => {
      console.error("Upgrade plot error:", error);
      toast.error(`Upgrade error: ${error.message || "Unknown error"}`);
    },
  });
}

// Get Modifier Inventory Query
export function useGetModifierInventory() {
  const { actor, isFetching } = useActor();

  return useQuery<ModifierInstance[]>({
    queryKey: ["modifierInventory"],
    queryFn: async () => {
      if (!actor) return [];
      const result = await (actor as any).getMyModifierInventory();
      return result ?? [];
    },
    enabled: !!actor && !isFetching,
    retry: 2,
  });
}

// Apply Modifier Mutation
export function useApplyModifier() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      modifierInstanceId,
      landId,
    }: { modifierInstanceId: bigint; landId: bigint }) => {
      if (!actor) throw new Error("Actor not available");
      console.log("Applying modifier:", modifierInstanceId, "to land:", landId);
      await actor.applyModifier(modifierInstanceId, landId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landData"] });
      queryClient.invalidateQueries({ queryKey: ["modifierInventory"] });
      // PATH B: reactive update — installed mods change land state visible in marketplace
      queryClient.invalidateQueries({ queryKey: ["activeListings"] });
      queryClient.invalidateQueries({ queryKey: ["publicLandDataBatch"] });
      queryClient.invalidateQueries({ queryKey: ["govLeaderboard"] });
      toast.success("Modifier applied!");
    },
    onError: (error: any) => {
      console.error("Apply modifier error:", error);
      toast.error(`Modifier apply error: ${error.message || "Unknown error"}`);
    },
  });
}

// Remove Modifier Mutation
export function useRemoveModifier() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      landId,
      modifierInstanceId,
    }: { landId: bigint; modifierInstanceId: bigint }) => {
      if (!actor) throw new Error("Actor not available");
      console.log(
        "Removing modifier:",
        modifierInstanceId,
        "from land:",
        landId,
      );
      await actor.removeModifier(landId, modifierInstanceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landData"] });
      queryClient.invalidateQueries({ queryKey: ["modifierInventory"] });
      // PATH B: reactive update — removing a mod instantly updates marketplace listings
      queryClient.invalidateQueries({ queryKey: ["activeListings"] });
      queryClient.invalidateQueries({ queryKey: ["publicLandDataBatch"] });
      queryClient.invalidateQueries({ queryKey: ["govLeaderboard"] });
      toast.success("Modifier removed from land!");
    },
    onError: (error: any) => {
      console.error("Remove modifier error:", error);
      toast.error(`Modifier remove error: ${error.message || "Unknown error"}`);
    },
  });
}

// Mint Land Mutation
export function useMintLand() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Actor not available");
      console.log("Minting new land...");
      const result = await actor.mintLand();
      console.log("Mint result:", result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landData"] });
      toast.success("New land created!");
    },
    onError: (error: any) => {
      console.error("Mint land error:", error);
      toast.error(`Land creation error: ${error.message || "Unknown error"}`);
    },
  });
}

// Get Top Lands Query
export function useGetTopLands() {
  const { actor, isFetching } = useActor();

  return useQuery<TopLandEntry[]>({
    queryKey: ["topLands"],
    queryFn: async () => {
      if (!actor) return [];
      console.log("Fetching top lands...");
      const result = await actor.getTopLands(BigInt(25));
      console.log("Top lands fetched:", result);
      return result;
    },
    enabled: !!actor && !isFetching,
    retry: 2,
  });
}

// ─── Governance Hooks — wired to live governance actor (embedded in backend) ────────

export function useGetMyStakeInfo() {
  const { actor, isFetching } = useGovernanceActor();

  return useQuery<GStakeInfo>({
    queryKey: ["myStakeInfo"],
    queryFn: async () => {
      if (!actor)
        return {
          stake: BigInt(0),
          lockEndsAt: BigInt(0),
          weight: BigInt(0),
          unclaimedRewards: BigInt(0),
          claimableVest: BigInt(0),
          pendingVest: BigInt(0),
        } as GStakeInfo;
      return actor.gGetMyStakeInfo();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30000,
    retry: 1,
  });
}

// Backward-compatible: returns just the stake amount
export function useGetStakedBalance() {
  const { actor, isFetching } = useGovernanceActor();

  return useQuery({
    queryKey: ["stakedBalance"],
    queryFn: async () => {
      if (!actor) return BigInt(0);
      const info = await actor.gGetMyStakeInfo();
      return info.stake;
    },
    enabled: !!actor && !isFetching,
    staleTime: 30000,
    retry: 1,
  });
}

export function useStakeTokens() {
  const { actor } = useGovernanceActor();
  const queryClient = useQueryClient();

  return useMutation<GStakeResult, Error, bigint>({
    mutationFn: async (amount: bigint) => {
      if (!actor) throw new Error("Governance actor not available");
      return actor.gStakeTokens(amount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stakedBalance"] });
      queryClient.invalidateQueries({ queryKey: ["myStakeInfo"] });
      queryClient.invalidateQueries({ queryKey: ["govLeaderboard"] });
      toast.success("Tokens staked!");
    },
    onError: (error: any) => {
      console.error("Stake tokens error:", error);
      toast.error(`Staking error: ${error.message || "Unknown error"}`);
    },
  });
}

export function useUnstakeTokens() {
  const { actor } = useGovernanceActor();
  const queryClient = useQueryClient();

  return useMutation<void, Error, bigint>({
    mutationFn: async (amount: bigint) => {
      if (!actor) throw new Error("Governance actor not available");
      return actor.gUnstakeTokens(amount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stakedBalance"] });
      queryClient.invalidateQueries({ queryKey: ["myStakeInfo"] });
      queryClient.invalidateQueries({ queryKey: ["govLeaderboard"] });
      toast.success("Tokens unstaked!");
    },
    onError: (error: any) => {
      const msg = error?.message || "Unknown error";
      toast.error(
        msg.includes("locked")
          ? "Tokens are locked for the selected lock period"
          : `Unstake error: ${msg}`,
      );
    },
  });
}

export function useClaimVestedRewards() {
  const { actor } = useGovernanceActor();
  const queryClient = useQueryClient();

  return useMutation<bigint, Error, void>({
    mutationFn: async () => {
      if (!actor) throw new Error("Governance actor not available");
      return actor.gClaimVestedRewards();
    },
    onSuccess: (amount) => {
      queryClient.invalidateQueries({ queryKey: ["myStakeInfo"] });
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success(`Claimed ${amount.toString()} CBR rewards!`);
    },
    onError: (error: any) => {
      toast.error(`Claim error: ${error.message || "Unknown error"}`);
    },
  });
}

export function useGetAllProposals() {
  const { actor, isFetching } = useGovernanceActor();

  return useQuery<GProposal[]>({
    queryKey: ["allProposals"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.gGetAllProposals();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30000,
    retry: 1,
  });
}

export function useGetAllActiveProposals() {
  const { actor, isFetching } = useGovernanceActor();

  return useQuery<GProposal[]>({
    queryKey: ["activeProposals"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.gGetActiveProposals();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30000,
    retry: 1,
  });
}

export function useGetMyVotes() {
  const { actor, isFetching } = useGovernanceActor();

  return useQuery<GVoteRecord[]>({
    queryKey: ["myVotes"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.gGetMyVotes();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30000,
    retry: 1,
  });
}

export function useCreateProposal() {
  const { actor } = useGovernanceActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      description,
      category = "roadmap",
    }: { title: string; description: string; category?: string }) => {
      if (!actor) throw new Error("Governance actor not available");
      return actor.gCreateProposal(title, description, category);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activeProposals"] });
      queryClient.invalidateQueries({ queryKey: ["allProposals"] });
      toast.success("Proposal created!");
    },
    onError: (error: any) => {
      console.error("Create proposal error:", error);
      toast.error(`Proposal error: ${error.message || "Unknown error"}`);
    },
  });
}

export function useVote() {
  const { actor } = useGovernanceActor();
  const queryClient = useQueryClient();

  return useMutation<
    GVoteResult,
    Error,
    { proposalId: bigint; choice: boolean }
  >({
    mutationFn: async ({ proposalId, choice }) => {
      if (!actor) throw new Error("Governance actor not available");
      return actor.gVote(proposalId, choice);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["activeProposals"] });
      queryClient.invalidateQueries({ queryKey: ["allProposals"] });
      queryClient.invalidateQueries({ queryKey: ["myVotes"] });
      if ((result as any).notStaker !== undefined) {
        toast.error("You must stake tokens to vote");
      } else if ((result as any).alreadyVoted !== undefined) {
        toast.error("You already voted on this proposal");
      } else {
        toast.success("Vote recorded!");
      }
    },
    onError: (error: any) => {
      console.error("Vote error:", error);
      toast.error(`Vote error: ${error.message || "Unknown error"}`);
    },
  });
}

export function useGetLeaderboard(limit = BigInt(50)) {
  const { actor, isFetching } = useGovernanceActor();

  return useQuery<GStakerLeaderboardEntry[]>({
    queryKey: ["govLeaderboard", limit.toString()],
    queryFn: async () => {
      if (!actor) return [];
      return actor.gGetLeaderboard(limit);
    },
    enabled: !!actor && !isFetching,
    staleTime: 60000,
    retry: 1,
  });
}

export function useGetTreasuryBalance() {
  const { actor, isFetching } = useGovernanceActor();

  return useQuery<bigint>({
    queryKey: ["treasuryBalance"],
    queryFn: async () => {
      if (!actor) return BigInt(0);
      return actor.gGetTreasuryBalance();
    },
    enabled: !!actor && !isFetching,
    staleTime: 60000,
    retry: 1,
  });
}

// ─── Marketplace Hooks — wired to live marketplaceActor ─────────────────────

export function useGetAllActiveListings() {
  const { actor, isFetching } = useActor();

  return useQuery<Listing[]>({
    queryKey: ["activeListings"],
    queryFn: async () => {
      if (!actor) {
        console.log("[Marketplace] Actor not ready, returning empty listings");
        return [];
      }
      console.log("[Marketplace] Fetching active listings...");
      const result = await actor.getAllActiveListings();
      console.log("[Marketplace] Listings fetched:", result.length);
      return (result as any[]).map((l: any) => ({
        listingId: l.listingId,
        itemId: l.itemId,
        itemType: "Land" in l.itemType ? ItemType.Land : ItemType.Modifier,
        seller: l.seller,
        price: l.price,
        isActive: l.isActive,
        biome: l.biome ?? "",
      })) as Listing[];
    },
    enabled: !!actor && !isFetching,
    // PATH B: poll every 30s + refetch on focus for near-instant reactive updates
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
    retry: 0,
    retryDelay: 2000,
  });
}

export function useListItem(onBlockedError?: (msg: string) => void) {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      itemType,
      price,
    }: { itemId: bigint; itemType: ItemType; price: bigint }) => {
      if (!actor) throw new Error("Marketplace actor not available");
      console.log("[Marketplace] Listing item:", itemId, itemType, price);
      const candidItemType =
        itemType === ItemType.Land ? { Land: null } : { Modifier: null };
      const listingId = await actor.list_item(
        itemId,
        candidItemType as any,
        price,
      );
      return listingId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activeListings"] });
      queryClient.invalidateQueries({ queryKey: ["publicLandDataBatch"] });
      toast.success("Item listed for sale!");
    },
    onError: (error: any) => {
      console.error("List item error:", error);
      const msg = error.message || "";
      if (msg.includes("Last land locked")) {
        if (onBlockedError) {
          onBlockedError(
            "You cannot list your last land. You have already received your one-time auto-mint replacement. Acquire another land first.",
          );
        } else {
          toast.error(
            "You cannot list your last land. You have already received your one-time auto-mint replacement.",
          );
        }
      } else if (
        msg.includes("Already listed") ||
        msg.includes("already listed")
      ) {
        toast.error("This item is already listed for sale.");
      } else {
        toast.error(`Listing failed: ${msg || "Unknown error"}`);
      }
    },
  });
}

export function useBuyItem() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation<BuyResult, Error, bigint>({
    mutationFn: async (listingId: bigint) => {
      if (!actor) throw new Error("Marketplace actor not available");
      console.log("[Marketplace] Buying listing:", listingId);
      const result = await actor.buy_item(listingId);
      return result as unknown as BuyResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activeListings"] });
      queryClient.invalidateQueries({ queryKey: ["landData"] });
      queryClient.invalidateQueries({ queryKey: ["modifierInventory"] });
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["publicLandDataBatch"] });
      queryClient.invalidateQueries({ queryKey: ["topLands"] });
      toast.success("Purchase successful!");
    },
    onError: (error: any) => {
      console.error("Buy item error:", error);
      toast.error(`Purchase failed: ${error.message || "Unknown error"}`);
    },
  });
}

export function useCancelListing() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listingId: bigint) => {
      if (!actor) throw new Error("Marketplace actor not available");
      console.log("[Marketplace] Cancelling listing:", listingId);
      await actor.cancelListing(listingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activeListings"] });
      queryClient.invalidateQueries({ queryKey: ["publicLandDataBatch"] });
      toast.success("Listing cancelled.");
    },
    onError: (error: any) => {
      console.error("Cancel listing error:", error);
      toast.error(`Cancel failed: ${error.message || "Unknown error"}`);
    },
  });
}

// PATH B: Batch-fetch live land data by IDs — used by Marketplace for reactive
// card/inspector updates. When useRemoveModifier fires, it invalidates
// ["publicLandDataBatch"] and this query re-fetches, giving instant UI update.
export function useGetPublicLandDataBatch(landIds: bigint[]) {
  const { actor } = useActor();
  // Stable key based on sorted land IDs
  const key = [...landIds]
    .sort()
    .map((id) => id.toString())
    .join(",");

  return useQuery<Map<string, LandData>>({
    queryKey: ["publicLandDataBatch", key],
    queryFn: async () => {
      if (!actor || landIds.length === 0) return new Map();
      console.log("[PublicLandBatch] Fetching", landIds.length, "lands by ID");
      const results = await Promise.all(
        landIds.map((id) => (actor as any).getLandDataById(id)),
      );
      const map = new Map<string, LandData>();
      landIds.forEach((id, idx) => {
        const res = results[idx];
        // Motoko ?LandData returned as Option<LandData> with __kind__
        if (res && res.__kind__ === "Some") {
          map.set(id.toString(), res.value as LandData);
        }
      });
      console.log("[PublicLandBatch] Loaded", map.size, "land records");
      return map;
    },
    enabled: !!actor && landIds.length > 0,
    staleTime: 15000, // 15s cache — fresh enough for marketplace
    retry: 1,
  });
}

// Export ItemType for use in components
export { ItemType };
