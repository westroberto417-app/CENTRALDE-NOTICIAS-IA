import React, { useState } from 'react';
import {
  Radio,
  Sliders,
  Save,
  Music,
  Mic2,
  Key,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Database,
} from 'lucide-react';
import { StationConfig, VoiceOption } from '../types';

interface StationSettingsTabProps {
  station: StationConfig;
  voices: VoiceOption[];
  hasGeminiKey: boolean;
  onSaveStation: (station: StationConfig) => Promise<void>;
}

export const StationSettingsTab: React.FC<StationSettingsTabProps> = ({
  station,
  voices,
  hasGeminiKey,
  onSaveStation,
}) => {
  const [form, setForm] = useState<StationConfig>(station);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveStation(form);
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
            <Radio className="w-5 h-5 text-amber-400" />
            <span>Configuración de Emisora y Parámetros del Sistema</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Administra los datos institucionales de Radio Corrientes Viva, locutores virtuales, límites diarios de cuota y plantillas de apertura y cierre.
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Guardando...' : savedSuccess ? '¡Guardado!' : 'Guardar Ajustes'}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Basic Station Branding */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-400" />
            <span>Datos Institucionales de Radio Corrientes Viva</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Nombre de la Emisora
              </label>
              <input
                type="text"
                required
                value={form.stationName}
                onChange={(e) => setForm({ ...form, stationName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                placeholder="Radio Corrientes Viva"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Frecuencia / Dial / Señal
              </label>
              <input
                type="text"
                required
                value={form.dialFrequency}
                onChange={(e) => setForm({ ...form, dialFrequency: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                placeholder="FM 97.1 / Online"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Frase Institucional / Eslogan de la Radio
              </label>
              <input
                type="text"
                value={form.slogan}
                onChange={(e) => setForm({ ...form, slogan: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                placeholder="La voz del Taragüí con toda la información al instante"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Locutores / Periodistas Virtuales
              </label>
              <input
                type="text"
                value={form.broadcasterName}
                onChange={(e) => setForm({ ...form, broadcasterName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                placeholder="Juan Carlos Romero y Mariana Fernández"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Ciudad y Provincia
              </label>
              <input
                type="text"
                value={form.cityCountry}
                onChange={(e) => setForm({ ...form, cityCountry: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                placeholder="Corrientes, Argentina"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Voz Predeterminada para la Emisora
              </label>
              <select
                value={form.defaultVoiceId}
                onChange={(e) => setForm({ ...form, defaultVoiceId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.accent})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Protection & Limits */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Control de Costos y Límite Diario de Seguridad</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Límite Máximo de Audios MP3 por Día
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.maxDailyAudios || 20}
                onChange={(e) => setForm({ ...form, maxDailyAudios: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Tope de seguridad para evitar consumos excesivos involuntarios.
              </p>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Estilo Radial Predeterminado
              </label>
              <select
                value={form.styleTone}
                onChange={(e) => setForm({ ...form, styleTone: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="periodistico">Periodístico Objetivo (Recomendado)</option>
                <option value="informativo">Informativo Sobrio</option>
                <option value="cordial">Cordial y Cercano (Primera Mañana)</option>
                <option value="dinamico">Dinámico (Deportes / Actualidad)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Radio Templates */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>Plantillas de Apertura y Cierre Radial</span>
          </h3>
          <p className="text-slate-400 text-xs">
            Usa el comodín <code className="text-cyan-400 font-mono">{"{EMISORA}"}</code> para insertar automáticamente el nombre y dial de Radio Corrientes Viva.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Texto de Apertura Institucional
              </label>
              <textarea
                rows={3}
                value={form.openingTemplate}
                onChange={(e) => setForm({ ...form, openingTemplate: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Texto de Cierre Institucional
              </label>
              <textarea
                rows={3}
                value={form.closingTemplate}
                onChange={(e) => setForm({ ...form, closingTemplate: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
              />
            </div>
          </div>
        </div>

        {/* Engine Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <span>Arquitectura y Estado de Conectividad</span>
          </h3>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white">Google Gemini 3.8 Flash-Lite TTS</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {hasGeminiKey ? 'Clave de Servidor Activa' : 'Modo Local'}
              </span>
            </div>
            <p className="text-slate-400 text-[11px]">
              La clave de API se administra exclusivamente en el servidor sin exponerse en el navegador. La conversión a MP3 se ejecuta con lamejs a 128 kbps.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
};
