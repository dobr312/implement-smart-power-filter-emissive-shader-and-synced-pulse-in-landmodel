import { AlertTriangle, RefreshCw } from "lucide-react";
import React, { useEffect, useState } from "react";
import CosmicBackground from "./components/CosmicBackground";
import ParticleBackground from "./components/ParticleBackground";
import { useActorWithInit } from "./hooks/useActorWithInit";
import { useInternetIdentity } from "./hooks/useInternetIdentity";
import Dashboard from "./pages/Dashboard";
import LandingPage from "./pages/LandingPage";

function CyberLoader() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        fontFamily: "'Orbitron', sans-serif",
        overflow: "hidden",
        zIndex: 9999,
      }}
    >
      {/* Background image — object-fit: cover keeps center visible on all screen sizes */}
      <img
        src="/assets/uploads/loader-019d31bf-1fcc-75d9-b209-1900de26e975-1.webp"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        .loading-top {
          font-size: clamp(1.4rem, 4vw, 2.4rem);
          font-weight: 900;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: transparent;
          -webkit-text-stroke: 1px #000;
          background: linear-gradient(-60deg,
            transparent 35%,
            #00E6E6 42%,
            #7C3AED 58%,
            #00FF7F 74%,
            transparent 82%
          ) 0/500% 100% text;
          -webkit-background-clip: text;
          background-clip: text;
          display: block;
          margin-bottom: 0.1em;
          mix-blend-mode: screen;
          animation: text-slide-cy 15s linear infinite, void-breath-cy 7s ease-in-out infinite alternate;
        }
        .metaverse-bottom {
          font-size: clamp(1.2rem, 3.5vw, 2rem);
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: transparent;
          -webkit-text-stroke: 0.9px #000;
          background: linear-gradient(-60deg,
            transparent 35%,
            #00E6E6 42%,
            #7C3AED 58%,
            #00FF7F 74%,
            transparent 82%
          ) 0/500% 100% text;
          -webkit-background-clip: text;
          background-clip: text;
          display: block;
          white-space: nowrap;
          opacity: 0.92;
          mix-blend-mode: screen;
          animation: text-slide-cy 15s linear infinite, void-breath-cy 7s ease-in-out infinite alternate;
        }
        @keyframes text-slide-cy {
          to { background-position: 500% }
        }
        @keyframes void-breath-cy {
          from { text-shadow: inset 0 0 30px #000, 0 0 8px rgba(0,230,230,0.15); }
          to   { text-shadow: inset 0 0 55px #000, 0 0 14px rgba(0,230,230,0.3); }
        }
        @media (max-width: 480px) {
          .loading-top      { font-size: clamp(1.2rem, 6vw, 1.9rem); letter-spacing: 3px; }
          .metaverse-bottom { font-size: clamp(1rem, 5vw, 1.6rem);   letter-spacing: 2px; }
        }
      `}</style>
      {/* Spinner text — fixed at bottom so it doesn't cover the logo */}
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <span className="loading-top">LOADING</span>
        <span className="metaverse-bottom">CYBERLAND METAVERSE</span>
      </div>
    </div>
  );
}

export default function App() {
  const { identity, isInitializing: identityInitializing } =
    useInternetIdentity();
  const { isInitializing: actorInitializing, error: actorError } =
    useActorWithInit();

  const isAuthenticated = !!identity;

  if (identityInitializing || (isAuthenticated && actorInitializing)) {
    return <CyberLoader />;
  }

  if (isAuthenticated && actorError) {
    return (
      <>
        <CosmicBackground />
        <ParticleBackground />
        <div className="min-h-screen flex items-center justify-center relative z-10 p-4">
          <div className="max-w-3xl mx-auto p-8 glassmorphism rounded-lg neon-border box-glow-gold">
            <div className="flex items-start space-x-4">
              <AlertTriangle className="w-12 h-12 text-red-500 flex-shrink-0 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-red-500 mb-4 tracking-wider font-orbitron">
                  CONNECTION ERROR
                </h2>
                <p className="text-red-300 mb-4 leading-relaxed font-jetbrains">
                  Failed to establish stable connection to Internet Computer
                  network.
                </p>
                <div className="glassmorphism border border-red-500/30 rounded p-4 mb-4">
                  <p className="text-red-300 text-xs font-mono break-all font-jetbrains">
                    <strong>Error:</strong> {String(actorError)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="w-full px-6 py-3 btn-gradient-cyan text-black font-bold rounded-lg font-orbitron flex items-center justify-center space-x-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Retry Connection</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <>
      <CosmicBackground />
      <ParticleBackground />
      <Dashboard />
    </>
  );
}
