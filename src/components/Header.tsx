import React, { useState, useEffect } from 'react';
import { Radio, Clock, Sparkles, CheckCircle2, AlertCircle, BarChart3 } from 'lucide-react';
import { StationConfig } from '../types';

interface HeaderProps {
  station: StationConfig;
  hasGeminiKey: boolean;
  onOpenTestModal: () => void;
  onOpenCostModal: () => void;
  activeTab: string;
}

export const Header: React.FC<HeaderProps> = ({
  station,
  hasGeminiKey,
  onOpenTestModal,
  onOpenCostModal,
}) => {
  const [corrientesTime, setCorrientesTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      // Calculate Argentina / Corrientes Time (UTC-3)
      const nowUtc = new Date();
      const nowArg = new Date(nowUtc.getTime() - 3 * 60 * 60 * 1000);
      const hours = String(nowArg.getUTCHours()).padStart(2, '0');
      const minutes = String(nowArg.getUTCMinutes()).padStart(2, '0');
      const seconds = String(nowArg.getUTCSeconds()).padStart(2, '0');
      setCorrientesTime(`${hours}:${minutes}:${seconds} (Corrientes, UTC-3)`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Radio Corrientes Viva Info */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-amber-500 shadow-md shadow-blue-500/20 text-white font-bold">
              <Radio className="w-6 h-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-tight text-base sm:text-lg text-white">
                  CENTRAL DE NOTICIAS <span className="text-cyan-400">IA</span>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {station.stationName || 'RADIO CORRIENTES VIVA'}
                </span>
                <span className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                  AL AIRE
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">
                {station.dialFrequency} • {station.cityCountry} • {station.slogan}
              </p>
            </div>
          </div>

          {/* Right Action & Clock */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Corrientes Clock */}
            <div className="hidden md:flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono font-medium">{corrientesTime || 'Corrientes'}</span>
            </div>

            {/* Cost & Limits Monitor */}
            <button
              onClick={onOpenCostModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition cursor-pointer"
              title="Ver panel de consumo y control de costos de IA"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Consumo & Costos</span>
            </button>

            {/* 9-Step Verification Button */}
            <button
              onClick={onOpenTestModal}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-xs sm:text-sm shadow-sm transition-all duration-150 cursor-pointer"
              title="Comprobación paso a paso de funcionamiento real"
            >
              <Sparkles className="w-4 h-4 text-cyan-100" />
              <span>Test 9 Pasos</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
