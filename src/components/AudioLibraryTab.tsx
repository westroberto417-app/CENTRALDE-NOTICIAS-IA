import React, { useState } from 'react';
import {
  FileAudio,
  Play,
  Pause,
  Download,
  FileEdit,
  Trash2,
  Search,
  Clock,
  Calendar,
  Mic2,
  Newspaper,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { BulletinDraft } from '../types';
import { triggerDownload } from '../utils/audioUtils';

interface AudioLibraryTabProps {
  bulletins: BulletinDraft[];
  onLoadBulletinForEdit: (bulletin: BulletinDraft) => void;
  onDeleteBulletin: (id: string) => Promise<void>;
}

export const AudioLibraryTab: React.FC<AudioLibraryTabProps> = ({
  bulletins,
  onLoadBulletinForEdit,
  onDeleteBulletin,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  const filteredBulletins = bulletins.filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.timePeriod.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.voiceName && b.voiceName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'Todas' ||
      b.segments.some((s) => s.category === selectedCategory);

    return matchesSearch && matchesCategory;
  });

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '1:00 min';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s} min`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileAudio className="w-5 h-5 text-purple-400" />
            <span>Biblioteca y Archivo de Boletines MP3</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Historial de producciones sonoras de Radio Corrientes Viva, listas para emitir al aire o descargar.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por título, voz..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Bulletins Cards */}
      {filteredBulletins.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <FileAudio className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No hay boletines en la biblioteca</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {searchTerm
              ? 'No se encontraron producciones que coincidan con la búsqueda.'
              : 'Los boletines que generes en el editor se archivarán aquí como archivos MP3 descargables.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBulletins.map((bulletin) => {
            const dateObj = new Date(bulletin.createdAt);
            const dateStr = isNaN(dateObj.getTime())
              ? 'Fecha desconocida'
              : dateObj.toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });
            const timeStr = isNaN(dateObj.getTime())
              ? ''
              : dateObj.toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }) + ' hs';

            return (
              <div
                key={bulletin.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-5 transition shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {bulletin.stationName || 'Radio Corrientes Viva'}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>{dateStr}</span>
                        <Clock className="w-3 h-3 text-slate-500 ml-1" />
                        <span>{timeStr}</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white mt-1.5">{bulletin.title}</h3>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="bg-slate-950 px-2.5 py-1 rounded text-slate-300 border border-slate-800 flex items-center gap-1">
                      <Newspaper className="w-3 h-3 text-cyan-400" />
                      <span>{bulletin.selectedNewsCount} noticias</span>
                    </span>

                    <span className="bg-slate-950 px-2.5 py-1 rounded text-slate-300 border border-slate-800 flex items-center gap-1">
                      <Mic2 className="w-3 h-3 text-rose-400" />
                      <span>{bulletin.voiceName || 'Locutor Gemini'}</span>
                    </span>

                    <span className="bg-slate-950 px-2 py-1 rounded text-emerald-400 border border-slate-800 font-mono font-bold text-[11px] uppercase">
                      MP3 128 kbps
                    </span>

                    <span className="bg-slate-950 px-2.5 py-1 rounded text-slate-300 border border-slate-800 font-mono font-medium">
                      {formatDuration(bulletin.audioDurationSeconds)}
                    </span>
                  </div>
                </div>

                {/* Audio Player row if available */}
                {bulletin.audioUrl && (
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <audio src={bulletin.audioUrl} controls className="w-full sm:w-80 h-8 rounded" />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          triggerDownload(
                            bulletin.audioUrl!,
                            `${bulletin.title.toLowerCase().replace(/[^\w]/g, '-')}.mp3`
                          )
                        }
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
                        title="Descargar archivo MP3 para radio"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar MP3</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Script snippet & actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                  <p className="truncate max-w-lg italic text-[11px]">
                    "{bulletin.segments[0]?.text || bulletin.fullScript.slice(0, 100)}..."
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onLoadBulletinForEdit(bulletin)}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      <span>Editar o Re-generar</span>
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar producción "${bulletin.title}"?`)) {
                          onDeleteBulletin(bulletin.id);
                        }
                      }}
                      className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                      title="Eliminar de la biblioteca"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
