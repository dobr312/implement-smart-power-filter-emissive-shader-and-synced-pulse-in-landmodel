import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGetLandData, useGetTokenBalance, useDebugTokenBalance } from '@/hooks/useQueries';
import { useActor } from '@/hooks/useActor';
import { formatTokenBalance } from '@/lib/tokenUtils';
import { Loader2, Package, Clock, Zap, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { LootCache, DiscoverCacheResult, ModifierInstance } from '@/backend';

export default function Discovery() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  const { data: lands, isLoading: landsLoading } = useGetLandData();
  const { data: tokenBalance, isLoading: balanceLoading, error: balanceError } = useGetTokenBalance();
  const debugBalanceMutation = useDebugTokenBalance();

  const [caches, setCaches] = useState<LootCache[]>([]);
  const [cachesLoading, setCachesLoading] = useState(false);
  const [discoveringTier, setDiscoveringTier] = useState<number | null>(null);
  const [processingCacheId, setProcessingCacheId] = useState<bigint | null>(null);

  const selectedLand = lands && lands[0];

  React.useEffect(() => {
    if (actor) {
      loadCaches();
    }
  }, [actor]);

  const loadCaches = async () => {
    if (!actor) return;
    setCachesLoading(true);
    try {
      const result = await actor.getMyLootCaches();
      setCaches(result);
    } catch (error) {
      console.error('Error loading caches:', error);
    } finally {
      setCachesLoading(false);
    }
  };

  const handleDiscoverCache = async (tier: number) => {
    if (!actor || !selectedLand) {
      toast.error('Актор или земля недоступны');
      return;
    }

    const tierCosts = {
      1: { cbr: BigInt(10000000000), charge: 200 },
      2: { cbr: BigInt(25000000000), charge: 500 },
      3: { cbr: BigInt(50000000000), charge: 1000 },
    };

    const cost = tierCosts[tier as keyof typeof tierCosts];

    if (!tokenBalance || tokenBalance < cost.cbr) {
      toast.error(`Недостаточно CBR. Требуется: ${formatTokenBalance(cost.cbr)} CBR`);
      return;
    }

    if (selectedLand.cycleCharge < cost.charge) {
      toast.error(`Недостаточно заряда. Требуется: ${cost.charge}, доступно: ${selectedLand.cycleCharge}`);
      return;
    }

    setDiscoveringTier(tier);

    try {
      console.log('Discovering cache tier:', tier);
      const result: DiscoverCacheResult = await actor.discoverLootCache(BigInt(tier));
      console.log('Discovery result:', result);

      if (result.__kind__ === 'success') {
        toast.success(`Кэш уровня ${tier} обнаружен!`);
        await loadCaches();
        await new Promise((resolve) => setTimeout(resolve, 500));
        queryClient.invalidateQueries({ queryKey: ['landData'] });
        queryClient.invalidateQueries({ queryKey: ['tokenBalance'] });
      } else if (result.__kind__ === 'insufficientCharge') {
        toast.error(`Недостаточно заряда. Требуется: ${result.insufficientCharge.required}, доступно: ${result.insufficientCharge.current}`);
      } else if (result.__kind__ === 'insufficientTokens') {
        toast.error(`Недостаточно токенов. Требуется: ${formatTokenBalance(result.insufficientTokens.required)} CBR`);
      } else if (result.__kind__ === 'paymentFailed') {
        toast.error(`Ошибка оплаты: ${result.paymentFailed}`);
      }
    } catch (error: any) {
      console.error('Discovery error:', error);
      toast.error('Ошибка обнаружения кэша: ' + (error.message || 'Неизвестная ошибка'));
    } finally {
      setDiscoveringTier(null);
    }
  };

  const handleProcessCache = async (cacheId: bigint) => {
    if (!actor) {
      toast.error('Актор недоступен');
      return;
    }

    setProcessingCacheId(cacheId);

    try {
      console.log('Processing cache:', cacheId);
      const result: ModifierInstance = await actor.processCache(cacheId);
      console.log('Process result:', result);

      toast.success(`Получен модификатор: ${result.modifierType} (Уровень ${result.rarity_tier})`);
      await loadCaches();
      queryClient.invalidateQueries({ queryKey: ['modifierInventory'] });
    } catch (error: any) {
      console.error('Process cache error:', error);
      toast.error('Ошибка обработки кэша: ' + (error.message || 'Неизвестная ошибка'));
    } finally {
      setProcessingCacheId(null);
    }
  };

  const handleDebugBalance = async () => {
    try {
      await debugBalanceMutation.mutateAsync();
    } catch (error) {
      console.error('Debug balance error:', error);
    }
  };

  const getTierColor = (tier: number) => {
    switch (tier) {
      case 1:
        return 'text-gray-400 border-gray-400/30';
      case 2:
        return 'text-blue-400 border-blue-400/30';
      case 3:
        return 'text-purple-400 border-purple-400/30';
      default:
        return 'text-white border-white/30';
    }
  };

  const getTierName = (tier: number) => {
    switch (tier) {
      case 1:
        return 'Обычный';
      case 2:
        return 'Редкий';
      case 3:
        return 'Легендарный';
      default:
        return 'Неизвестный';
    }
  };

  const canOpenCache = (cache: LootCache) => {
    const fourHours = 4 * 60 * 60 * 1000000000;
    const timeSinceDiscovery = Date.now() * 1000000 - Number(cache.discovered_at);
    return timeSinceDiscovery >= fourHours;
  };

  const getTimeRemaining = (cache: LootCache) => {
    const fourHours = 4 * 60 * 60 * 1000000000;
    const timeSinceDiscovery = Date.now() * 1000000 - Number(cache.discovered_at);
    const remaining = fourHours - timeSinceDiscovery;

    if (remaining <= 0) return 'Готов к открытию';

    const hours = Math.floor(remaining / (60 * 60 * 1000000000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000000000)) / (60 * 1000000000));

    return `${hours}ч ${minutes}м`;
  };

  if (landsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00ff41]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CBR Balance Card */}
      <Card className="bg-black/40 backdrop-blur-md border-[#00ff41]/30 shadow-[0_0_15px_rgba(0,255,65,0.3)]">
        <CardHeader>
          <CardTitle className="text-[#00ff41] flex items-center gap-2">
            <Zap className="w-5 h-5" />
            БАЛАНС CBR
          </CardTitle>
        </CardHeader>
        <CardContent>
          {balanceLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#00ff41]" />
              <span className="text-white/70">Загрузка баланса...</span>
            </div>
          ) : balanceError ? (
            <div className="space-y-2">
              <p className="text-red-400">Баланс недоступен</p>
              <Button
                onClick={handleDebugBalance}
                disabled={debugBalanceMutation.isPending}
                size="sm"
                variant="outline"
                className="border-[#00ff41]/30 text-[#00ff41] hover:bg-[#00ff41]/10"
              >
                {debugBalanceMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Обновление...
                  </>
                ) : (
                  'Обновить баланс'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-3xl font-bold text-white">
                {formatTokenBalance(tokenBalance || BigInt(0))} CBR
              </p>
              <p className="text-sm text-white/50">
                Raw: {(tokenBalance || BigInt(0)).toString()} e8s
              </p>
              <Button
                onClick={handleDebugBalance}
                disabled={debugBalanceMutation.isPending}
                size="sm"
                variant="ghost"
                className="text-[#00d4ff] hover:text-[#00d4ff] hover:bg-[#00d4ff]/10"
              >
                {debugBalanceMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Обновление...
                  </>
                ) : (
                  'Обновить баланс'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discovery Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((tier) => (
          <Card
            key={tier}
            className={`bg-black/40 backdrop-blur-md border ${getTierColor(tier)} shadow-[0_0_15px_rgba(0,255,65,0.2)]`}
          >
            <CardHeader>
              <CardTitle className={getTierColor(tier).split(' ')[0]}>
                {getTierName(tier)} Кэш
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-white/70 text-sm">
                  Стоимость: <span className="text-[#00ff41] font-bold">{tier === 1 ? '100' : tier === 2 ? '250' : '500'} CBR</span>
                </p>
                <p className="text-white/70 text-sm">
                  Заряд: <span className="text-[#00d4ff] font-bold">{tier === 1 ? '200' : tier === 2 ? '500' : '1000'}</span>
                </p>
                <p className="text-white/70 text-sm">
                  Шанс LandToken: <span className="text-purple-400 font-bold">{tier === 1 ? '0.05%' : tier === 2 ? '0.2%' : '0.5%'}</span>
                </p>
              </div>
              <Button
                onClick={() => handleDiscoverCache(tier)}
                disabled={discoveringTier !== null || !selectedLand}
                className={`w-full ${
                  tier === 1
                    ? 'bg-gray-600 hover:bg-gray-700'
                    : tier === 2
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-purple-600 hover:bg-purple-700'
                } text-white font-bold`}
              >
                {discoveringTier === tier ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Обнаружение...
                  </>
                ) : (
                  'ОБНАРУЖИТЬ КЭШ'
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inventory */}
      <Card className="bg-black/40 backdrop-blur-md border-[#00d4ff]/30 shadow-[0_0_15px_rgba(0,212,255,0.3)]">
        <CardHeader>
          <CardTitle className="text-[#00d4ff] flex items-center gap-2">
            <Package className="w-5 h-5" />
            МОИ КЭШИ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cachesLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#00d4ff]" />
              <span className="text-white/70">Загрузка кэшей...</span>
            </div>
          ) : caches.length === 0 ? (
            <p className="text-white/50 text-center py-4">Нет обнаруженных кэшей</p>
          ) : (
            <div className="space-y-3">
              {caches.map((cache) => (
                <div
                  key={cache.cache_id.toString()}
                  className={`bg-white/5 rounded-lg p-4 border ${getTierColor(Number(cache.tier))}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white font-medium">
                        {getTierName(Number(cache.tier))} Кэш #{cache.cache_id.toString()}
                      </p>
                      <p className="text-white/50 text-sm flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {cache.is_opened ? 'Открыт' : getTimeRemaining(cache)}
                      </p>
                    </div>
                    <div>
                      {cache.is_opened ? (
                        <span className="text-green-400 text-sm">✓ Открыт</span>
                      ) : (
                        <Button
                          onClick={() => handleProcessCache(cache.cache_id)}
                          disabled={!canOpenCache(cache) || processingCacheId !== null}
                          size="sm"
                          className="bg-[#00ff41] hover:bg-[#00ff41]/80 text-black font-bold"
                        >
                          {processingCacheId === cache.cache_id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Открытие...
                            </>
                          ) : (
                            <>
                              <Gift className="w-4 h-4 mr-2" />
                              ОТКРЫТЬ
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
