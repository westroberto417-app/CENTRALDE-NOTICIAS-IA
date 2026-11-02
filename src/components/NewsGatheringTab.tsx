import React, { useState, useMemo } from 'react';
import {
  Newspaper,
  Clock,
  Sparkles,
  Filter,
  CheckSquare,
  Square,
  ExternalLink,
  Layers,
  ArrowRight,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  Award,
  ShieldAlert,
  Check,
  X,
} from 'lucide-react';
import { NewsItem, NewsCategory, NewsSource } from '../types';

interface NewsGatheringTabProps {
  news: NewsItem[];
  sources: NewsSource[];
  selectedNews: NewsItem[];
  onToggleSelect: (item: NewsItem) => void;
  onSelectMultiple: (items: NewsItem[]) => void;
  onClearSelection: () => void;
  onGatherNews: () => void;
  isGathering: boolean;
  onCurateWithAi: (period: string, count: number, categories: NewsCategory[]) => Promise<void>;
  isCurating: boolean;
  onProceedToBulletin: () => void;
  onReviewNews?: (id: string, status: 'approved' | 'rejected') => void;
}

const CATEGORIES: NewsCategory[] = [
  'Noticias Regionales',
  'Noticias Locales',
  'Noticias Nacionales',
  'Noticias Internacionales',
  'Política',
  'Economía',
  'Sociedad',
  'Policiales',
  'Deportes',
  'Salud',
  'Educación',
  'Cultura',
  'Tecnología',
  'Clima',
];

export const NewsGatheringTab: React.FC<NewsGatheringTabProps> = ({
  news,
  sources,
  selectedNews,
  onToggleSelect,
  onSelectMultiple,
  onClearSelection,
  onGatherNews,
  isGathering,
  onCurateWithAi,
  isCurating,
  onProceedToBulletin,
  onReviewNews,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('6h');
  const [targetCount, setTargetCount] = useState<number>(5);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedRegion, setSelectedRegion] = useState<string>('Todas');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterPendingOnly, setFilterPendingOnly] = useState<boolean>(false);

  // Custom date range
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const filteredNews = useMemo(() => {
    const now = Date.now();
    let timeLimitMs: number | null = null;

    if (selectedPeriod === '1h') timeLimitMs = 60 * 60 * 1000;
    else if (selectedPeriod === '3h') timeLimitMs = 3 * 60 * 60 * 1000;
    else if (selectedPeriod === '6h') timeLimitMs = 6 * 60 * 60 * 1000;
    else if (selectedPeriod === '12h') timeLimitMs = 12 * 60 * 60 * 1000;
    else if (selectedPeriod === '24h') timeLimitMs = 24 * 60 * 60 * 1000;

    return news.filter((item) => {
      const pubTime = new Date(item.publishedAt).getTime();

      if (selectedPeriod === 'custom') {
        if (customStart && pubTime < new Date(customStart).getTime()) return false;
        if (customEnd && pubTime > new Date(customEnd).getTime()) return false;
      } else if (timeLimitMs !== null) {
        if (now - pubTime > timeLimitMs) return false;
      }

      if (selectedCategory !== 'Todas' && item.category !== selectedCategory) return false;
      if (selectedRegion !== 'Todas' && item.region !== selectedRegion) return false;
      if (selectedSourceId !== 'Todos' && item.sourceId !== selectedSourceId) return false;
      if (filterPendingOnly && (!item.requiresHumanReview || item.reviewStatus !== 'pending')) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.sourceName.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [
    news,
    selectedPeriod,
    selectedCategory,
    selectedRegion,
    selectedSourceId,
    searchTerm,
    filterPendingOnly,
    customStart,
    customEnd,
  ]);

  const selectedSet = useMemo(() => new Set(selectedNews.map((n) => n.id)), [selectedNews]);

  const handleSelectTop = (n: number) => {
    const toPick = filteredNews.slice(0, n);
    onSelectMultiple(toPick);
  };

  const handleCurateClick = async () => {
    const cats = selectedCategory === 'Todas' ? [] : [selectedCategory as NewsCategory];
    await onCurateWithAi(selectedPeriod, targetCount, cats);
  };

  const pendingCount = news.filter(
    (n) => n.requiresHumanReview && n.reviewStatus === 'pending'
  ).length;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-blue-400" />
            <span>Recopilación Periodística y Filtros por Período</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Noticias reales actualizadas desde portales de Corrientes, la región del Litoral y el país. Agrupación de duplicados y control ético de noticias delicadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onGatherNews}
            disabled={isGathering}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGathering ? 'animate-spin' : ''}`} />
            <span>{isGathering ? 'Recopilando...' : 'Actualizar RSS'}</span>
          </button>

          <button
            onClick={handleCurateClick}
            disabled={isCurating || filteredNews.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isCurating ? 'animate-spin text-cyan-200' : 'text-cyan-200'}`} />
            <span>{isCurating ? 'Seleccionando con IA...' : 'Selección Automática IA'}</span>
          </button>
        </div>
      </div>

      {/* Period Selection Ribbon */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Período Informativo a Cubrir</span>
          </span>
          <span className="text-xs text-slate-400 font-medium">
            {filteredNews.length} noticias en esta ventana
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {[
            { id: '1h', label: 'Última hora' },
            { id: '3h', label: 'Últimas 3 horas' },
            { id: '6h', label: 'Últimas 6 horas' },
            { id: '12h', label: 'Últimas 12 horas' },
            { id: '24h', label: 'Últimas 24 horas' },
            { id: 'custom', label: 'Rango Personalizado' },
          ].map((period) => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriod(period.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                selectedPeriod === period.id
                  ? 'bg-blue-600 text-white shadow font-semibold'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>

        {/* Custom Range */}
        {selectedPeriod === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Desde:</span>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Hasta:</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Target Quantity & Pending Review Notice */}
      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold">Cantidad para el Boletín:</span>
          <div className="flex items-center gap-1">
            {[3, 5, 10].map((cnt) => (
              <button
                key={cnt}
                onClick={() => {
                  setTargetCount(cnt);
                  handleSelectTop(cnt);
                }}
                className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                  targetCount === cnt && selectedNews.length === cnt
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cnt} noticias
              </button>
            ))}
            <button
              onClick={() => onSelectMultiple(filteredNews)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition cursor-pointer"
            >
              Todas ({filteredNews.length})
            </button>
          </div>
        </div>

        {/* Sensitive News Filter */}
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={() => setFilterPendingOnly(!filterPendingOnly)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs transition cursor-pointer ${
                filterPendingOnly
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Pendientes de Revisión ({pendingCount})</span>
            </button>
          )}

          {selectedNews.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-semibold">
                {selectedNews.length} seleccionadas
              </span>
              <button
                onClick={onClearSelection}
                className="text-slate-400 hover:text-red-400 underline cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar: Category, Region, Source, Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por palabra clave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="Todas">Todas las Categorías</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="Todas">Todas las Regiones</option>
            <option value="Corrientes Capital e Interior">Corrientes Capital e Interior</option>
            <option value="Litoral / NEA">Litoral / NEA</option>
            <option value="Nacional">Nacional</option>
            <option value="Internacional">Internacional</option>
          </select>
        </div>

        <div>
          <select
            value={selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="Todos">Todos los Medios</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* News Feed Grid */}
      {filteredNews.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <Newspaper className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No hay noticias en este período o filtro</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Prueba seleccionando una franja horaria más amplia (ej: últimas 12h o 24h) o haz clic en "Actualizar RSS" para sincronizar.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => setSelectedPeriod('24h')}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
            >
              Ver últimas 24 horas
            </button>
            <button
              onClick={onGatherNews}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
            >
              Actualizar RSS
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNews.map((item) => {
            const isSelected = selectedSet.has(item.id);
            const pubDate = new Date(item.publishedAt);
            const formattedDate = isNaN(pubDate.getTime())
              ? 'Reciente'
              : pubDate.toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }) + ' hs (' + pubDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ')';

            return (
              <div
                key={item.id}
                onClick={() => onToggleSelect(item)}
                className={`bg-slate-900 border rounded-xl p-4 flex flex-col justify-between transition cursor-pointer group shadow-sm select-none ${
                  isSelected
                    ? 'border-cyan-500 bg-slate-900/95 ring-1 ring-cyan-500/40'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded text-[11px] border border-blue-500/20 truncate max-w-[140px]">
                        {item.sourceName}
                      </span>
                      <span className="text-[10px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                        {item.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.importanceScore && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          <Award className="w-2.5 h-2.5" />
                          <span>{item.importanceScore} pts</span>
                        </span>
                      )}
                      <button
                        type="button"
                        className="text-slate-400 hover:text-cyan-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelect(item);
                        }}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-600 group-hover:text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition line-clamp-3 leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                    {item.summary || 'Sin resumen disponible.'}
                  </p>
                </div>

                {/* Human Review Banner for Sensitive news */}
                {item.requiresHumanReview && (
                  <div className="mt-3 p-2 rounded-lg bg-amber-950/40 border border-amber-500/30 text-[11px] flex items-center justify-between gap-2">
                    <span className="text-amber-300 font-medium flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span>{item.reviewStatus === 'approved' ? 'Aprobada por periodista' : 'Requiere Aprobación'}</span>
                    </span>

                    {onReviewNews && item.reviewStatus === 'pending' && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReviewNews(item.id, 'approved');
                          }}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10px]"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReviewNews(item.id, 'rejected');
                          }}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-red-500 text-slate-300 rounded text-[10px]"
                        >
                          Descartar
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{formattedDate}</span>
                  </div>

                  <a
                    href={item.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-500 hover:text-cyan-300 flex items-center gap-1 transition"
                  >
                    <span>Fuente original</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Bar */}
      {selectedNews.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-cyan-500/50 shadow-2xl rounded-2xl px-5 py-3.5 flex items-center gap-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-cyan-400" />
            <div>
              <span className="text-sm font-bold text-white">
                {selectedNews.length} noticias seleccionadas
              </span>
              <p className="text-[11px] text-slate-400">
                Listas para la redacción del boletín de Radio Corrientes Viva
              </p>
            </div>
          </div>

          <button
            onClick={onProceedToBulletin}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/30 transition cursor-pointer"
          >
            <span>Crear Boletín</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
