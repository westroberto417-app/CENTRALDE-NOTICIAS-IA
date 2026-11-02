import React from 'react';
import { ShieldCheck, Zap, DollarSign, AlertCircle, BarChart3, CheckCircle2 } from 'lucide-react';
import { UsageStats } from '../types';

interface CostMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: UsageStats;
  maxDailyAudios: number;
}

export const CostMonitorModal: React.FC<CostMonitorModalProps> = ({
  isOpen,
  onClose,
  stats,
  maxDailyAudios,
}) => {
  if (!isOpen) return null;

  const percentUsed = Math.min(
    100,
    Math.round((stats.audiosGeneratedToday / (maxDailyAudios || 20)) * 100)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 my-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Control de Costos y Consumo de IA
              </h3>
              <p className="text-xs text-slate-400">
                Monitoreo de cuotas, límites diarios y protección contra gastos no deseados.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>

        {/* Free Tier Status Card */}
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3 text-xs">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-emerald-300">
              Nivel Gratuito Activo (Google AI Studio Free Tier)
            </span>
            <p className="text-slate-300 leading-relaxed">
              La aplicación utiliza el nivel gratuito provisto por el entorno de Google AI Studio para los modelos Gemini 3.8.
              <strong> Costo estimado actual: $0.00 USD.</strong>
            </p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Audios Generados Hoy</div>
            <div className="text-2xl font-bold text-white mt-1">
              {stats.audiosGeneratedToday} <span className="text-xs text-slate-500 font-normal">/ {maxDailyAudios}</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1">
              {maxDailyAudios - stats.audiosGeneratedToday} disponibles hoy
            </div>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Caracteres Procesados Hoy</div>
            <div className="text-2xl font-bold text-cyan-300 mt-1">
              {stats.charactersSynthesizedToday.toLocaleString('es-AR')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              ~{Math.round(stats.charactersSynthesizedToday / 5)} palabras
            </div>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Boletines Redactados Hoy</div>
            <div className="text-2xl font-bold text-purple-300 mt-1">
              {stats.bulletinsCreatedToday}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Borradores sin costo de audio
            </div>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Total Histórico de Audios</div>
            <div className="text-2xl font-bold text-amber-300 mt-1">
              {stats.totalAudiosEver}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Archivados en biblioteca
            </div>
          </div>
        </div>

        {/* Daily Limit Progress */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-semibold">Límite Diario de Seguridad</span>
            <span className="font-mono text-cyan-400 font-bold">{percentUsed}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                percentUsed > 80 ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Este tope previene generaciones masivas accidentales. Puedes ajustarlo en la pestaña de Ajustes.
          </p>
        </div>

        {/* Protection Note */}
        <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
          <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Regla de oro de la emisora:</strong> Los audios nunca se generan de manera automática por noticia individual. Primero se redacta y aprueba el boletín periodístico, y solo entonces se produce un único archivo MP3 bajo confirmación.
          </p>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
