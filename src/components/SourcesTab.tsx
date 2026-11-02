import React, { useState } from 'react';
import {
  Rss,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Globe,
  Clock,
  ExternalLink,
  Trash2,
  Edit2,
  RefreshCw,
  Search,
  Check,
  MapPin,
} from 'lucide-react';
import { NewsSource, NewsCategory } from '../types';

interface SourcesTabProps {
  sources: NewsSource[];
  onAddSource: (source: Omit<NewsSource, 'id'>) => Promise<void>;
  onUpdateSource: (id: string, updates: Partial<NewsSource>) => Promise<void>;
  onDeleteSource: (id: string) => Promise<void>;
  onTestFeed: (rssUrl: string) => Promise<{ success: boolean; count?: number; error?: string; sampleItems?: any[] }>;
  onGatherNews: () => void;
  isGathering: boolean;
}

const CATEGORIES: (NewsCategory | 'General')[] = [
  'General',
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

export const SourcesTab: React.FC<SourcesTabProps> = ({
  sources,
  onAddSource,
  onUpdateSource,
  onDeleteSource,
  onTestFeed,
  onGatherNews,
  isGathering,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('Todas');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testingUrl, setTestingUrl] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  // Form State
  const [name, setName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [category, setCategory] = useState<NewsCategory | 'General'>('Noticias Regionales');
  const [regionOrCity, setRegionOrCity] = useState('Corrientes Capital e Interior');
  const [frequency, setFrequency] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  // Filter sources
  const filteredSources = sources.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.rssUrl.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRegion = regionFilter === 'Todas' || s.regionOrCity === regionFilter;
    return matchesSearch && matchesRegion;
  });

  const regions = ['Todas', ...Array.from(new Set(sources.map((s) => s.regionOrCity)))];

  const handleTestInModal = async () => {
    if (!rssUrl.trim()) return;
    setTestingUrl(rssUrl);
    setTestResult(null);
    try {
      const res = await onTestFeed(rssUrl.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingUrl(null);
    }
  };

  const handleTestExisting = async (source: NewsSource) => {
    setTestingUrl(source.id);
    try {
      const res = await onTestFeed(source.rssUrl);
      if (res.success) {
        await onUpdateSource(source.id, {
          status: 'ok',
          articlesCount: res.count,
          lastFetchedAt: new Date().toISOString(),
          errorMessage: undefined,
        });
      } else {
        await onUpdateSource(source.id, {
          status: 'error',
          errorMessage: res.error,
        });
      }
    } catch (e: any) {
      await onUpdateSource(source.id, {
        status: 'error',
        errorMessage: e.message,
      });
    } finally {
      setTestingUrl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rssUrl.trim()) return;

    setSubmitting(true);
    try {
      await onAddSource({
        name: name.trim(),
        siteUrl: siteUrl.trim(),
        rssUrl: rssUrl.trim(),
        category,
        regionOrCity,
        active: true,
        updateFrequencyMinutes: Number(frequency),
        status: 'pending',
      });
      setIsModalOpen(false);
      setName('');
      setSiteUrl('');
      setRssUrl('');
      setTestResult(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Rss className="w-5 h-5 text-amber-400" />
            <span>Fuentes Informativas y Canales RSS</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gestioná los portales de Corrientes, la región del Litoral / NEA y medios nacionales autorizados.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onGatherNews}
            disabled={isGathering}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGathering ? 'animate-spin' : ''}`} />
            <span>{isGathering ? 'Recopilando...' : 'Sincronizar Todas'}</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Portal RSS</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nombre o URL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400">Región / Localidad:</span>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sources Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">Portal / Medio</th>
                <th className="p-3.5">Categoría</th>
                <th className="p-3.5">Región / Ciudad</th>
                <th className="p-3.5">Frecuencia</th>
                <th className="p-3.5">Estado Canal RSS</th>
                <th className="p-3.5">Activo</th>
                <th className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredSources.map((source) => {
                const isTesting = testingUrl === source.id;
                return (
                  <tr key={source.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5">
                      <div className="font-bold text-white text-sm">{source.name}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs font-mono">
                        {source.rssUrl}
                      </div>
                      {source.siteUrl && (
                        <a
                          href={source.siteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline mt-0.5"
                        >
                          <span>Visitar sitio</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </td>

                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {source.category}
                      </span>
                    </td>

                    <td className="p-3.5 text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        <span>{source.regionOrCity}</span>
                      </div>
                    </td>

                    <td className="p-3.5 text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>Cada {source.updateFrequencyMinutes} min</span>
                      </div>
                    </td>

                    <td className="p-3.5">
                      {source.status === 'ok' ? (
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">Accesible ({source.articlesCount || 20} notas)</span>
                        </div>
                      ) : source.status === 'error' ? (
                        <div className="flex items-center gap-1 text-red-400" title={source.errorMessage}>
                          <XCircle className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate max-w-[140px] text-[11px]">
                            {source.errorMessage || 'Error en canal'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Pendiente</span>
                        </div>
                      )}
                    </td>

                    <td className="p-3.5">
                      <button
                        onClick={() => onUpdateSource(source.id, { active: !source.active })}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                          source.active ? 'bg-blue-600' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out mt-0.5 ${
                            source.active ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>

                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => handleTestExisting(source)}
                        disabled={isTesting}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition cursor-pointer disabled:opacity-50"
                        title="Verificar conexión en vivo con el canal RSS"
                      >
                        {isTesting ? 'Probando...' : 'Probar RSS'}
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar la fuente ${source.name}?`)) {
                            onDeleteSource(source.id);
                          }
                        }}
                        className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition cursor-pointer"
                        title="Eliminar fuente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Incorporar Nuevo Medio */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Agregar Nuevo Portal o Canal RSS</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nombre del Medio o Portal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Diario Época, Radio Dos, El Litoral, etc."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Dirección URL del Portal
                </label>
                <input
                  type="url"
                  placeholder="https://www.diariolocal.com.ar"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Dirección del Canal RSS *
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    placeholder="https://www.diariolocal.com.ar/feed/"
                    value={rssUrl}
                    onChange={(e) => setRssUrl(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={handleTestInModal}
                    disabled={!rssUrl.trim() || testingUrl === rssUrl}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition cursor-pointer disabled:opacity-50"
                  >
                    {testingUrl === rssUrl ? 'Probando...' : 'Comprobar'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Se comprobará la extracción autorizada sin eludir protecciones del portal.
                </p>
              </div>

              {/* Test feedback */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    testResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span>{testResult.message || (testResult.success ? 'Conexión exitosa' : 'Fallo de extracción')}</span>
                  </div>
                  {testResult.error && <p className="mt-1 text-[11px]">{testResult.error}</p>}
                  {testResult.sampleItems && testResult.sampleItems.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[11px] text-slate-300 space-y-1">
                      <span className="font-bold text-emerald-200">Titulares de muestra:</span>
                      {testResult.sampleItems.map((it: any, i: number) => (
                        <div key={i} className="truncate text-slate-200">
                          • {it.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Región / Localidad</label>
                  <input
                    type="text"
                    value={regionOrCity}
                    onChange={(e) => setRegionOrCity(e.target.value)}
                    placeholder="Corrientes Capital e Interior, Litoral, etc."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Frecuencia de Actualización
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value={15}>Cada 15 minutos</option>
                  <option value={30}>Cada 30 minutos (Recomendado)</option>
                  <option value={60}>Cada 60 minutos</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : 'Guardar Fuente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
