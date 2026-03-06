import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGetTopLands } from '../hooks/useQueries';
import { formatTokenBalance } from '@/lib/tokenUtils';
import { Trophy, Loader2 } from 'lucide-react';

export default function Leaderboard() {
  const { data: topLands, isLoading, error } = useGetTopLands();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00ff41]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Ошибка загрузки рейтинга</p>
      </div>
    );
  }

  return (
    <Card className="bg-black/40 backdrop-blur-md border-[#00ff41]/30 shadow-[0_0_15px_rgba(0,255,65,0.3)]">
      <CardHeader>
        <CardTitle className="text-[#00ff41] flex items-center gap-2">
          <Trophy className="w-6 h-6" />
          ТОП-10 ЗЕМЕЛЬ
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!topLands || topLands.length === 0 ? (
          <p className="text-white/50 text-center py-8">Нет данных для отображения</p>
        ) : (
          <div className="space-y-3">
            {topLands.map((entry, index) => (
              <div
                key={entry.principal.toString()}
                className={`bg-white/5 rounded-lg p-4 border ${
                  index === 0
                    ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.3)]'
                    : index === 1
                      ? 'border-gray-400/50 shadow-[0_0_10px_rgba(156,163,175,0.2)]'
                      : index === 2
                        ? 'border-orange-600/50 shadow-[0_0_10px_rgba(234,88,12,0.2)]'
                        : 'border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`text-2xl font-bold ${
                        index === 0
                          ? 'text-yellow-500'
                          : index === 1
                            ? 'text-gray-400'
                            : index === 2
                              ? 'text-orange-600'
                              : 'text-white/50'
                      }`}
                    >
                      #{index + 1}
                    </div>
                    <div>
                      <p className="text-white font-medium">{entry.plotName}</p>
                      <p className="text-white/50 text-sm">
                        Уровень {entry.upgradeLevel.toString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[#00ff41] font-bold">
                      {formatTokenBalance(entry.tokenBalance)} CBR
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
