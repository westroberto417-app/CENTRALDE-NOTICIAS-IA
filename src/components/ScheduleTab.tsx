import React, { useState } from 'react';
import {
  CalendarClock,
  Clock,
  Save,
  Radio,
  Sliders,
  Check,
  Zap,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { ScheduleConfig, ScheduleSlot, VoiceOption } from '../types';

interface ScheduleTabProps {
  schedule: ScheduleConfig;
  voices: VoiceOption[];
  onSaveSchedule: (schedule: ScheduleConfig) => Promise<void>;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ schedule, voices, onSaveSchedule }) => {
  const [config, setConfig] = useState<ScheduleConfig>(schedule);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleToggleAuto = () => {
    setConfig((prev) => ({ ...prev, autoEnabled: !prev.autoEnabled }));
  };

  const handleToggleSlot = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    }));
  };

  const handleSlotChange = (id: string, updates: Partial<ScheduleSlot>) => {
    setConfig((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveSchedule(config);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-cyan-400" />
            <span>Automatización y Programación Horaria</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
            Programa borradores informativos automáticos en los horarios clave de Radio Corrientes Viva (zona horaria Corrientes, UTC-3).
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Guardando...' : savedSuccess ? '¡Guardado!' : 'Guardar Cambios'}</span>
        </button>
      </div>

      {/* Safety Notice: Drafts Only by default */}
      <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-cyan-300">Control Ético y de Costos:</strong>
          <p className="mt-0.5 text-slate-400">
            Por política de seguridad y ahorro de cuotas, el cron de fondo prepara automáticamente el <strong>borrador del boletín</strong> y lo deja listo para revisión humana. La generación del archivo MP3 se ejecuta bajo confirmación para evitar consumos innecesarios.
          </p>
        </div>
      </div>

      {/* Master Toggle Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          config.autoEnabled
            ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/40'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold ${
                config.autoEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              <Zap className="w-6 h-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Programación Automática en Servidor
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    config.autoEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {config.autoEnabled ? 'Activa en Servidor' : 'Pausada'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Zona horaria: <strong className="text-slate-300">Corrientes (UTC-3)</strong>. Revisa las fuentes y crea borradores listos para emitir.
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleAuto}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-md ${
              config.autoEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {config.autoEnabled ? 'Desactivar Programación' : 'Activar Programación'}
          </button>
        </div>
      </div>

      {/* Hourly / Slots Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Horarios de Emisión de Radio Corrientes Viva</span>
          </h3>
          <span className="text-xs text-slate-400">
            {config.slots.filter((s) => s.enabled).length} de {config.slots.length} horarios activos
          </span>
        </div>

        <div className="space-y-3">
          {config.slots.map((slot) => {
            return (
              <div
                key={slot.id}
                className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  slot.enabled
                    ? 'bg-slate-950 border-slate-700'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) => handleSlotChange(slot.id, { time: e.target.value })}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-cyan-400 font-mono font-bold text-sm focus:outline-none focus:border-blue-500"
                  />

                  <div>
                    <input
                      type="text"
                      value={slot.label}
                      onChange={(e) => handleSlotChange(slot.id, { label: e.target.value })}
                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 font-bold text-white text-sm focus:outline-none"
                    />
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {slot.lastRunAt ? (
                        <span className="text-emerald-400">
                          Último borrador: {new Date(slot.lastRunAt).toLocaleTimeString('es-AR')}
                        </span>
                      ) : (
                        'Pendiente de primera ejecución'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Noticias:</span>
                    <select
                      value={slot.newsCount}
                      onChange={(e) =>
                        handleSlotChange(slot.id, { newsCount: Number(e.target.value) })
                      }
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs"
                    >
                      <option value={3}>Top 3</option>
                      <option value={5}>Top 5</option>
                      <option value={10}>Top 10</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Voz:</span>
                    <select
                      value={slot.voiceId}
                      onChange={(e) => handleSlotChange(slot.id, { voiceId: e.target.value })}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs max-w-[150px] truncate"
                    >
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => handleToggleSlot(slot.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                      slot.enabled ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow-lg ring-0 transition duration-200 ease-in-out mt-0.5 ${
                        slot.enabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
