import React from 'react';
import {
  Rss,
  Newspaper,
  CheckSquare,
  FileAudio,
  Clock,
  Play,
  Download,
  Sparkles,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  FileEdit,
  Mic2,
  Settings,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import { NewsItem, BulletinDraft, NewsSource, ScheduleConfig, StationConfig, UsageStats } from '../types';
import { TabId } from './Navigation';

interface DashboardTabProps {
  sources: NewsSource[];
  news: NewsItem[];
  selectedNews: NewsItem[];
  bulletins: BulletinDraft[];
  schedule: ScheduleConfig;
  station: StationConfig;
  usage: UsageStats;
  hasGeminiKey: boolean;
  onNavigate: (tab: TabId) => void;
  onGatherNews: () => void;
  isGathering: boolean;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  sources,
  news,
  selectedNews,
  bulletins,
  schedule,
  station,
  usage,
  hasGeminiKey,
  onNavigate,
  onGatherNews,
  isGathering,
}) => {
  const activeSources = sources.filter((s) => s.active);
  const latestBulletin = bulletins.length > 0 ? bulletins[0] : null;
  const audioBulletins = bulletins.filter((b) => b.audioUrl);
  const pendingReviewCount = news.filter(
    (n) => n.requiresHumanReview && n.reviewStatus === 'pending'
  ).length;

  const recentNews = news.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Radio Corrientes Viva Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3">
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              <span>{station.stationName} • {station.dialFrequency}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Central de Noticias IA – Radio Corrientes Viva
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-2 max-w-2xl leading-relaxed">
              Producción periodística automatizada con criterio editorial para Corrientes y la región del Litoral. Recopilación de portales digitales reales, redacción de boletines y síntesis de audio MP3 con voces naturales.
            </p>

            {/* Quick Status Bar */}
            <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Estado: <strong>Conectado y Operativo</strong></span>
              </span>

              <span className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  Última actualización:{' '}
                  <strong>
                    {news.length > 0
                      ? new Date(news[0].gatheredAt).toLocaleTimeString('es-AR') + ' hs'
                      : 'Pendiente'}
                  </strong>
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={onGatherNews}
              disabled={isGathering}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isGathering ? 'animate-spin' : ''}`} />
              <span>{isGathering ? 'Recopilando Noticias...' : 'Actualizar Noticias'}</span>
            </button>
            <button
              onClick={() => onNavigate('news')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
            >
              <span>Ver Noticias</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Primary Big Action Navigation Buttons (Requested in Section 4) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 sm:gap-3">
        <button
          onClick={onGatherNews}
          disabled={isGathering}
          className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer group disabled:opacity-50"
        >
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-110 transition">
            <RefreshCw className={`w-5 h-5 ${isGathering ? 'animate-spin' : ''}`} />
          </div>
          <span className="text-center leading-tight">Actualizar Noticias</span>
        </button>

        <button
          onClick={() => onNavigate('news')}
          className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500 text-white text-xs font-bold transition shadow-sm cursor-pointer group"
        >
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition">
            <Newspaper className="w-5 h-5" />
          </div>
          <span className="text-center leading-tight">Ver Noticias</span>
        </button>

        <button
          onClick={() => onNavigate('bulletin')}
          className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500 text-white text-xs font-bold transition shadow-sm cursor-pointer group"
        >
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition">
            <FileEdit className="w-5 h-5" />
          </div>
          <span className="text-center leading-tight">Crear Boletín</span>
        </button>

        <button
          onClick={() => onNavigate('voice-studio')}
          className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500 text-white text-xs font-bold transition shadow-sm cursor-pointer group"
        >
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-110 transition">
            <Mic2 className="w-5 h-5" />
          </div>
          <span className="text-center leading-tight">Generar Audio MP3</span>
        </button>

        <button
          onClick={() => onNavigate('library')}
          className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500 text-white text-xs font-bold transition shadow-sm cursor-pointer group"
        >
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition">
            <FileAudio className="w-5 h-5" />
          </div>
          <span className="text-center leading-tight">Biblioteca Audios</span>
        </button>

        <button
          onClick={() => onNavigate('sources')}
          className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500 text-white text-xs font-bold transition shadow-sm cursor-pointer group"
        >
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition">
            <Rss className="w-5 h-5" />
          </div>
          <span className="text-center leading-tight">Administrar Fuentes</span>
        </button>

        <button
          onClick={() => onNavigate('station')}
          className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer group"
        >
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 group-hover:scale-110 transition">
            <Settings className="w-5 h-5" />
          </div>
          <span className="text-center leading-tight">Configuración</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Fuentes Activas */}
        <div
          onClick={() => onNavigate('sources')}
          className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 p-4 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Fuentes RSS</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-110 transition">
              <Rss className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{sources.length}</div>
          <div className="text-[11px] text-emerald-400 font-medium mt-1">
            {activeSources.length} activas
          </div>
        </div>

        {/* 2. Noticias Recopiladas */}
        <div
          onClick={() => onNavigate('news')}
          className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 p-4 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Recopiladas</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition">
              <Newspaper className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{news.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">en base de datos</div>
        </div>

        {/* 3. Pendientes de Revisión */}
        <div
          onClick={() => onNavigate('news')}
          className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 p-4 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Revisión</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400">{pendingReviewCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">policial / salud</div>
        </div>

        {/* 4. Noticias Seleccionadas */}
        <div
          onClick={() => onNavigate('news')}
          className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 p-4 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Selección</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400">{selectedNews.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">para el boletín</div>
        </div>

        {/* 5. Boletines Preparados */}
        <div
          onClick={() => onNavigate('bulletin')}
          className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 p-4 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Boletines</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-cyan-300">{bulletins.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">preparados</div>
        </div>

        {/* 6. Audios MP3 Producidos */}
        <div
          onClick={() => onNavigate('library')}
          className="bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 p-4 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Audios MP3</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-110 transition">
              <FileAudio className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-400">{audioBulletins.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">para descargar</div>
        </div>
      </div>

      {/* Main Grid: Últimas Noticias Recopiladas & Último Boletín Radial */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Panorama informativo de última hora */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Noticias Recopiladas Recientemente
              </h2>
            </div>
            <button
              onClick={() => onNavigate('news')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Ver todas y filtrar por período</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentNews.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-slate-300 font-medium">Aún no se han recopilado noticias</p>
              <p className="text-xs text-slate-500 mt-1">
                Haz clic en "Actualizar Noticias" para sincronizar los canales RSS de Corrientes y del país.
              </p>
              <button
                onClick={onGatherNews}
                className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
              >
                Actualizar Noticias
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentNews.map((item) => {
                const pubDate = new Date(item.publishedAt);
                const timeString = isNaN(pubDate.getTime())
                  ? 'Reciente'
                  : pubDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={item.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition group shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 truncate max-w-[160px]">
                          {item.sourceName}
                        </span>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{timeString}</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-300 font-medium truncate max-w-[100px]">
                            {item.category}
                          </span>
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition line-clamp-2 leading-snug">
                        {item.title}
                      </h3>

                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {item.summary || 'Sin descripción disponible.'}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <a
                        href={item.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition"
                      >
                        <span>Fuente original</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      {item.requiresHumanReview && item.reviewStatus === 'pending' ? (
                        <span className="text-[10px] text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                          Requiere Aprobación
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded">
                          Verificada
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Último Boletín / Generador Rápido */}
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <FileAudio className="w-4 h-4 text-purple-400" />
            <span>Último Boletín de Radio Corrientes Viva</span>
          </h2>

          {latestBulletin ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <div>
                <span className="inline-block text-[11px] uppercase tracking-wider font-semibold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  {latestBulletin.timePeriod || 'Boletín'}
                </span>
                <h3 className="text-base font-bold text-white mt-2">
                  {latestBulletin.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(latestBulletin.createdAt).toLocaleString('es-AR')} • {latestBulletin.selectedNewsCount} noticias
                </p>
              </div>

              {/* Player or Action */}
              {latestBulletin.audioUrl ? (
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Audio MP3 Listo</span>
                    </span>
                    <span>{latestBulletin.audioDurationSeconds || 60} seg</span>
                  </div>

                  <audio
                    src={latestBulletin.audioUrl}
                    controls
                    className="w-full h-9 rounded"
                  />

                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={latestBulletin.audioUrl}
                      download={`boletin-rcv-${latestBulletin.id}.mp3`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar Archivo MP3</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/40 border border-slate-800 p-3 rounded-lg text-xs text-slate-300">
                  <p>Guion periodístico redactado y listo para revisión humana antes de generar el MP3.</p>
                  <button
                    onClick={() => onNavigate('bulletin')}
                    className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>Revisar y Aprobar Texto</span>
                  </button>
                </div>
              )}

              {/* Snippet */}
              <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 space-y-1">
                <span className="font-semibold text-slate-300">Apertura:</span>
                <p className="italic line-clamp-3">
                  "{latestBulletin.segments[0]?.text || latestBulletin.fullScript.slice(0, 150)}..."
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  onClick={() => onNavigate('bulletin')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                >
                  Abrir en el Editor de Boletines →
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-3">
              <FileAudio className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-300 font-medium">
                No hay producciones recientes guardadas.
              </p>
              <button
                onClick={() => onNavigate('news')}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                Crear Primer Boletín para Radio Corrientes Viva
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
