import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import type { LandData } from '@/backend';

interface LandSelectorProps {
  lands: LandData[];
  selectedIndex: number;
  onSelectLand: (index: number) => void;
}

export default function LandSelector({ lands, selectedIndex, onSelectLand }: LandSelectorProps) {
  const currentLand = lands[selectedIndex];

  const handlePrevious = () => {
    if (selectedIndex > 0) {
      onSelectLand(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex < lands.length - 1) {
      onSelectLand(selectedIndex + 1);
    }
  };

  const biomeNames: Record<string, string> = {
    FOREST_VALLEY: 'Лесная Долина',
    ISLAND_ARCHIPELAGO: 'Островной Архипелаг',
    SNOW_PEAK: 'Снежная Вершина',
    DESERT_DUNE: 'Пустынная Дюна',
    VOLCANIC_CRAG: 'Вулканический Утес',
    MYTHIC_VOID: 'Мифическая Пустота',
    MYTHIC_AETHER: 'Мифический Эфир',
  };

  return (
    <Card className="bg-black/40 backdrop-blur-md border-[#00d4ff]/30 shadow-[0_0_15px_rgba(0,212,255,0.3)]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <Button
            onClick={handlePrevious}
            disabled={selectedIndex === 0}
            variant="outline"
            size="icon"
            className="border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <div className="flex-1 mx-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-[#00d4ff]" />
              <h3 className="text-xl font-bold text-white">{currentLand.plotName}</h3>
            </div>
            <p className="text-white/70 text-sm">
              {biomeNames[currentLand.biome] || currentLand.biome}
            </p>
            <p className="text-white/50 text-xs mt-1">
              Земля {selectedIndex + 1} из {lands.length}
            </p>
          </div>

          <Button
            onClick={handleNext}
            disabled={selectedIndex === lands.length - 1}
            variant="outline"
            size="icon"
            className="border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
