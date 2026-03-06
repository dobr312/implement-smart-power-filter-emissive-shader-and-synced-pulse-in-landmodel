import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGetLandData, useUpdatePlotName, useUpdateDecoration } from '@/hooks/useQueries';
import { Loader2, Edit } from 'lucide-react';

interface PlotCustomizationProps {
  selectedLandIndex: number;
}

export default function PlotCustomization({ selectedLandIndex }: PlotCustomizationProps) {
  const { data: lands } = useGetLandData();
  const updateNameMutation = useUpdatePlotName();
  const updateDecorationMutation = useUpdateDecoration();

  const selectedLand = lands && lands[selectedLandIndex];

  const [plotName, setPlotName] = useState('');
  const [decorationUrl, setDecorationUrl] = useState('');

  React.useEffect(() => {
    if (selectedLand) {
      setPlotName(selectedLand.plotName);
      setDecorationUrl(selectedLand.decorationURL || '');
    }
  }, [selectedLand]);

  const handleUpdateName = async () => {
    if (!selectedLand || !plotName.trim()) return;

    if (plotName.length > 20) {
      return;
    }

    await updateNameMutation.mutateAsync({
      landId: selectedLand.landId,
      name: plotName,
    });
  };

  const handleUpdateDecoration = async () => {
    if (!selectedLand) return;

    await updateDecorationMutation.mutateAsync({
      landId: selectedLand.landId,
      url: decorationUrl,
    });
  };

  if (!selectedLand) {
    return null;
  }

  return (
    <Card className="bg-black/40 backdrop-blur-md border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
      <CardHeader>
        <CardTitle className="text-purple-400 flex items-center gap-2">
          <Edit className="w-5 h-5" />
          НАСТРОЙКА УЧАСТКА
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="plotName" className="text-white/70">
            Название участка (макс. 20 символов)
          </Label>
          <Input
            id="plotName"
            value={plotName}
            onChange={(e) => setPlotName(e.target.value)}
            maxLength={20}
            className="bg-white/5 border-white/10 text-white"
            placeholder="Введите название..."
          />
          <Button
            onClick={handleUpdateName}
            disabled={updateNameMutation.isPending || !plotName.trim() || plotName.length > 20}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {updateNameMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Обновление...
              </>
            ) : (
              'ОБНОВИТЬ НАЗВАНИЕ'
            )}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="decorationUrl" className="text-white/70">
            URL декорации
          </Label>
          <Input
            id="decorationUrl"
            value={decorationUrl}
            onChange={(e) => setDecorationUrl(e.target.value)}
            className="bg-white/5 border-white/10 text-white"
            placeholder="https://..."
          />
          <Button
            onClick={handleUpdateDecoration}
            disabled={updateDecorationMutation.isPending}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {updateDecorationMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Обновление...
              </>
            ) : (
              'ОБНОВИТЬ ДЕКОРАЦИЮ'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
