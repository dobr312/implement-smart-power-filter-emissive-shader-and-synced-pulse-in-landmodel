import React, { useRef, useEffect, useState } from 'react';
import { useActor } from '../hooks/useActor';
import { useQuery } from '@tanstack/react-query';
import type { LandData } from '@/backend';
import { useInternetIdentity } from '../hooks/useInternetIdentity';

interface MapViewProps {
  landData: LandData;
  onClose: () => void;
}

declare global {
  interface Window {
    maptalks?: any;
  }
}

const MapView: React.FC<MapViewProps> = ({ landData, onClose }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [maptalksSdkLoaded, setMaptalksSdkLoaded] = useState(false);
  const { actor } = useActor();
  const { identity } = useInternetIdentity();

  // Fetch all lands for the map
  const { data: lands } = useQuery<LandData[]>({
    queryKey: ['landData'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.getLandData();
    },
    enabled: !!actor,
  });

  // Load Maptalks.js via CDN
  useEffect(() => {
    if (window.maptalks) {
      setMaptalksSdkLoaded(true);
      return;
    }

    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://cdn.jsdelivr.net/npm/maptalks@1.0.0-rc.28/dist/maptalks.css';
    document.head.appendChild(cssLink);

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/maptalks@1.0.0-rc.28/dist/maptalks.min.js';
    script.async = false;
    script.onload = () => {
      setTimeout(() => {
        if (window.maptalks) setMaptalksSdkLoaded(true);
      }, 100);
    };
    script.onerror = () => console.error('Failed to load Maptalks.js');
    document.head.appendChild(script);
  }, []);

  // Biome → neon color
  const getBiomeColor = (biome: string): string => {
    switch (biome) {
      case 'MYTHIC_VOID':        return '#9933FF';
      case 'MYTHIC_AETHER':      return '#00FFFF';
      case 'ISLAND_ARCHIPELAGO': return '#00aaff';
      case 'FOREST_VALLEY':      return '#00ff41';
      case 'SNOW_PEAK':          return '#ffffff';
      case 'DESERT_DUNE':        return '#FF8800';
      case 'VOLCANIC_CRAG':      return '#ff3300';
      default:                   return '#ffffff';
    }
  };

  // Main map initialization — re-runs only when SDK loads or lands data arrives
  useEffect(() => {
    if (!maptalksSdkLoaded || !window.maptalks || !mapContainerRef.current || !lands) {
      return;
    }

    const container = mapContainerRef.current;

    // Initialize map — pass the DOM element directly
    const map = new window.maptalks.Map(container, {
      center: [1028, -1028],
      zoom: 2,
      spatialReference: {
        projection: 'identity',
        resolutions: [32, 16, 8, 4, 2, 1, 0.5],
        fullExtent: { top: 5000, left: -5000, bottom: -5000, right: 5000 },
      },
      dragPitch: false,
      dragRotate: false,
      pitchWithRotate: false,
      dragRotatePitch: false,
      touchZoomRotate: false,
      doubleClickZoom: false,
      attribution: false,
      baseLayer: new window.maptalks.ImageLayer('base', [
        {
          url: 'https://raw.githubusercontent.com/dobr312/cyberland/main/CyberMap/IMG_0133.webp',
          extent: [0, -2056, 2056, 0],
        },
      ]),
    });

    // Cover effect + setMaxExtent + UIMarkers + 600ms animateTo
    map.on('load', () => {
      const extent = new window.maptalks.Extent(0, -2056, 2056, 0);
      map.setMaxExtent(extent);

      // Math.max for Cover effect — fills the viewport without letterboxing
      const scale = Math.max(container.clientWidth / 2056, container.clientHeight / 2056);
      const minZoom = Math.log2(32 / (2056 / (2056 * scale)));
      map.setMinZoom(minZoom);
      map.setZoom(minZoom);
      map.fitExtent(extent, 0);

      // Neon beam UIMarkers — 100% engine-rendered, zero React JSX
      const currentUserPrincipal = identity?.getPrincipal().toString();

      lands.forEach((land) => {
        const isOwner = land.principal.toString() === currentUserPrincipal;
        const biomeColor = getBiomeColor(land.biome);

        const x = 1028 + (land.coordinates.lon / 180) * 1028;
        const y = 1028 + (land.coordinates.lat / 90) * 1028;

        const beamWidth  = isOwner ? 3 : 1;
        const beamHeight = isOwner ? 180 : 120;
        const opacity    = isOwner ? 1.0 : 0.35;
        const glowSpread = isOwner ? 12 : 6;

        const htmlString = `
          <div style="
            width: ${beamWidth}px;
            height: ${beamHeight}px;
            background: linear-gradient(to top, ${biomeColor}ff, ${biomeColor}88, transparent);
            opacity: ${opacity};
            box-shadow: 0 0 ${glowSpread}px ${biomeColor}, 0 0 ${glowSpread * 2}px ${biomeColor};
            pointer-events: none;
            border-radius: 1px;
          "></div>
        `;

        new window.maptalks.ui.UIMarker(
          [Math.floor(x), Math.floor(-y)],
          {
            content: htmlString,
            verticalAlignment: 'middle',
            horizontalAlignment: 'middle',
            eventsPropagation: false,
          }
        ).addTo(map);
      });

      // 600ms delayed drone animation to target land
      const lon = landData.coordinates.lon;
      const lat = landData.coordinates.lat;
      const targetX = Math.floor(1028 + (lon / 180 * 1028));
      const targetY = Math.floor(-(1028 + (lat / 90 * 1028)));

      setTimeout(() => {
        map.animateTo(
          {
            center: [targetX, targetY],
            zoom: minZoom + 1.5,
          },
          {
            duration: 3500,
            easing: 'out',
          }
        );
      }, 600);
    });

    // Cleanup on unmount
    return () => {
      if (map) map.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptalksSdkLoaded, lands]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 9999,
      background: '#000',
      overflow: 'hidden',
      display: 'block',
    }}>
      {/* Loading overlay — shown until SDK and data are ready */}
      {(!maptalksSdkLoaded || !lands) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10002,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
        }}>
          <div style={{
            color: '#00ffff',
            fontSize: '20px',
            fontWeight: 'bold',
            letterSpacing: '0.1em',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            {!maptalksSdkLoaded ? 'Загрузка библиотеки Maptalks...' : 'Загрузка данных земель...'}
          </div>
        </div>
      )}

      {/* Map Container — MUST have 100% of the fixed parent; touchAction: auto for mobile */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          touchAction: 'auto',
        }}
      />

      {/* Close Button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 'env(safe-area-inset-top, 20px)',
          right: '20px',
          zIndex: 10001,
          padding: '12px 24px',
          background: 'rgba(0,0,0,0.7)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '12px',
          backdropFilter: 'blur(10px)',
          fontSize: '18px',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
};

export default MapView;
