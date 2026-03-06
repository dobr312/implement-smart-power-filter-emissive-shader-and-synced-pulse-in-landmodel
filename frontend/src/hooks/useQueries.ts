import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import { useTokenActor } from './useTokenActor';
import { useInternetIdentity } from './useInternetIdentity';
import { toast } from 'sonner';
import { formatTokenBalance } from '@/lib/tokenUtils';
import type { LandData, UserProfile, ModifierInstance, TopLandEntry, Time } from '@/backend';
import type { Principal } from '@icp-sdk/core/principal';

// Placeholder types for governance and marketplace (not yet in backend)
interface Proposal {
  id: bigint;
  title: string;
  description: string;
  proposer: Principal;
  createdAt: Time;
  votesYes: bigint;
  votesNo: bigint;
  isActive: boolean;
}

enum ItemType {
  Land = 'Land',
  Modifier = 'Modifier',
}

interface Listing {
  listingId: bigint;
  itemId: bigint;
  itemType: ItemType;
  seller: Principal;
  price: bigint;
  isActive: boolean;
}

type StakeResult = {
  __kind__: "success";
  success: {
    newStake: bigint;
  };
} | {
  __kind__: "insufficientTokens";
  insufficientTokens: {
    required: bigint;
    available: bigint;
  };
} | {
  __kind__: "transferFailed";
  transferFailed: string;
};

type VoteResult = {
  __kind__: "success";
  success: {
    weight: bigint;
  };
} | {
  __kind__: "proposalNotFound";
  proposalNotFound: null;
} | {
  __kind__: "proposalNotActive";
  proposalNotActive: null;
} | {
  __kind__: "alreadyVoted";
  alreadyVoted: null;
} | {
  __kind__: "notStaker";
  notStaker: null;
};

type BuyResult = {
  __kind__: "success";
  success: {
    buyer: Principal;
    seller: Principal;
    price: bigint;
  };
} | {
  __kind__: "listingNotFound";
  listingNotFound: null;
} | {
  __kind__: "listingNotActive";
  listingNotActive: null;
} | {
  __kind__: "insufficientFunds";
  insufficientFunds: {
    required: bigint;
    available: bigint;
  };
} | {
  __kind__: "transferFailed";
  transferFailed: string;
} | {
  __kind__: "cannotBuyOwnListing";
  cannotBuyOwnListing: null;
};

// Land Data Query
export function useGetLandData() {
  const { actor, isFetching } = useActor();

  return useQuery<LandData[]>({
    queryKey: ['landData'],
    queryFn: async () => {
      if (!actor) return [];
      console.log('Fetching land data...');
      const result = await actor.getLandData();
      console.log('Land data fetched:', result);
      return result;
    },
    enabled: !!actor && !isFetching,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

// User Profile Query
export function useGetCallerUserProfile() {
  const { actor, isFetching: actorFetching } = useActor();

  const query = useQuery<UserProfile | null>({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getCallerUserProfile();
    },
    enabled: !!actor && !actorFetching,
    retry: false,
  });

  return {
    ...query,
    isLoading: actorFetching || query.isLoading,
    isFetched: !!actor && query.isFetched,
  };
}

// Save User Profile Mutation
export function useSaveCallerUserProfile() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: UserProfile) => {
      if (!actor) throw new Error('Actor not available');
      console.log('Saving user profile:', profile);
      await actor.saveCallerUserProfile(profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
      toast.success('Профиль сохранен');
    },
    onError: (error: any) => {
      console.error('Profile save error:', error);
      toast.error('Ошибка сохранения профиля: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Token Balance Query with Enhanced Retry
export function useGetTokenBalance() {
  const { actor: tokenActor, isFetching } = useTokenActor();
  const { identity } = useInternetIdentity();

  return useQuery({
    queryKey: ['tokenBalance', identity?.getPrincipal().toString()],
    queryFn: async () => {
      if (!tokenActor || !identity) {
        console.log('Token balance query skipped - actor or identity not available');
        return BigInt(0);
      }

      const principal = identity.getPrincipal();
      console.log('Getting CBR balance for Principal:', principal.toString());

      try {
        const balance = await tokenActor.icrc1_balance_of({
          owner: principal,
          subaccount: [],
        });
        console.log('CBR balance response:', balance, 'Formatted:', formatTokenBalance(balance));
        return balance;
      } catch (error: any) {
        console.error('CBR balance fetch error:', error);
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
        throw new Error('Token actor or identity not available');
      }

      const principal = identity.getPrincipal();
      console.log('🔍 Debug: Fetching CBR balance for Principal:', principal.toString());

      const balance = await tokenActor.icrc1_balance_of({
        owner: principal,
        subaccount: [],
      });

      console.log('🔍 Debug: Raw balance response:', balance);
      console.log('🔍 Debug: Formatted balance:', formatTokenBalance(balance));

      return balance;
    },
    onSuccess: (balance) => {
      toast.success(`Баланс обновлен: ${formatTokenBalance(balance)} CBR`);
    },
    onError: (error: any) => {
      console.error('🔍 Debug: Balance fetch failed:', error);
      toast.error('Ошибка получения баланса: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Canister Token Balance Query (Admin Only)
export function useGetCanisterTokenBalance() {
  const { actor: tokenActor } = useTokenActor();

  return useQuery({
    queryKey: ['canisterTokenBalance'],
    queryFn: async () => {
      if (!tokenActor) {
        console.log('Canister balance query skipped - token actor not available');
        return BigInt(0);
      }

      console.log('Getting canister token balance...');

      try {
        const balance = await tokenActor.getCanisterTokenBalance();
        console.log('Canister token balance response:', balance, 'Formatted:', formatTokenBalance(balance));
        return balance;
      } catch (error: any) {
        console.error('Canister balance fetch error:', error);
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
        throw new Error('Token actor not available');
      }

      console.log('🔍 Debug: Fetching canister token balance...');

      const balance = await tokenActor.getCanisterTokenBalance();

      console.log('🔍 Debug: Raw canister balance response:', balance);
      console.log('🔍 Debug: Formatted canister balance:', formatTokenBalance(balance));

      return balance;
    },
    onSuccess: (balance) => {
      toast.success(`Баланс контракта: ${formatTokenBalance(balance)} CBR`);
    },
    onError: (error: any) => {
      console.error('🔍 Debug: Canister balance fetch failed:', error);
      toast.error('Ошибка получения баланса контракта: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Claim Rewards Mutation
export function useClaimRewards() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (landId: bigint) => {
      if (!actor) throw new Error('Actor not available');
      console.log('Claiming rewards for land:', landId);
      const result = await actor.claimRewards(landId);
      console.log('Claim result:', result);
      return result;
    },
    onSuccess: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      queryClient.invalidateQueries({ queryKey: ['landData'] });
      queryClient.invalidateQueries({ queryKey: ['tokenBalance'] });
      toast.success('Награды получены!');
    },
    onError: (error: any) => {
      console.error('Claim rewards error:', error);
      toast.error('Ошибка получения наград: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Upgrade Plot Mutation
export function useUpgradePlot() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ landId, cost }: { landId: bigint; cost: bigint }) => {
      if (!actor) throw new Error('Actor not available');
      console.log('Upgrading plot:', landId, 'Cost:', cost);
      const result = await actor.upgradePlot(landId, cost);
      console.log('Upgrade result:', result);
      return result;
    },
    onSuccess: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      queryClient.invalidateQueries({ queryKey: ['landData'] });
      queryClient.invalidateQueries({ queryKey: ['tokenBalance'] });
      toast.success('Участок улучшен!');
    },
    onError: (error: any) => {
      console.error('Upgrade plot error:', error);
      toast.error('Ошибка улучшения: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Update Plot Name Mutation
export function useUpdatePlotName() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ landId, name }: { landId: bigint; name: string }) => {
      if (!actor) throw new Error('Actor not available');
      await actor.updatePlotName(landId, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landData'] });
      toast.success('Название обновлено');
    },
    onError: (error: any) => {
      console.error('Update plot name error:', error);
      toast.error('Ошибка обновления названия: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Update Decoration Mutation
export function useUpdateDecoration() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ landId, url }: { landId: bigint; url: string }) => {
      if (!actor) throw new Error('Actor not available');
      await actor.updateDecoration(landId, url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landData'] });
      toast.success('Декорация обновлена');
    },
    onError: (error: any) => {
      console.error('Update decoration error:', error);
      toast.error('Ошибка обновления декорации: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Get Modifier Inventory Query
export function useGetModifierInventory() {
  const { actor, isFetching } = useActor();

  return useQuery<ModifierInstance[]>({
    queryKey: ['modifierInventory'],
    queryFn: async () => {
      if (!actor) return [];
      console.log('Fetching modifier inventory...');
      
      // Note: Backend needs to expose getMyModifierInventory() or similar
      // For now, we'll return empty array as placeholder
      // TODO: Update when backend method is available
      console.warn('getMyModifierInventory not yet implemented in backend');
      return [];
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
    mutationFn: async ({ modifierInstanceId, landId }: { modifierInstanceId: bigint; landId: bigint }) => {
      if (!actor) throw new Error('Actor not available');
      console.log('Applying modifier:', modifierInstanceId, 'to land:', landId);
      await actor.applyModifier(modifierInstanceId, landId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landData'] });
      queryClient.invalidateQueries({ queryKey: ['modifierInventory'] });
      toast.success('Модификатор применен!');
    },
    onError: (error: any) => {
      console.error('Apply modifier error:', error);
      toast.error('Ошибка применения модификатора: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Mint Land Mutation
export function useMintLand() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error('Actor not available');
      console.log('Minting new land...');
      const result = await actor.mintLand();
      console.log('Mint result:', result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landData'] });
      toast.success('Новая земля создана!');
    },
    onError: (error: any) => {
      console.error('Mint land error:', error);
      toast.error('Ошибка создания земли: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Get Top Lands Query
export function useGetTopLands() {
  const { actor, isFetching } = useActor();

  return useQuery<TopLandEntry[]>({
    queryKey: ['topLands'],
    queryFn: async () => {
      if (!actor) return [];
      console.log('Fetching top lands...');
      const result = await actor.getTopLands(BigInt(10));
      console.log('Top lands fetched:', result);
      return result;
    },
    enabled: !!actor && !isFetching,
    retry: 2,
  });
}

// Get My Modifications Query
export function useGetMyModifications() {
  const { actor, isFetching } = useActor();

  return useQuery({
    queryKey: ['myModifications'],
    queryFn: async () => {
      if (!actor) return [];
      console.log('Fetching my modifications...');
      const result = await actor.getMyModifications();
      console.log('My modifications fetched:', result);
      return result;
    },
    enabled: !!actor && !isFetching,
    retry: 2,
  });
}

// Governance Hooks (placeholder implementations - need backend integration)
export function useGetStakedBalance() {
  return useQuery({
    queryKey: ['stakedBalance'],
    queryFn: async () => BigInt(0),
    enabled: false, // Disabled until governance backend is integrated
  });
}

export function useStakeTokens() {
  const queryClient = useQueryClient();

  return useMutation<StakeResult, Error, bigint>({
    mutationFn: async (amount: bigint) => {
      console.log('Staking tokens:', amount);
      // TODO: Implement governance staking
      throw new Error('Governance staking not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stakedBalance'] });
      toast.success('Токены застейканы!');
    },
    onError: (error: any) => {
      console.error('Stake tokens error:', error);
      toast.error('Ошибка стейкинга: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

export function useGetAllActiveProposals() {
  return useQuery<Proposal[]>({
    queryKey: ['activeProposals'],
    queryFn: async () => {
      console.log('Fetching active proposals...');
      // TODO: Implement governance proposals
      return [];
    },
    enabled: false, // Disabled until governance backend is integrated
  });
}

export function useCreateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, description }: { title: string; description: string }) => {
      console.log('Creating proposal:', title, description);
      // TODO: Implement governance proposal creation
      throw new Error('Governance proposal creation not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeProposals'] });
      toast.success('Предложение создано!');
    },
    onError: (error: any) => {
      console.error('Create proposal error:', error);
      toast.error('Ошибка создания предложения: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

export function useVote() {
  const queryClient = useQueryClient();

  return useMutation<VoteResult, Error, { proposalId: bigint; choice: boolean }>({
    mutationFn: async ({ proposalId, choice }: { proposalId: bigint; choice: boolean }) => {
      console.log('Voting on proposal:', proposalId, choice);
      // TODO: Implement governance voting
      throw new Error('Governance voting not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeProposals'] });
      toast.success('Голос учтен!');
    },
    onError: (error: any) => {
      console.error('Vote error:', error);
      toast.error('Ошибка голосования: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Marketplace Hooks (placeholder implementations - need backend integration)
export function useGetAllActiveListings() {
  return useQuery<Listing[]>({
    queryKey: ['activeListings'],
    queryFn: async () => {
      console.log('Fetching active listings...');
      // TODO: Implement marketplace listings
      return [];
    },
    enabled: false, // Disabled until marketplace backend is integrated
  });
}

export function useListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, itemType, price }: { itemId: bigint; itemType: ItemType; price: bigint }) => {
      console.log('Listing item:', itemId, itemType, price);
      // TODO: Implement marketplace listing
      throw new Error('Marketplace listing not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeListings'] });
      toast.success('Предмет выставлен на продажу!');
    },
    onError: (error: any) => {
      console.error('List item error:', error);
      toast.error('Ошибка выставления: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

export function useBuyItem() {
  const queryClient = useQueryClient();

  return useMutation<BuyResult, Error, bigint>({
    mutationFn: async (listingId: bigint) => {
      console.log('Buying item:', listingId);
      // TODO: Implement marketplace buying
      throw new Error('Marketplace buying not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeListings'] });
      queryClient.invalidateQueries({ queryKey: ['landData'] });
      queryClient.invalidateQueries({ queryKey: ['tokenBalance'] });
      toast.success('Предмет куплен!');
    },
    onError: (error: any) => {
      console.error('Buy item error:', error);
      toast.error('Ошибка покупки: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

export function useCancelListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listingId: bigint) => {
      console.log('Cancelling listing:', listingId);
      // TODO: Implement marketplace cancel listing
      throw new Error('Marketplace cancel listing not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeListings'] });
      toast.success('Объявление отменено!');
    },
    onError: (error: any) => {
      console.error('Cancel listing error:', error);
      toast.error('Ошибка отмены: ' + (error.message || 'Неизвестная ошибка'));
    },
  });
}

// Export ItemType for use in components
export { ItemType };
