import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Header } from './components/Header';
import { Navigation, TabId } from './components/Navigation';
import { DashboardTab } from './components/DashboardTab';
import { SourcesTab } from './components/SourcesTab';
import { NewsGatheringTab } from './components/NewsGatheringTab';
import { BulletinEditorTab } from './components/BulletinEditorTab';
import { VoiceStudioTab } from './components/VoiceStudioTab';
import { AudioLibraryTab } from './components/AudioLibraryTab';
import { ScheduleTab } from './components/ScheduleTab';
import { StationSettingsTab } from './components/StationSettingsTab';
import { SystemTestModal } from './components/SystemTestModal';
import { CostMonitorModal } from './components/CostMonitorModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SharedSessionModal } from './components/SharedSessionModal';
import {
  NewsSource,
  NewsItem,
  BulletinDraft,
  BulletinSegment,
  VoiceOption,
  ScheduleConfig,
  StationConfig,
  NewsCategory,
  UsageStats,
  SourceCategoryMix,
} from './types';

// Resilient API Fetch Helper: guarantees valid JSON responses and parses server error messages
async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let message = `Error ${res.status}: ${res.statusText || 'Petición fallida'}`;
    if (contentType.includes('application/json')) {
      try {
        const errJson = await res.json();
        message = errJson.error || errJson.message || message;
      } catch {
        // ignore
      }
    } else {
      try {
        const text = await res.text();
        if (text && !text.includes('<!doctype') && text.length < 200) {
          message = text;
        }
      } catch {
        // ignore
      }
    }
    throw new Error(message);
  }

  if (!contentType.includes('application/json')) {
    const raw = await res.text();
    console.warn(`Unexpected non-JSON response from ${url}:`, raw.slice(0, 100));
    throw new Error('El servidor devolvió una respuesta no válida (formato HTML en lugar de JSON).');
  }

  return res.json() as Promise<T>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedNews, setSelectedNews] = useState<NewsItem[]>([]);
  const [draft, setDraft] = useState<BulletinDraft | null>(null);
  const [bulletins, setBulletins] = useState<BulletinDraft[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isCostModalOpen, setIsCostModalOpen] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success' | 'info' | 'warning'; message: string } | null>(null);

  // Usage & cost stats
  const [usage, setUsage] = useState<UsageStats>({
    audiosGeneratedToday: 0,
    totalAudiosEver: 0,
    charactersSynthesizedToday: 0,
    bulletinsCreatedToday: 0,
    dailyLimit: 20,
    freeTierActive: true,
    estimatedCostUsd: 0.0,
  });

  // Loading flags
  const [isGathering, setIsGathering] = useState<boolean>(false);
  const [isCurating, setIsCurating] = useState<boolean>(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState<boolean>(false);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);

  // Config states: Radio Corrientes Viva
  const [station, setStation] = useState<StationConfig>({
    stationName: 'Radio Corrientes Viva',
    networkName: 'Central de Noticias IA',
    dialFrequency: 'Radio Online',
    slogan: 'La voz del Taragüí con toda la información al instante',
    broadcasterName: 'Juan Carlos Romero y Mariana Fernández',
    cityCountry: 'Corrientes, Argentina',
    openingTemplate:
      'Muy buenos días a toda la provincia de Corrientes y la región del Litoral. En el aire de {EMISORA}, comienza la síntesis informativa de esta hora. Estos son los acontecimientos más relevantes.',
    closingTemplate:
      'Hasta aquí las principales noticias en el resumen de {EMISORA}. Seguí conectado con nosotros a través de nuestra transmisión digital para más actualizaciones. Redacción e informe periodístico continuo.',
    styleTone: 'periodistico',
    defaultVoiceId: 'kore-arg',
    musicBedEnabled: true,
    musicBedVolume: 0.18,
    maxDailyAudios: 20,
  });

  const [schedule, setSchedule] = useState<ScheduleConfig>({
    autoEnabled: false,
    timezone: 'America/Argentina/Buenos_Aires',
    intervalMinutes: 60,
    mode: 'slots',
    autoDraftOnly: true,
    includeCortina: true,
    dailyAudioLimit: 20,
    slots: [],
  });

  const [isSyncingBulletins, setIsSyncingBulletins] = useState<boolean>(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);
  const [lastSessionSyncTime, setLastSessionSyncTime] = useState<string | null>(null);

  // Shared Browser Session ID
  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSession = urlParams.get('session');
      if (urlSession) {
        const clean = urlSession.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
        if (clean) {
          localStorage.setItem('rcv_shared_session_id', clean);
          return clean;
        }
      }
    } catch {
      // ignore
    }

    try {
      const saved = localStorage.getItem('rcv_shared_session_id');
      if (saved) return saved;
    } catch {
      // ignore
    }

    return 'RCV-CENTRAL';
  });

  const handleUpdateSessionId = (newId: string) => {
    const clean = newId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    if (!clean) return;
    setSessionId(clean);
    try {
      localStorage.setItem('rcv_shared_session_id', clean);
      const url = new URL(window.location.href);
      url.searchParams.set('session', clean);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
    syncSharedSession({ forcePull: true, targetSessionId: clean });
  };

  const syncSharedSession = async (options?: { forcePull?: boolean; targetSessionId?: string }) => {
    const targetId = options?.targetSessionId || sessionId;
    setIsSyncingBulletins(true);
    try {
      if (options?.forcePull) {
        const res = await fetch(`/api/session/${targetId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.bulletins)) {
            setBulletins(data.bulletins);
          }
          if (data.activeDraft && !draft) {
            setDraft(data.activeDraft);
          }
          const nowTime = new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setLastSessionSyncTime(`${nowTime} hs`);
        }
      } else {
        const res = await fetch(`/api/session/${targetId}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bulletins,
            activeDraft: draft,
            mergeStrategy: 'merge',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.bulletins)) {
            setBulletins(data.bulletins);
          }
          const nowTime = new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setLastSessionSyncTime(`${nowTime} hs`);
        }
      }
    } catch (err) {
      console.warn('Session sync warning:', err);
    } finally {
      setIsSyncingBulletins(false);
    }
  };

  const handleImportSessionData = async (
    fileData: any,
    mergeStrategy: 'merge' | 'replace'
  ): Promise<{ importedCount: number; totalBulletins: number }> => {
    const res = await fetch(`/api/session/${sessionId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData, mergeStrategy }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al importar los datos en el servidor.');
    }

    const data = await res.json();
    if (Array.isArray(data.bulletins)) {
      setBulletins(data.bulletins);
    }
    if (data.activeDraft) {
      setDraft(data.activeDraft);
    }
    const nowTime = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLastSessionSyncTime(`${nowTime} hs`);

    return {
      importedCount: data.importedCount || 0,
      totalBulletins: data.totalBulletins || data.bulletins?.length || 0,
    };
  };

  const refreshBulletins = async (showNotification = false) => {
    await syncSharedSession({ forcePull: false });
    if (showNotification) {
      setBanner({
        type: 'success',
        message: `Sincronización central de sesión completada.`,
      });
    }
  };

  useEffect(() => {
    fetchInitialData();
    // Pull session state on load
    syncSharedSession({ forcePull: true });

    // Multi-device sync: poll session state every 20 seconds and on window focus/online
    const syncInterval = setInterval(() => {
      syncSharedSession({ forcePull: true });
    }, 20000);

    const onFocusOrOnline = () => {
      syncSharedSession({ forcePull: true });
    };

    window.addEventListener('focus', onFocusOrOnline);
    window.addEventListener('online', onFocusOrOnline);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', onFocusOrOnline);
      window.removeEventListener('online', onFocusOrOnline);
    };
  }, [sessionId]);

  const fetchInitialData = async () => {
    try {
      // 1. Status
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setHasGeminiKey(statusData.hasGeminiKey);
        if (statusData.usage) {
          setUsage(statusData.usage);
        }
      }

      // 2. Sources
      const srcRes = await fetch('/api/sources');
      if (srcRes.ok) {
        setSources(await srcRes.json());
      }

      // 3. News
      const newsRes = await fetch('/api/news');
      if (newsRes.ok) {
        const newsData = await newsRes.json();
        setNews(newsData.items || []);
        if (!newsData.items || newsData.items.length === 0) {
          triggerGather();
        }
      }

      // 4. Bulletins
      const bullRes = await fetch('/api/bulletins');
      if (bullRes.ok) {
        setBulletins(await bullRes.json());
      }

      // 5. Voices
      const voicesRes = await fetch('/api/audio/voices');
      if (voicesRes.ok) {
        setVoices(await voicesRes.json());
      }

      // 6. Station Config
      const stRes = await fetch('/api/station-config');
      if (stRes.ok) {
        setStation(await stRes.json());
      }

      // 7. Schedule
      const schedRes = await fetch('/api/schedule');
      if (schedRes.ok) {
        setSchedule(await schedRes.json());
      }

      // 8. Usage Stats
      const usageRes = await fetch('/api/usage-stats');
      if (usageRes.ok) {
        setUsage(await usageRes.json());
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  // Trigger News Gathering
  const triggerGather = async () => {
    setIsGathering(true);
    try {
      const res = await fetch('/api/gather', { method: 'POST' });
      if (res.ok) {
        const srcRes = await fetch('/api/sources');
        if (srcRes.ok) setSources(await srcRes.json());

        const newsRes = await fetch('/api/news');
        if (newsRes.ok) {
          const newsData = await newsRes.json();
          setNews(newsData.items || []);
        }
      }
    } catch (err) {
      console.error('Gathering error:', err);
    } finally {
      setIsGathering(false);
    }
  };

  // News selection
  const handleToggleSelectNews = (item: NewsItem) => {
    setSelectedNews((prev) => {
      const exists = prev.some((n) => n.id === item.id);
      if (exists) {
        return prev.filter((n) => n.id !== item.id);
      } else {
        return [...prev, item];
      }
    });
  };

  const handleSelectMultipleNews = (items: NewsItem[]) => {
    setSelectedNews(items);
  };

  const handleClearSelection = () => {
    setSelectedNews([]);
  };

  // Review sensitive news (policiales / salud)
  const handleReviewNews = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/news/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNews((prev) => prev.map((n) => (n.id === id ? updated : n)));
      }
    } catch (e) {
      console.error('Review error:', e);
    }
  };

  // Curate with AI
  const handleCurateWithAi = async (
    period: string,
    count: number,
    categories: NewsCategory[],
    sourceMix?: SourceCategoryMix
  ) => {
    setIsCurating(true);
    setBanner(null);
    try {
      const data = await safeFetchJson<{
        curatedItems: NewsItem[];
        totalCandidates: number;
        method: string;
      }>('/api/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, count, categories, sourceMix }),
      });

      if (data.curatedItems && data.curatedItems.length > 0) {
        setSelectedNews(data.curatedItems);
        setBanner({
          type: 'success',
          message: `Selección periodística completada: ${data.curatedItems.length} noticias seleccionadas según las pautas de fuentes y secciones.`,
        });
      }
    } catch (err: any) {
      console.log('AI Curate fallback activating:', err?.message);
      // Local journalistic curation fallback respecting sourceMix
      let pool = news;
      if (sourceMix && Object.keys(sourceMix).length > 0) {
        const activeMix = Object.entries(sourceMix).filter(([_, cats]) => cats.length > 0);
        if (activeMix.length > 0) {
          const matched = news.filter((item) =>
            activeMix.some(([srcKey, cats]) => {
              const srcKeyLower = srcKey.toLowerCase();
              const match =
                item.sourceId === srcKey ||
                item.sourceName.toLowerCase() === srcKeyLower ||
                item.sourceName.toLowerCase().includes(srcKeyLower) ||
                item.sourceId.toLowerCase().includes(srcKeyLower);
              return match && cats.includes(item.category);
            })
          );
          if (matched.length > 0) pool = matched;
        }
      } else if (categories.length > 0) {
        const catMatched = news.filter((n) => categories.includes(n.category));
        if (catMatched.length > 0) pool = catMatched;
      }

      const sorted = [...pool].sort((a, b) => {
        const aIsLocal = a.category === 'Noticias Locales' || a.category === 'Noticias Regionales' ? 1 : 0;
        const bIsLocal = b.category === 'Noticias Locales' || b.category === 'Noticias Regionales' ? 1 : 0;
        if (aIsLocal !== bIsLocal) return bIsLocal - aIsLocal;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });
      const selected = sorted.slice(0, count);
      if (selected.length > 0) {
        setSelectedNews(selected);
        setBanner({
          type: 'success',
          message: `Selección periodística completada: ${selected.length} noticias priorizadas para el boletín.`,
        });
      } else {
        setBanner({
          type: 'warning',
          message: 'No se encontraron noticias disponibles en este momento. Intenta actualizar fuentes.',
        });
      }
    } finally {
      setIsCurating(false);
    }
  };

  // Generate Script Draft
  const handleGenerateDraft = async (customOpening?: string, customClosing?: string) => {
    const toProcess = selectedNews.length > 0 ? selectedNews : news.slice(0, 5);
    if (toProcess.length === 0) {
      setBanner({
        type: 'info',
        message: 'No hay noticias seleccionadas para generar el boletín. Selecciona al menos una noticia.',
      });
      return;
    }

    setIsGeneratingDraft(true);
    setBanner(null);
    try {
      const newDraft = await safeFetchJson<BulletinDraft>('/api/bulletin/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItems: toProcess,
          timePeriod: 'Resumen Radial Radio Corrientes Viva',
          customOpening,
          customClosing,
        }),
      });

      setDraft(newDraft);
      setBulletins((prev) => [newDraft, ...prev.filter((b) => b.id !== newDraft.id)]);
      setActiveTab('bulletin');
      const newsCount = newDraft.segments?.filter((s) => s.type === 'noticia').length || 0;
      setBanner({
        type: 'success',
        message: `¡Borrador generado con éxito! ${newsCount} noticias estructuradas para el boletín final de Radio Corrientes Viva.`,
      });

      // Refresh usage safely
      try {
        const usageData = await safeFetchJson<UsageStats>('/api/usage-stats');
        setUsage(usageData);
      } catch {
        // non-critical
      }
    } catch (err: any) {
      console.log('[Scriptwriting Engine] Activating institutional radio editorial fallback:', err.message);

      const stationIntro =
        customOpening ||
        station.openingTemplate.replace('{EMISORA}', station.stationName);
      const stationOutro =
        customClosing ||
        station.closingTemplate.replace('{EMISORA}', station.stationName);

      const fallbackSegments: BulletinSegment[] = [
        {
          id: 'seg-apertura',
          type: 'apertura',
          title: 'Apertura Institucional',
          text: stationIntro,
        },
      ];

      toProcess.forEach((n, idx) => {
        fallbackSegments.push({
          id: `seg-trans-${idx}`,
          type: 'transicion',
          text: idx === 0 ? 'Iniciamos con el informe más relevante de la jornada.' : 'En otra de las noticias importantes de la región,',
        });
        fallbackSegments.push({
          id: `seg-news-${idx}`,
          type: 'noticia',
          title: n.title,
          category: n.category,
          text: `${n.title}. ${n.summary}`,
          sourceAttribution: `Informe periodístico de ${n.sourceName}`,
          sourceUrl: n.originalUrl,
          requiresReview: n.requiresHumanReview,
          isApproved: true,
        });
      });

      fallbackSegments.push({
        id: 'seg-cierre',
        type: 'cierre',
        title: 'Cierre Institucional',
        text: stationOutro,
      });

      const fullScript = fallbackSegments.map((s) => s.text).join('\n\n');
      const fallbackDraft: BulletinDraft = {
        id: 'draft-' + Date.now(),
        title: `Boletín Informativo - ${station.stationName}`,
        stationName: station.stationName,
        createdAt: new Date().toISOString(),
        timePeriod: 'Resumen Radial Radio Corrientes Viva',
        segments: fallbackSegments,
        fullScript,
        selectedNewsCount: toProcess.length,
        sourcesUsed: Array.from(new Set(toProcess.map((n) => n.sourceName))),
        status: 'draft',
        fileFormat: 'mp3',
      };

      setDraft(fallbackDraft);
      setBulletins((prev) => [fallbackDraft, ...prev.filter((b) => b.id !== fallbackDraft.id)]);
      setActiveTab('bulletin');
      setBanner({
        type: 'success',
        message: `¡Borrador generado con éxito! ${fallbackSegments.length} bloques estructurados listos para locución.`,
      });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Synthesize Full Audio MP3
  const handleSynthesizeAudio = async (
    scriptText: string,
    voiceId: string,
    speed: number,
    pitch: number,
    includeCortina: boolean
  ): Promise<{
    audioUrl: string;
    durationSeconds: number;
    filename: string;
    format: string;
    fileSizeKb?: number;
  }> => {
    setIsSynthesizing(true);
    setBanner(null);
    try {
      const data = await safeFetchJson<{
        success: boolean;
        audioUrl: string;
        filename: string;
        durationSeconds: number;
        voiceName: string;
        format: string;
        fileSizeKb?: number;
      }>('/api/audio/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draft?.id || 'rcv-' + Date.now(),
          voiceId,
          scriptText,
          speed,
          pitch,
          includeCortina: station.musicBedEnabled !== false && includeCortina !== false,
          selectedCurtainId: station.selectedCurtainId || 'curtain-rcv-institucional',
          customCurtainUrl: station.customCurtainUrl,
          musicBedVolume: station.musicBedVolume ?? 0.45,
          musicBedDuckingVolume: station.musicBedDuckingVolume ?? 0.14,
          format: 'mp3',
        }),
      });

      if (draft) {
        const updated = {
          ...draft,
          audioUrl: data.audioUrl,
          audioDurationSeconds: data.durationSeconds,
          voiceId,
          voiceName: data.voiceName,
          status: 'synthesized' as const,
          fileFormat: 'mp3' as const,
        };
        setDraft(updated);
        await handleSaveBulletin(updated);
      }

      setBanner({
        type: 'success',
        message: '¡Audio MP3 producido exitosamente! Ya está listo en el reproductor y en la Biblioteca.',
      });

      // Refresh usage stats
      try {
        const usageData = await safeFetchJson<UsageStats>('/api/usage-stats');
        setUsage(usageData);
      } catch {
        // non-critical
      }

      return data;
    } catch (err: any) {
      console.log('Synthesize result:', err?.message);
      const isQuota = err.message?.includes('cuota') || err.message?.includes('429');
      setBanner({
        type: isQuota ? 'warning' : 'error',
        message: err.message || 'Error al generar el audio MP3',
      });
      throw err;
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Save Bulletin to Library
  const handleSaveBulletin = async (b: BulletinDraft) => {
    try {
      const res = await fetch('/api/bulletins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      if (res.ok) {
        const saved = await res.json();
        setBulletins((prev) => {
          const index = prev.findIndex((item) => item.id === saved.id);
          if (index >= 0) {
            const copy = [...prev];
            copy[index] = saved;
            return copy;
          }
          return [saved, ...prev];
        });
      }
    } catch (err) {
      console.error('Error saving bulletin:', err);
    }
  };

  // Delete Bulletin
  const handleDeleteBulletin = async (id: string) => {
    try {
      await fetch(`/api/bulletins/${id}`, { method: 'DELETE' });
      setBulletins((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Error deleting bulletin:', err);
    }
  };

  const handleLoadBulletinForEdit = (b: BulletinDraft) => {
    setDraft(b);
    setActiveTab('bulletin');
  };

  const handleProceedToVoiceStudio = (b: BulletinDraft) => {
    setDraft(b);
    setActiveTab('voice-studio');
  };

  // Sources handlers
  const handleAddSource = async (src: Omit<NewsSource, 'id'>) => {
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(src),
    });
    if (res.ok) {
      const created = await res.json();
      setSources((prev) => [...prev, created]);
    }
  };

  const handleUpdateSource = async (id: string, updates: Partial<NewsSource>) => {
    const res = await fetch(`/api/sources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
    }
  };

  const handleDeleteSource = async (id: string) => {
    await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleTestFeed = async (rssUrl: string) => {
    const res = await fetch('/api/sources/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rssUrl }),
    });
    return await res.json();
  };

  // Save Station
  const handleSaveStation = async (updated: StationConfig) => {
    const res = await fetch('/api/station-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setStation(await res.json());
    }
  };

  // Quick partial update for music bed, ducking, and station presets
  const handleUpdateStationPartial = (partial: Partial<StationConfig>) => {
    setStation((prev) => {
      const next = { ...prev, ...partial };
      fetch('/api/station-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch((err) => console.warn('Error syncing station config:', err));
      return next;
    });
  };

  // Save Schedule
  const handleSaveSchedule = async (updated: ScheduleConfig) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setSchedule(await res.json());
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Offline Alert Indicator */}
      <OfflineIndicator />

      {/* Header */}
      <Header
        station={station}
        hasGeminiKey={hasGeminiKey}
        onOpenTestModal={() => setIsTestModalOpen(true)}
        onOpenCostModal={() => setIsCostModalOpen(true)}
        onOpenSessionModal={() => setIsSessionModalOpen(true)}
        sessionId={sessionId}
        activeTab={activeTab}
      />

      {/* Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        selectedNewsCount={selectedNews.length}
        audioReady={Boolean(draft?.audioUrl)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* PWA Mobile & Desktop Install Prompt Banner */}
        <div className="mb-4">
          <PWAInstallButton variant="banner" />
        </div>
        {banner && (
          <div
            className={`mb-6 p-4 rounded-xl border flex items-start justify-between gap-3 shadow-lg transition-all animate-fadeIn ${
              banner.type === 'error'
                ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                : banner.type === 'warning'
                ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                : banner.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                : 'bg-cyan-950/40 border-cyan-800 text-cyan-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {banner.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : banner.type === 'warning' ? (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : banner.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium">{banner.message}</div>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            sources={sources}
            news={news}
            selectedNews={selectedNews}
            bulletins={bulletins}
            schedule={schedule}
            station={station}
            usage={usage}
            hasGeminiKey={hasGeminiKey}
            onNavigate={setActiveTab}
            onGatherNews={triggerGather}
            isGathering={isGathering}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesTab
            sources={sources}
            onAddSource={handleAddSource}
            onUpdateSource={handleUpdateSource}
            onDeleteSource={handleDeleteSource}
            onTestFeed={handleTestFeed}
            onGatherNews={triggerGather}
            isGathering={isGathering}
          />
        )}

        {activeTab === 'news' && (
          <NewsGatheringTab
            news={news}
            sources={sources}
            selectedNews={selectedNews}
            onToggleSelect={handleToggleSelectNews}
            onSelectMultiple={handleSelectMultipleNews}
            onClearSelection={handleClearSelection}
            onGatherNews={triggerGather}
            isGathering={isGathering}
            onCurateWithAi={handleCurateWithAi}
            isCurating={isCurating}
            onProceedToBulletin={() => handleGenerateDraft()}
            onReviewNews={handleReviewNews}
          />
        )}

        {activeTab === 'bulletin' && (
          <BulletinEditorTab
            draft={draft}
            selectedNews={selectedNews}
            station={station}
            onGenerateDraft={handleGenerateDraft}
            isGenerating={isGeneratingDraft}
            onUpdateDraft={setDraft}
            onSaveBulletin={handleSaveBulletin}
            onProceedToVoiceStudio={() => setActiveTab('voice-studio')}
          />
        )}

        {activeTab === 'voice-studio' && (
          <VoiceStudioTab
            draft={draft}
            voices={voices}
            station={station}
            onUpdateStation={handleUpdateStationPartial}
            onSynthesizeAudio={handleSynthesizeAudio}
            isSynthesizing={isSynthesizing}
            onSaveToLibrary={handleSaveBulletin}
            onProceedToLibrary={() => setActiveTab('library')}
          />
        )}

        {activeTab === 'library' && (
          <AudioLibraryTab
            bulletins={bulletins}
            onLoadBulletinForEdit={handleLoadBulletinForEdit}
            onProceedToVoiceStudio={handleProceedToVoiceStudio}
            onDeleteBulletin={handleDeleteBulletin}
            onRefreshBulletins={refreshBulletins}
            onOpenSessionModal={() => setIsSessionModalOpen(true)}
            sessionId={sessionId}
            isSyncing={isSyncingBulletins}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleTab
            schedule={schedule}
            voices={voices}
            onSaveSchedule={handleSaveSchedule}
          />
        )}

        {activeTab === 'station' && (
          <StationSettingsTab
            station={station}
            voices={voices}
            hasGeminiKey={hasGeminiKey}
            onSaveStation={handleSaveStation}
          />
        )}
      </main>

      {/* Cost & Limits Monitor Modal */}
      <CostMonitorModal
        isOpen={isCostModalOpen}
        onClose={() => setIsCostModalOpen(false)}
        stats={usage}
        maxDailyAudios={station.maxDailyAudios || 20}
      />

      {/* System Test 9-Step Verification Modal */}
      <SystemTestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />

      {/* Shared Session State Sync & Local JSON Export/Import Modal */}
      <SharedSessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        sessionId={sessionId}
        onChangeSessionId={handleUpdateSessionId}
        bulletins={bulletins}
        activeDraft={draft}
        onSyncSession={syncSharedSession}
        onImportSessionData={handleImportSessionData}
        isSyncing={isSyncingBulletins}
        lastSyncTime={lastSessionSyncTime}
      />

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400">RADIO CORRIENTES VIVA</span>
            <span>•</span>
            <span className="text-slate-400">Central de Noticias IA</span>
            <span>•</span>
            <span>Producción Periodística Automatizada y Emisión Radial</span>
          </div>
          <div>
            Zona horaria de referencia: <strong className="text-slate-300">Corrientes (UTC-3)</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}
