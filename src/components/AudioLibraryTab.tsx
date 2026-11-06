import React, { useState, useRef } from 'react';
import {
  FileAudio,
  Download,
  FileEdit,
  Trash2,
  Search,
  Clock,
  Calendar,
  Mic2,
  Newspaper,
  RefreshCw,
  Upload,
  HardDrive,
  FileText,
  PlayCircle,
  Radio,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import { BulletinDraft } from '../types';
import { triggerDownload } from '../utils/audioUtils';

interface AudioLibraryTabProps {
  bulletins: BulletinDraft[];
  onLoadBulletinForEdit: (bulletin: BulletinDraft) => void;
  onProceedToVoiceStudio?: (bulletin: BulletinDraft) => void;
  onDeleteBulletin: (id: string) => Promise<void>;
  onRefreshBulletins?: (showNotification?: boolean) => Promise<void>;
  onOpenSessionModal?: () => void;
  sessionId?: string;
  isSyncing?: boolean;
}

export const AudioLibraryTab: React.FC<AudioLibraryTabProps> = ({
  bulletins,
  onLoadBulletinForEdit,
  onProceedToVoiceStudio,
  onDeleteBulletin,
  onRefreshBulletins,
  onOpenSessionModal,
  sessionId = 'RCV-CENTRAL',
  isSyncing = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredBulletins = bulletins.filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.timePeriod.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.voiceName && b.voiceName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'Todas' ||
      b.segments?.some((s) => s.category === selectedCategory);

    return matchesSearch && matchesCategory;
  });

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '1:00 min';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s} min`;
  };

  const handleDownloadScript = (b: BulletinDraft) => {
    const script =
      b.fullScript ||
      b.segments?.map((s) => `[${s.type.toUpperCase()}] ${s.title || ''}\n${s.text}`).join('\n\n') ||
      '';
    const blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `guion-rcv-${b.title.toLowerCase().replace(/[^\w]/g, '-')}.txt`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleExportBackup = () => {
    window.open('/api/bulletins/export', '_blank');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus('Leyendo archivo de respaldo central...');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await fetch('/api/bulletins/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      if (!res.ok) {
        throw new Error('El servidor rechazó el archivo de respaldo.');
      }

      const result = await res.json();
      setImportStatus(`¡Importación exitosa! Se restauraron ${result.importedCount} producciones en el servidor central.`);
      if (onRefreshBulletins) {
        await onRefreshBulletins(false);
      }
      setTimeout(() => setImportStatus(null), 5000);
    } catch (err: any) {
      setImportStatus(`Error al importar: ${err?.message || 'Archivo JSON no válido'}`);
      setTimeout(() => setImportStatus(null), 6000);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Central Storage Indicator & Actions Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileAudio className="w-5 h-5 text-purple-400" />
                <span>Biblioteca Central de Boletines</span>
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Servidor Central Permanente</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Todos los boletines, borradores y archivos MP3 quedan guardados en el repositorio central de Radio Corrientes Viva, sincronizados en tiempo real para todos los dispositivos y periodistas.
            </p>
          </div>

          {/* Sync & Backup Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenSessionModal && (
              <button
                onClick={onOpenSessionModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 text-xs font-semibold border border-cyan-800/80 transition cursor-pointer"
                title="Sincronizar por ID de sesión compartida o exportar/importar JSON local"
              >
                <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sesión: <strong className="font-mono text-cyan-200">{sessionId}</strong></span>
              </button>
            )}

            <button
              onClick={() => onRefreshBulletins && onRefreshBulletins(true)}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer disabled:opacity-50"
              title="Sincronizar producciones con el servidor central"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>

            <button
              onClick={handleExportBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Descargar copia de seguridad JSON de todos los boletines"
            >
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              <span>Exportar Respaldo</span>
            </button>

            <label
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Restaurar o importar boletines desde un archivo de respaldo"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Importar</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
                disabled={isImporting}
              />
            </label>
          </div>
        </div>

        {importStatus && (
          <div className="p-3 bg-slate-950 border border-cyan-800/60 rounded-lg text-xs text-cyan-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        {/* Search and Filters */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por título, voz o contenido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Total en archivo central: <span className="font-bold text-slate-200">{bulletins.length}</span> boletines
          </div>
        </div>
      </div>

      {/* Bulletins Cards */}
      {filteredBulletins.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <FileAudio className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No hay boletines en la biblioteca central</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {searchTerm
              ? 'No se encontraron producciones que coincidan con la búsqueda.'
              : 'Los boletines creados desde cualquier dispositivo o navegador se guardarán de forma permanente en el servidor central de Radio Corrientes Viva.'}
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

            const hasAudio = Boolean(bulletin.audioUrl);
            const isSynthesized = bulletin.status === 'synthesized' && hasAudio;

            return (
              <div
                key={bulletin.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-5 transition shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {bulletin.stationName || 'Radio Corrientes Viva'}
                      </span>
                      {isSynthesized ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Audio MP3 Listo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          Borrador Periodístico
                        </span>
                      )}
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
                      <span>{bulletin.selectedNewsCount || bulletin.segments?.filter(s => s.type === 'noticia').length || 0} noticias</span>
                    </span>

                    <span className="bg-slate-950 px-2.5 py-1 rounded text-slate-300 border border-slate-800 flex items-center gap-1">
                      <Mic2 className="w-3 h-3 text-rose-400" />
                      <span>{bulletin.voiceName || 'Locución RCV'}</span>
                    </span>

                    {hasAudio && (
                      <>
                        <span className="bg-slate-950 px-2 py-1 rounded text-emerald-400 border border-slate-800 font-mono font-bold text-[11px] uppercase">
                          MP3 128 kbps
                        </span>

                        <span className="bg-slate-950 px-2.5 py-1 rounded text-slate-300 border border-slate-800 font-mono font-medium">
                          {formatDuration(bulletin.audioDurationSeconds)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Audio Player row if available */}
                {hasAudio ? (
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <audio src={bulletin.audioUrl} controls className="w-full sm:w-80 h-8 rounded" />

                    <div className="flex flex-wrap items-center gap-2">
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

                      <button
                        onClick={() => handleDownloadScript(bulletin)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                        title="Descargar texto del guión radial (.txt)"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Guión (.txt)</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-slate-300 flex items-center gap-2">
                      <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Guión completo listo en el servidor central. Puedes locutarlo con IA o en vivo.</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {onProceedToVoiceStudio && (
                        <button
                          onClick={() => onProceedToVoiceStudio(bulletin)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition cursor-pointer"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>Locutar en Estudio</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDownloadScript(bulletin)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                        title="Descargar texto del guión radial (.txt)"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Guión (.txt)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Script snippet & actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                  <p className="truncate max-w-lg italic text-[11px]">
                    "{bulletin.segments?.[0]?.text || bulletin.fullScript?.slice(0, 100) || 'Boletín informativo listo'}..."
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onLoadBulletinForEdit(bulletin)}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      <span>Editar Guión</span>
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar producción "${bulletin.title}" del servidor central?`)) {
                          onDeleteBulletin(bulletin.id);
                        }
                      }}
                      className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                      title="Eliminar de la biblioteca central"
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

      {/* Persistence Note Footer */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-start gap-3">
        <HardDrive className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-200">Almacenamiento Centralizado Permanente: </span>
          <span>
            Los boletines generados se almacenan automáticamente en el servidor central (<code className="text-cyan-300 bg-slate-950 px-1 py-0.5 rounded">data/bulletins.json</code> y <code className="text-cyan-300 bg-slate-950 px-1 py-0.5 rounded">data/audio/</code>). Sin importar si accedes desde tu teléfono móvil, tablet o la computadora del estudio de emisión, todos los redactores y operadores tienen acceso al mismo archivo de boletines.
          </span>
        </div>
      </div>
    </div>
  );
};
