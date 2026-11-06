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
  Shuffle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  BookmarkCheck,
  Tag,
  Radio,
} from 'lucide-react';
import { NewsItem, NewsCategory, NewsSource, SourceCategoryMix } from '../types';

interface NewsGatheringTabProps {
  news: NewsItem[];
  sources: NewsSource[];
  selectedNews: NewsItem[];
  onToggleSelect: (item: NewsItem) => void;
  onSelectMultiple: (items: NewsItem[]) => void;
  onClearSelection: () => void;
  onGatherNews: () => void;
  isGathering: boolean;
  onCurateWithAi: (
    period: string,
    count: number,
    categories: NewsCategory[],
    sourceMix?: SourceCategoryMix
  ) => Promise<void>;
  isCurating: boolean;
  onProceedToBulletin: () => void;
  onReviewNews?: (id: string, status: 'approved' | 'rejected') => void;
}

const CATEGORIES: NewsCategory[] = [
  'Noticias Locales',
  'Noticias Regionales',
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

  // Mixed RSS Source & Category Selection Matrix state
  const [sourceMix, setSourceMix] = useState<SourceCategoryMix>({});
  const [isMixFilterActive, setIsMixFilterActive] = useState<boolean>(false);
  const [isMixPanelOpen, setIsMixPanelOpen] = useState<boolean>(false);
  const [mixSearchTerm, setMixSearchTerm] = useState<string>('');

  // Helper to check if an item matches the active source-category mix
  const matchesMixItem = useMemo(() => {
    return (item: NewsItem, mix: SourceCategoryMix): boolean => {
      const activeEntries = Object.entries(mix).filter(
        ([_, cats]) => Array.isArray(cats) && cats.length > 0
      );
      if (activeEntries.length === 0) return true;

      return activeEntries.some(([srcKey, cats]) => {
        const srcKeyLower = srcKey.toLowerCase();
        const srcKeyBase = srcKeyLower.split('-')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const itemSrcBase = (item.sourceId || '').toLowerCase().split('-')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const itemSrcName = (item.sourceName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const matchesSource =
          item.sourceId === srcKey ||
          itemSrcName === srcKeyLower ||
          itemSrcName.includes(srcKeyLower) ||
          srcKeyLower.includes(itemSrcName) ||
          (srcKeyBase.length >= 4 && itemSrcName.includes(srcKeyBase)) ||
          (srcKeyBase.length >= 4 && itemSrcBase === srcKeyBase);

        if (!matchesSource) return false;
        return cats.includes(item.category);
      });
    };
  }, []);

  // Compute active rules count
  const activeRulesCount = useMemo(() => {
    let count = 0;
    Object.values(sourceMix).forEach((cats) => {
      if (Array.isArray(cats)) count += cats.length;
    });
    return count;
  }, [sourceMix]);

  const activeSourcesCount = useMemo(() => {
    return Object.entries(sourceMix).filter(([_, cats]) => cats && cats.length > 0).length;
  }, [sourceMix]);

  // Aggregate sources and their available categories from current news
  const sourcesMetadata = useMemo(() => {
    const map = new Map<
      string,
      {
        sourceId: string;
        sourceName: string;
        region?: string;
        totalArticles: number;
        categoryCounts: Record<string, number>;
      }
    >();

    // Seed from configured sources
    sources.forEach((s) => {
      map.set(s.id, {
        sourceId: s.id,
        sourceName: s.name,
        region: s.regionOrCity,
        totalArticles: 0,
        categoryCounts: {},
      });
    });

    // Populate with news
    news.forEach((n) => {
      let entry = map.get(n.sourceId);
      if (!entry) {
        // Try finding by name
        for (const [_, existing] of map.entries()) {
          if (existing.sourceName.toLowerCase() === n.sourceName.toLowerCase()) {
            entry = existing;
            break;
          }
        }
      }
      if (!entry) {
        entry = {
          sourceId: n.sourceId || n.sourceName.toLowerCase().replace(/\s+/g, '-'),
          sourceName: n.sourceName,
          region: n.region,
          totalArticles: 0,
          categoryCounts: {},
        };
        map.set(entry.sourceId, entry);
      }

      entry.totalArticles++;
      entry.categoryCounts[n.category] = (entry.categoryCounts[n.category] || 0) + 1;
    });

    return Array.from(map.values()).sort((a, b) => b.totalArticles - a.totalArticles);
  }, [sources, news]);

  // Filtered news with time window, search, category, region, and MIXED RSS rules
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

      // If mixed filter is activated, it takes precedence for source+category matching
      if (isMixFilterActive && activeRulesCount > 0) {
        if (!matchesMixItem(item, sourceMix)) return false;
      } else {
        if (selectedCategory !== 'Todas' && item.category !== selectedCategory) return false;
        if (selectedRegion !== 'Todas' && item.region !== selectedRegion) return false;
        if (selectedSourceId !== 'Todos' && item.sourceId !== selectedSourceId) return false;
      }

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
    isMixFilterActive,
    sourceMix,
    activeRulesCount,
    matchesMixItem,
  ]);

  const selectedSet = useMemo(() => new Set(selectedNews.map((n) => n.id)), [selectedNews]);

  const handleSelectTop = (n: number) => {
    const toPick = filteredNews.slice(0, n);
    onSelectMultiple(toPick);
  };

  const handleCurateClick = async () => {
    const cats = selectedCategory === 'Todas' ? [] : [selectedCategory as NewsCategory];
    const mixToSend = activeRulesCount > 0 ? sourceMix : undefined;
    await onCurateWithAi(selectedPeriod, targetCount, cats, mixToSend);
  };

  // Toggle category for a specific source in the mix
  const handleToggleCategoryForSource = (sourceKey: string, cat: NewsCategory) => {
    setSourceMix((prev) => {
      const current = prev[sourceKey] || [];
      const exists = current.includes(cat);
      const updated = exists ? current.filter((c) => c !== cat) : [...current, cat];

      const copy = { ...prev };
      if (updated.length === 0) {
        delete copy[sourceKey];
      } else {
        copy[sourceKey] = updated;
      }
      return copy;
    });
  };

  // Set all categories for a source
  const handleSetAllForSource = (sourceKey: string, selectAll: boolean) => {
    setSourceMix((prev) => {
      const copy = { ...prev };
      if (!selectAll) {
        delete copy[sourceKey];
        return copy;
      }

      const meta = sourcesMetadata.find((s) => s.sourceId === sourceKey);
      const availableCats = meta ? (Object.keys(meta.categoryCounts) as NewsCategory[]) : CATEGORIES;
      copy[sourceKey] = availableCats.length > 0 ? availableCats : CATEGORIES;
      return copy;
    });
  };

  // Preset Handlers
  const handleApplyPreset = (preset: 'user_example' | 'taragui_mix' | 'economy_sports' | 'security_health') => {
    const newMix: SourceCategoryMix = {};

    if (preset === 'user_example') {
      // User's exact prompt: "DE INFOBAE POLICIALES Y POLITICA Y DE CLARIN DEPORTES Y SALUD Y ASI SUCESIVAMENTE"
      const infobae = sourcesMetadata.find(
        (s) => s.sourceName.toLowerCase().includes('infobae') || s.sourceId.includes('infobae')
      );
      const clarin = sourcesMetadata.find(
        (s) => s.sourceName.toLowerCase().includes('clarin') || s.sourceName.toLowerCase().includes('clarín')
      );

      const infobaeKey = infobae ? infobae.sourceId : 'infobae-argentina';
      const clarinKey = clarin ? clarin.sourceId : 'clarin-nacional';

      newMix[infobaeKey] = ['Policiales', 'Política'];
      newMix[clarinKey] = ['Deportes', 'Salud'];
    } else if (preset === 'taragui_mix') {
      // Local Corrientes + National Mix
      const cor = sourcesMetadata.find(
        (s) => s.sourceName.toLowerCase().includes('libertador') || s.sourceName.toLowerCase().includes('litoral')
      );
      const infobae = sourcesMetadata.find((s) => s.sourceName.toLowerCase().includes('infobae'));
      const clarin = sourcesMetadata.find(
        (s) => s.sourceName.toLowerCase().includes('clarin') || s.sourceName.toLowerCase().includes('clarín')
      );

      if (cor) newMix[cor.sourceId] = ['Noticias Locales', 'Clima'];
      if (infobae) newMix[infobae.sourceId] = ['Política'];
      if (clarin) newMix[clarin.sourceId] = ['Sociedad'];
    } else if (preset === 'economy_sports') {
      const cronista = sourcesMetadata.find(
        (s) => s.sourceName.toLowerCase().includes('cronista') || s.sourceName.toLowerCase().includes('ámbito')
      );
      const clarin = sourcesMetadata.find(
        (s) => s.sourceName.toLowerCase().includes('clarin') || s.sourceName.toLowerCase().includes('clarín')
      );
      if (cronista) newMix[cronista.sourceId] = ['Economía'];
      if (clarin) newMix[clarin.sourceId] = ['Deportes'];
    } else if (preset === 'security_health') {
      const infobae = sourcesMetadata.find((s) => s.sourceName.toLowerCase().includes('infobae'));
      const tn = sourcesMetadata.find((s) => s.sourceName.toLowerCase().includes('tn'));
      if (infobae) newMix[infobae.sourceId] = ['Policiales'];
      if (tn) newMix[tn.sourceId] = ['Salud'];
    }

    setSourceMix(newMix);
    setIsMixFilterActive(true);
    setIsMixPanelOpen(true);
  };

  // Auto-Select Balanced News from Mix
  const handleAutoSelectFromMix = () => {
    const activeEntries = Object.entries(sourceMix).filter(
      ([_, cats]) => Array.isArray(cats) && cats.length > 0
    );
    if (activeEntries.length === 0) return;

    const selectedResults: NewsItem[] = [];
    const pool = news; // search from all loaded news to ensure full quota
    const perSourceTarget = Math.max(1, Math.round(targetCount / activeEntries.length));

    activeEntries.forEach(([srcKey, cats]) => {
      const srcKeyLower = srcKey.toLowerCase();
      const srcKeyBase = srcKeyLower.split('-')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const matchedForSource = pool.filter((item) => {
        const itemSrcBase = (item.sourceId || '').toLowerCase().split('-')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const itemSrcName = (item.sourceName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const matchesSource =
          item.sourceId === srcKey ||
          itemSrcName === srcKeyLower ||
          itemSrcName.includes(srcKeyLower) ||
          srcKeyLower.includes(itemSrcName) ||
          (srcKeyBase.length >= 4 && itemSrcName.includes(srcKeyBase)) ||
          (srcKeyBase.length >= 4 && itemSrcBase === srcKeyBase);
        return matchesSource && cats.includes(item.category);
      });

      // Sort by recency & importance
      const sorted = [...matchedForSource].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      const picked = sorted.slice(0, perSourceTarget);
      selectedResults.push(...picked);
    });

    if (selectedResults.length > 0) {
      onSelectMultiple(selectedResults);
    }
  };

  const pendingCount = news.filter(
    (n) => n.requiresHumanReview && n.reviewStatus === 'pending'
  ).length;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner with Action Buttons */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold mb-1">
            <Radio className="w-3 h-3 text-blue-400" />
            <span>Radio Corrientes Viva • Central Informativa</span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-cyan-400" />
            <span>Recopilación Periodística y Filtros RSS</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Noticias en tiempo real con opción de filtrado general y selector específico de medios y secciones (ej: Infobae Policiales/Política + Clarín Deportes/Salud).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle Specific Mixed RSS Matrix */}
          <button
            onClick={() => setIsMixPanelOpen(!isMixPanelOpen)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer border ${
              isMixPanelOpen || (isMixFilterActive && activeRulesCount > 0)
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-lg shadow-cyan-500/25'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Abrir el selector específico de secciones mezcladas por medio RSS"
          >
            <Shuffle className="w-3.5 h-3.5 text-cyan-300" />
            <span>Selector RSS Mixto (Medios & Secciones)</span>
            {activeRulesCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-300 text-slate-950">
                {activeSourcesCount} medios • {activeRulesCount} secciones
              </span>
            )}
            {isMixPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

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

      {/* DEDICATED MIXED RSS PANEL (Expandable / Collapsible) */}
      {isMixPanelOpen && (
        <div className="bg-slate-900 border-2 border-cyan-500/40 rounded-2xl p-5 shadow-2xl space-y-5 animate-fadeIn">
          {/* Header of the Mix Panel */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Mezclador Específico de Medios y Secciones RSS</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
                    Selección Cruzada Avanzada
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 max-w-3xl leading-relaxed">
                  Permite combinar secciones independientes para cada medio RSS: por ejemplo, elegir de <strong>Infobae</strong> las secciones <em>Policiales</em> y <em>Política</em>, y de <strong>Clarín</strong> las secciones <em>Deportes</em> y <em>Salud</em>, y así sucesivamente.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSourceMix({});
                  setIsMixFilterActive(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 cursor-pointer transition"
              >
                Limpiar Selección
              </button>
              <button
                onClick={() => setIsMixPanelOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                title="Cerrar panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick 1-Click Presets */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Plantillas Rápidas de Mezcla (1 Clic)</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => handleApplyPreset('user_example')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-900/60 font-semibold transition cursor-pointer"
                title="Aplica la regla: Infobae (Policiales, Política) + Clarín (Deportes, Salud)"
              >
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>🎯 Ejemplo Solicitado: Infobae (Policiales + Política) y Clarín (Deportes + Salud)</span>
              </button>

              <button
                onClick={() => handleApplyPreset('taragui_mix')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 font-medium transition cursor-pointer"
              >
                <span>🌾 Corrientes + Nacional: Locales (El Libertador) + Política (Infobae) + Sociedad (Clarín)</span>
              </button>

              <button
                onClick={() => handleApplyPreset('economy_sports')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 font-medium transition cursor-pointer"
              >
                <span>💼 Economía & Deporte: El Cronista (Economía) + Clarín (Deportes)</span>
              </button>

              <button
                onClick={() => handleApplyPreset('security_health')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 font-medium transition cursor-pointer"
              >
                <span>🚨 Seguridad & Salud: Infobae (Policiales) + TN (Salud)</span>
              </button>
            </div>
          </div>

          {/* Search Source in Matrix */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar medio en la matriz (ej: Clarín, Infobae, Libertador)..."
                value={mixSearchTerm}
                onChange={(e) => setMixSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="text-xs text-slate-400">
              <span className="font-bold text-cyan-400">{activeRulesCount}</span> secciones seleccionadas en{' '}
              <span className="font-bold text-cyan-400">{activeSourcesCount}</span> medios
            </div>
          </div>

          {/* Grid of Source Cards with their specific category checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[460px] overflow-y-auto pr-1">
            {sourcesMetadata
              .filter((s) => {
                if (!mixSearchTerm.trim()) return true;
                return s.sourceName.toLowerCase().includes(mixSearchTerm.toLowerCase());
              })
              .map((meta) => {
                const activeCats = sourceMix[meta.sourceId] || [];
                const availableCats = Object.keys(meta.categoryCounts) as NewsCategory[];
                const hasSelection = activeCats.length > 0;

                return (
                  <div
                    key={meta.sourceId}
                    className={`border rounded-xl p-3.5 flex flex-col justify-between transition ${
                      hasSelection
                        ? 'bg-slate-950/90 border-cyan-500/60 ring-1 ring-cyan-500/30'
                        : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Source Title & Quick Buttons */}
                      <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-slate-800/60">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-white tracking-wide">
                              {meta.sourceName}
                            </h4>
                            {hasSelection && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-cyan-500 text-slate-950">
                                {activeCats.length}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {meta.totalArticles} noticias disponibles {meta.region ? `• ${meta.region}` : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-[10px]">
                          <button
                            type="button"
                            onClick={() => handleSetAllForSource(meta.sourceId, true)}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                            title="Marcar todas las secciones disponibles de este medio"
                          >
                            Todas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllForSource(meta.sourceId, false)}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-300 cursor-pointer"
                            title="Quitar secciones de este medio"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>

                      {/* Category Pills for this specific source */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {CATEGORIES.map((cat) => {
                          const isCatActive = activeCats.includes(cat);
                          const count = meta.categoryCounts[cat] || 0;

                          // Only show categories that either exist in this source or are currently selected
                          if (count === 0 && !isCatActive) return null;

                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => handleToggleCategoryForSource(meta.sourceId, cat)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer border ${
                                isCatActive
                                  ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-sm shadow-cyan-500/30'
                                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border-slate-800'
                              }`}
                            >
                              {isCatActive ? (
                                <Check className="w-3 h-3 stroke-[3]" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              )}
                              <span>{cat}</span>
                              {count > 0 && (
                                <span
                                  className={`text-[9px] px-1 py-0.2 rounded ${
                                    isCatActive ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Bottom Action Ribbon inside Mix Panel */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-300">
              <span className="font-bold text-white">Reglas activas:</span>{' '}
              {activeRulesCount === 0 ? (
                <span className="text-slate-500 italic">
                  Ninguna regla seleccionada. Haz clic en las secciones de los medios que deseas combinar.
                </span>
              ) : (
                <span className="text-cyan-300 font-medium">
                  {Object.entries(sourceMix)
                    .filter(([_, cats]) => cats.length > 0)
                    .map(([srcKey, cats]) => {
                      const meta = sourcesMetadata.find((s) => s.sourceId === srcKey);
                      const name = meta ? meta.sourceName : srcKey;
                      return `${name}: [${cats.join(', ')}]`;
                    })
                    .join(' • ')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleAutoSelectFromMix}
                disabled={activeRulesCount === 0}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-extrabold text-xs transition cursor-pointer shadow-md shadow-cyan-500/20 disabled:opacity-40"
                title="Selecciona automáticamente un balance de noticias de las secciones configuradas"
              >
                <CheckSquare className="w-4 h-4" />
                <span>⚡ Auto-Seleccionar Noticias del Mix</span>
              </button>

              <button
                onClick={() => {
                  setIsMixFilterActive(!isMixFilterActive);
                }}
                disabled={activeRulesCount === 0}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer disabled:opacity-40 ${
                  isMixFilterActive
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{isMixFilterActive ? '✓ Filtro Mixto Activado' : 'Aplicar Filtro a la Vista'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE MIX NOTIFICATION BAR (When filter is on) */}
      {isMixFilterActive && activeRulesCount > 0 && !isMixPanelOpen && (
        <div className="bg-gradient-to-r from-cyan-950/70 via-blue-950/60 to-slate-900 border border-cyan-500/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg text-xs">
          <div className="flex items-center gap-2.5">
            <Shuffle className="w-4 h-4 text-cyan-400 animate-pulse flex-shrink-0" />
            <div>
              <span className="font-bold text-white">Filtro RSS Mixto Activo:</span>{' '}
              <span className="text-cyan-200">
                Mostrando únicamente noticias de las secciones configuradas ({filteredNews.length} encontradas).
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoSelectFromMix}
              className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition cursor-pointer"
            >
              Auto-Seleccionar
            </button>
            <button
              onClick={() => setIsMixPanelOpen(true)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition cursor-pointer"
            >
              Editar Mix
            </button>
            <button
              onClick={() => setIsMixFilterActive(false)}
              className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
              title="Desactivar filtro mixto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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

      {/* Target Quantity & Selection Bar */}
      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-semibold">Cantidad para el Boletín (1 a 24):</span>
          <div className="flex flex-wrap items-center gap-1">
            {[3, 5, 10, 15, 20, 24].map((cnt) => (
              <button
                key={cnt}
                onClick={() => {
                  setTargetCount(cnt);
                  handleSelectTop(cnt);
                }}
                className={`px-2.5 py-1 rounded font-medium transition cursor-pointer text-xs ${
                  targetCount === cnt && selectedNews.length === cnt
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cnt}
              </button>
            ))}

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-2 py-0.5 ml-1">
              <span className="text-slate-500 text-[11px]">N°:</span>
              <input
                type="number"
                min="1"
                max="24"
                value={targetCount}
                onChange={(e) => {
                  const val = Math.min(24, Math.max(1, parseInt(e.target.value) || 1));
                  setTargetCount(val);
                  handleSelectTop(val);
                }}
                className="w-8 bg-transparent text-cyan-300 font-bold text-center text-xs focus:outline-none"
              />
              <span className="text-slate-500 text-[11px]">noticias</span>
            </div>

            <button
              onClick={() => onSelectMultiple(filteredNews.slice(0, 24))}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer text-xs"
              title="Seleccionar hasta 24 noticias principales para un boletín extendido"
            >
              Seleccionar 24
            </button>
            <button
              onClick={() => onSelectMultiple(filteredNews)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition cursor-pointer text-xs"
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

      {/* Standard Filters Bar: Category, Region, Source, Search */}
      {!isMixFilterActive && (
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
      )}

      {/* News Feed Grid */}
      {filteredNews.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <Newspaper className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No hay noticias que coincidan con estos criterios</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Prueba seleccionando una franja horaria más amplia (ej: últimas 12h o 24h) o ajustando la mezcla de medios y secciones.
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
            const isMatchedByMix = activeRulesCount > 0 && matchesMixItem(item, sourceMix);

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
                className={`bg-slate-900 border rounded-xl p-4 flex flex-col justify-between transition cursor-pointer group shadow-sm select-none relative ${
                  isSelected
                    ? 'border-cyan-500 bg-slate-900/95 ring-2 ring-cyan-500/40'
                    : isMatchedByMix
                    ? 'border-cyan-500/50 bg-slate-900/80 hover:border-cyan-400'
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
                      {isMatchedByMix && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          <Check className="w-2.5 h-2.5" />
                          <span>Mix Activo</span>
                        </span>
                      )}
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
