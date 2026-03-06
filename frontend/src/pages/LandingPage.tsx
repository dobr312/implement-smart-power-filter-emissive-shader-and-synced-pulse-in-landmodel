import React, { useState } from 'react';
import { useInternetIdentity } from '../hooks/useInternetIdentity';
import CosmicBackground from '../components/CosmicBackground';
import ParticleBackground from '../components/ParticleBackground';
import { debugLog, debugError } from '../lib/debugConfig';

export default function LandingPage() {
  const { login, loginStatus } = useInternetIdentity();
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      debugLog('Initiating login process');
      setLoginError(null);
      await login();
    } catch (error: any) {
      debugError('Login error', error);
      console.error('Login failed:', error);
      if (error.message === 'User is already authenticated') {
        setLoginError('Вы уже вошли через Internet Identity');
      } else {
        setLoginError('Ошибка входа. Пожалуйста, попробуйте снова.');
      }
    }
  };

  const isLoggingIn = loginStatus === 'logging-in';

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <CosmicBackground />
      
      <div className="absolute inset-0 z-[1]">
        <ParticleBackground />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-6 glassmorphism p-8 rounded-lg neon-border box-glow-cyan animate-slide-down">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-cyan-400 to-purple-500 animate-pulse font-orbitron">
              ПОЛУЧИТЕ СВОЙ УЧАСТОК ГЕНЕЗИСА
            </h1>

            <p className="text-xl md:text-2xl text-cyan-300 max-w-2xl mx-auto font-jetbrains text-glow-cyan">
              Создайте уникальную виртуальную землю в киберпространстве
            </p>

            <div className="pt-4">
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={`
                  px-8 py-4 text-lg font-bold rounded-lg
                  btn-gradient-green
                  text-black shadow-[0_0_20px_rgba(0,255,65,0.5)]
                  transition-all duration-300 transform hover:scale-105
                  disabled:opacity-50 disabled:cursor-not-allowed
                  font-orbitron
                  ${isLoggingIn ? 'animate-pulse' : ''}
                `}
              >
                {isLoggingIn ? 'Подключение...' : 'Подключить Internet Identity'}
              </button>
            </div>

            {isLoggingIn && (
              <div className="flex items-center justify-center space-x-2 pt-4">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-3 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}

            {loginError && (
              <div className="glassmorphism px-4 py-2 rounded-lg border border-red-500/50 box-glow-gold">
                <p className="text-red-400 text-sm font-jetbrains">{loginError}</p>
              </div>
            )}
          </div>

          <div className="glassmorphism p-6 rounded-lg neon-border box-glow-purple animate-slide-up">
            <p className="text-cyan-200 text-sm md:text-base font-jetbrains">
              Войдите через Internet Identity для доступа к вашей виртуальной земле
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="glassmorphism p-4 rounded-lg border border-cyan-500/30 box-glow-cyan">
              <div className="text-3xl mb-2">🌌</div>
              <h3 className="text-cyan-400 font-orbitron text-sm mb-1">Космические биомы</h3>
              <p className="text-cyan-200/70 text-xs font-jetbrains">7 уникальных типов земли</p>
            </div>
            <div className="glassmorphism p-4 rounded-lg border border-purple-500/30 box-glow-purple">
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="text-purple-400 font-orbitron text-sm mb-1">Энергия и награды</h3>
              <p className="text-purple-200/70 text-xs font-jetbrains">Зарабатывайте токены CBR</p>
            </div>
            <div className="glassmorphism p-4 rounded-lg border border-green-500/30 box-glow-green">
              <div className="text-3xl mb-2">🎮</div>
              <h3 className="text-green-400 font-orbitron text-sm mb-1">3D визуализация</h3>
              <p className="text-green-200/70 text-xs font-jetbrains">Интерактивные модели</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
