import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActor } from '../hooks/useActor';
import LandDashboard from '../components/LandDashboard';
import Discovery from '../components/Discovery';
import Collection from './Collection';
import Leaderboard from '../components/Leaderboard';
import Marketplace from '../components/Marketplace';
import Governance from '../components/Governance';
import MapView from '../components/MapView';
import CubeVisualization from '../components/CubeVisualization';
import LandSelector from '../components/LandSelector';
import { Compass, Trophy, ShoppingCart, Vote, Map, BookOpen } from 'lucide-react';
import type { LandData } from '../backend';

type TabType = 'land' | 'discovery' | 'collection' | 'leaderboard' | 'marketplace' | 'governance' | 'map';

export default function Dashboard() {
  const { actor } = useActor();
  const [activeTab, setActiveTab] = useState<TabType>('land');
  const [selectedLandIndex, setSelectedLandIndex] = useState(0);

  const { data: lands, isLoading } = useQuery<LandData[]>({
    queryKey: ['landData'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.getLandData();
    },
    enabled: !!actor,
  });

  useEffect(() => {
    if (lands && lands.length > 0 && selectedLandIndex >= lands.length) {
      setSelectedLandIndex(0);
    }
  }, [lands, selectedLandIndex]);

  useEffect(() => {
    if (lands && lands.length > 0) {
      const currentLand = lands[selectedLandIndex];
      console.log('[Dashboard] 🌍 Current Land Data:', {
        index: selectedLandIndex,
        biome: currentLand.biome,
        landId: currentLand.landId,
        coordinates: currentLand.coordinates,
      });
    }
  }, [lands, selectedLandIndex]);

  if (isLoading) {
    return (
      <div className="dashboard-container flex flex-col min-h-screen bg-transparent">
        <div className="min-h-screen flex items-center justify-center relative z-10">
          <div className="glassmorphism p-8 rounded-lg neon-border box-glow-cyan animate-pulse-glow">
            <div className="text-[#00ffff] text-xl animate-pulse font-orbitron text-glow-cyan">
              Загрузка данных...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!lands || lands.length === 0) {
    return (
      <div className="dashboard-container flex flex-col min-h-screen bg-transparent">
        <div className="min-h-screen flex items-center justify-center relative z-10">
          <div className="glassmorphism p-8 rounded-lg neon-border box-glow-gold">
            <div className="text-red-400 text-xl font-orbitron">Земля не найдена</div>
          </div>
        </div>
      </div>
    );
  }

  const currentLand = lands[selectedLandIndex];

  const tabs = [
    { id: 'land' as TabType, icon: Compass, label: 'Земля' },
    { id: 'discovery' as TabType, icon: BookOpen, label: 'Открытия' },
    { id: 'collection' as TabType, icon: BookOpen, label: 'Коллекция' },
    { id: 'leaderboard' as TabType, icon: Trophy, label: 'Рейтинг' },
    { id: 'marketplace' as TabType, icon: ShoppingCart, label: 'Рынок' },
    { id: 'governance' as TabType, icon: Vote, label: 'Управление' },
    { id: 'map' as TabType, icon: Map, label: 'Карта' },
  ];

  const handleMapClose = () => {
    setActiveTab('land');
  };

  const isMapOpen = activeTab === 'map';

  return (
    <div className="dashboard-container flex flex-col min-h-screen bg-transparent">
      {isMapOpen && (
        <MapView landData={currentLand} onClose={handleMapClose} />
      )}

      <div className="dashboard min-h-screen text-white relative overflow-hidden">
        <div className="relative z-10 container mx-auto px-4 py-8">
          {lands.length > 1 && (
            <div className="mb-6">
              <LandSelector
                lands={lands}
                selectedIndex={selectedLandIndex}
                onSelectLand={setSelectedLandIndex}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div 
              className="lg:col-span-2 rounded-lg overflow-hidden glassmorphism neon-border box-glow-cyan animate-pulse-glow"
              style={{
                minHeight: '65vh',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <CubeVisualization biome={currentLand.biome} />
            </div>

            <div className="space-y-4">
              <nav className="grid grid-cols-2 gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                        transition-all duration-300 font-medium font-orbitron
                        ${
                          activeTab === tab.id
                            ? 'glassmorphism neon-border text-[#00ffff] box-glow-cyan text-glow-cyan'
                            : 'glassmorphism border border-[#9933ff]/30 text-[#9933ff] hover:border-[#00ffff]/50 hover:text-[#00ffff] hover:box-glow-cyan'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          <div className="rounded-lg glassmorphism neon-border box-glow-purple p-6">
            {activeTab === 'land' && <LandDashboard selectedLandIndex={selectedLandIndex} />}
            {activeTab === 'discovery' && <Discovery />}
            {activeTab === 'collection' && <Collection />}
            {activeTab === 'leaderboard' && <Leaderboard />}
            {activeTab === 'marketplace' && <Marketplace />}
            {activeTab === 'governance' && <Governance />}
          </div>
        </div>
      </div>
    </div>
  );
}
