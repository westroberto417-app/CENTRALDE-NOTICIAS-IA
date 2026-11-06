import React, { useState, useRef, useEffect } from 'react';
import {
  Mic2,
  Play,
  Pause,
  Square,
  RotateCcw,
  Download,
  Sparkles,
  Sliders,
  Music,
  CheckCircle,
  Volume2,
  VolumeX,
  FileAudio,
  Radio,
  BookmarkPlus,
  Layers,
  ArrowRight,
  Headphones,
  Check,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { VoiceOption, BulletinDraft, BulletinSegment, StationConfig } from '../types';
import { BackgroundMusicDuckingControl } from './BackgroundMusicDuckingControl';
import { useAudioDuckingPlayer } from '../hooks/useAudioDuckingPlayer';
import {
  createRadioSoundBed,
  audioBufferToWavBlob,
  mixVoiceAndBumper,
  triggerDownload,
  speakWithWebSpeech,
} from '../utils/audioUtils';

interface VoiceStudioTabProps {
  draft: BulletinDraft | null;
  voices: VoiceOption[];
  station: StationConfig;
  onUpdateStation?: (updated: Partial<StationConfig>) => void;
  onSynthesizeAudio: (
    scriptText: string,
    voiceId: string,
    speed: number,
    pitch: number,
    includeCortina: boolean
  ) => Promise<{ audioUrl: string; durationSeconds: number; filename: string; format: string; fileSizeKb?: number }>;
  isSynthesizing: boolean;
  onSaveToLibrary: (bulletin: BulletinDraft) => Promise<void>;
  onProceedToLibrary: () => void;
}

export const VoiceStudioTab: React.FC<VoiceStudioTabProps> = ({
  draft,
  voices,
  station,
  onUpdateStation,
  onSynthesizeAudio,
  isSynthesizing,
  onSaveToLibrary,
  onProceedToLibrary,
}) => {
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    station.defaultVoiceId || (voices[0]?.id || 'kore-arg')
  );
  const [readingSpeed, setReadingSpeed] = useState<number>(1.0);
  const [readingPitch, setReadingPitch] = useState<number>(1.0);
  const [locutionTone, setLocutionTone] = useState<'periodistico' | 'informativo' | 'cordial' | 'dinamico'>(
    station.styleTone || 'periodistico'
  );
  const [includeCortina, setIncludeCortina] = useState<boolean>(station.musicBedEnabled ?? true);
  const [cortinaVolume, setCortinaVolume] = useState<number>(station.musicBedVolume || 0.45);

  // Player state
  const [audioUrl, setAudioUrl] = useState<string | null>(draft?.audioUrl || null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(draft?.audioDurationSeconds || 0);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [fileDetails, setFileDetails] = useState<{ filename: string; sizeKb?: number } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Browser speech preview state
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState<boolean>(false);
  const browserUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Real-time Audio Ducking Player (plays voice and background music with automatic ducking)
  const duckingPlayer = useAudioDuckingPlayer({
    voiceAudioUrl: audioUrl,
    selectedCurtainId: station.selectedCurtainId,
    customCurtainUrl: station.customCurtainUrl,
    baseVolume: station.musicBedVolume || 0.45,
    duckingVolume: station.musicBedDuckingVolume || 0.14,
    duckingEnabled: station.musicBedEnabled,
  });

  useEffect(() => {
    if (draft?.audioUrl) {
      setAudioUrl(draft.audioUrl);
      if (draft.audioDurationSeconds) {
        setDuration(draft.audioDurationSeconds);
      }
    }
  }, [draft]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const togglePlayPause = () => {
    if (!audioUrl || !audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => console.log('Playback error:', err));
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Browser Speech Preview (SpeechSynthesis - 0 cost)
  const handleBrowserPreview = () => {
    if (isBrowserSpeaking) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      duckingPlayer.stop();
      setIsBrowserSpeaking(false);
      return;
    }

    const textToSpeak =
      draft?.fullScript?.trim() ||
      draft?.segments?.map((s) => s.text).filter(Boolean).join('\n\n') ||
      '';

    if (!textToSpeak) return;

    setIsBrowserSpeaking(true);
    if (station.musicBedEnabled) {
      duckingPlayer.play();
    }
    const utterance = speakWithWebSpeech(textToSpeak, {
      rate: readingSpeed,
      pitch: readingPitch,
      onEnd: () => {
        setIsBrowserSpeaking(false);
        duckingPlayer.stop();
      },
    });
    browserUtteranceRef.current = utterance;
  };

  // Generate Real MP3 via Gemini 3.8 Flash-Lite TTS + server lamejs
  const handleGenerateMp3 = async () => {
    if (!draft) return;
    setGenerateError(null);
    setStatusNotice(null);

    if (isBrowserSpeaking) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      duckingPlayer.stop();
      setIsBrowserSpeaking(false);
    }

    const textToSynthesize =
      draft.fullScript?.trim() ||
      draft.segments?.map((s) => s.text).filter(Boolean).join('\n\n') ||
      '';

    if (!textToSynthesize) {
      setGenerateError(
        'El borrador no contiene texto para sintetizar. Regresa a la pestaña "Boletín" para redactar o estructurar las noticias.'
      );
      return;
    }

    try {
      const result = await onSynthesizeAudio(
        textToSynthesize,
        selectedVoiceId,
        readingSpeed,
        readingPitch,
        includeCortina
      );

      setAudioUrl(result.audioUrl);
      setDuration(result.durationSeconds);
      setFileDetails({ filename: result.filename, sizeKb: result.fileSizeKb });
      setIsPlaying(false);

      if ((result as any)?.isAssistedBed) {
        setStatusNotice(
          'Banda sonora MP3 generada con la cortina musical y ducking para Radio Corrientes Viva. Para salida en vivo puedes sincronizar la lectura con "Vista Previa (Navegador)".'
        );
      }
    } catch (err: any) {
      console.error('Error generating MP3:', err);
      setGenerateError(err?.message || 'Error al procesar y codificar el archivo MP3.');
    }
  };

  // Save to Library
  const handleSaveProduction = async () => {
    if (!draft) return;
    const voice = voices.find((v) => v.id === selectedVoiceId);
    const updatedDraft: BulletinDraft = {
      ...draft,
      audioUrl: audioUrl || undefined,
      audioDurationSeconds: Math.round(duration),
      voiceId: selectedVoiceId,
      voiceName: voice?.name,
      status: 'synthesized',
      fileFormat: 'mp3',
      musicBed: includeCortina,
    };

    await onSaveToLibrary(updatedDraft);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const selectedVoice = voices.find((v) => v.id === selectedVoiceId) || voices[0];

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-2">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>{station.stationName} • Locución y Posproducción MP3</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Estudio de Audio y Conversión MP3
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Motor de voz natural en español con <strong>Gemini 3.8 Flash-Lite TTS</strong> y codificación real a archivo <strong>MP3 (128 kbps)</strong> para salida radial.
          </p>
        </div>

        {/* Action Dual Buttons: Free Browser Preview vs Full AI MP3 Generation */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleBrowserPreview}
            disabled={!draft}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
              isBrowserSpeaking
                ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Escuchar lectura nativa del navegador sin consumir créditos"
          >
            {isBrowserSpeaking ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isBrowserSpeaking ? 'Pausar Vista Previa' : 'Vista Previa (Navegador)'}</span>
          </button>

          <button
            onClick={handleGenerateMp3}
            disabled={isSynthesizing || !draft}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-blue-500/30 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isSynthesizing ? 'animate-spin' : ''}`} />
            <span>{isSynthesizing ? 'Codificando MP3...' : 'Generar Audio MP3'}</span>
          </button>
        </div>
      </div>

      {/* Generation Error Alert */}
      {generateError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-lg">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-rose-200 block font-bold">Aviso en Generación de Audio:</strong>
              <p className="text-rose-300/90 text-[11px] mt-0.5">{generateError}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              onClick={handleBrowserPreview}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition cursor-pointer"
            >
              Usar Locución del Navegador
            </button>
            <button
              onClick={handleGenerateMp3}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Status Notice */}
      {statusNotice && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs shadow-lg">
          <div className="flex items-center gap-2 text-cyan-200 text-xs">
            <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{statusNotice}</span>
          </div>
          <button
            onClick={() => setStatusNotice(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
          <Volume2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-200">1. Vista Previa de Lectura (Navegador):</span>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Utiliza el sintetizador local de tu navegador. Es 100% gratuita y sirve para verificar el texto y la entonación sin consumir solicitudes de IA.
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
          <FileAudio className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-200">2. Generación Definitiva en MP3 (Gemini TTS):</span>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Genera la voz profesional con Gemini 3.8 y la convierte a archivo MP3 real listo para descargar y emitir en la radio.
            </p>
          </div>
        </div>
      </div>

      {/* Voice Selection Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Headphones className="w-4 h-4 text-cyan-400" />
            <span>Voces Naturales Compatibles con Gemini 3.8</span>
          </h3>
          <span className="text-xs text-slate-400">
            Voz seleccionada: <strong className="text-white">{selectedVoice?.name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {voices.map((voice) => {
            const isSelected = selectedVoiceId === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => setSelectedVoiceId(voice.id)}
                className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-gradient-to-br from-blue-950/60 to-slate-900 border-cyan-500 ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-500/10'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-inner ${
                          voice.gender === 'femenino'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        {voice.gender === 'femenino' ? 'FEM' : 'MASC'}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition">
                          {voice.name}
                        </h4>
                        <span className="text-[10px] text-slate-400 block">{voice.accent}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="p-1 rounded-full bg-cyan-500 text-slate-950">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed">
                    {voice.styleDescription}
                  </p>

                  <div className="mt-2 text-[10px] text-cyan-400 font-medium">
                    Recomendada para: {voice.recommendedFor}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">Voz oficial {voice.geminiVoice}</span>
                  <span className="text-emerald-400 font-semibold">Disponible en TTS</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Locution Delivery & Cortina Musical Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sliders */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              <span>Controles de Locución y Velocidad</span>
            </h3>
            <button
              onClick={() => {
                setReadingSpeed(1.0);
                setReadingPitch(1.0);
              }}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restablecer</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Velocidad de Lectura</span>
              <span className="font-mono font-bold text-white">{readingSpeed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.3"
              step="0.05"
              value={readingSpeed}
              onChange={(e) => setReadingSpeed(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0.8x (Solemne)</span>
              <span>1.0x (Estándar Radio)</span>
              <span>1.3x (Flash urgente)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Tono y Entonación Periodística</span>
              <span className="font-mono font-bold text-white">{readingPitch.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.85"
              max="1.15"
              step="0.05"
              value={readingPitch}
              onChange={(e) => setReadingPitch(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">Estilo de Locución</label>
            <select
              value={locutionTone}
              onChange={(e) => setLocutionTone(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="periodistico">Periodístico Objetivo (Estándar Noticiero)</option>
              <option value="informativo">Informativo Sobrio y Riguroso</option>
              <option value="cordial">Cordial y Cercano (Primera Mañana)</option>
              <option value="dinamico">Dinámico y Enérgico (Deportes / Actualidad)</option>
            </select>
          </div>
        </div>

        {/* Cortina Musical Settings with Manual Upload & Audio Ducking */}
        <BackgroundMusicDuckingControl
          station={station}
          onUpdateStation={onUpdateStation}
        />
      </div>

      {/* Main Broadcast MP3 Audio Player */}
      {audioUrl ? (
        <div className="bg-gradient-to-r from-slate-900 via-blue-950/70 to-slate-900 border border-blue-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onLoadedMetadata={() => {
              if (audioRef.current && !isNaN(audioRef.current.duration)) {
                setDuration(audioRef.current.duration);
              }
            }}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Archivo MP3 Codificado y Listo
                </span>
                {station.musicBedEnabled && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Music className="w-3 h-3" />
                    <span>Música de Fondo + Ducking Integrado</span>
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                {draft?.title || 'Boletín Radial - Radio Corrientes Viva'}
              </h3>
              <p className="text-xs text-slate-400">
                Voz: <strong className="text-slate-200">{selectedVoice.name}</strong> • Duración:{' '}
                {formatTime(duration)} • Formato: <strong className="text-emerald-400 uppercase">MP3 (128 kbps)</strong>
              </p>
            </div>

            {/* Save & Download Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveProduction}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
                <span>{savedSuccess ? '¡Guardado!' : 'Guardar en Biblioteca'}</span>
              </button>

              <button
                onClick={() => triggerDownload(audioUrl, `boletin-rcv-${Date.now()}.mp3`)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar MP3</span>
              </button>
            </div>
          </div>

          {/* Player controls */}
          <div className="bg-slate-950/90 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlayPause}
                className="w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-cyan-500/25 transition cursor-pointer flex-shrink-0"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>

              <button
                onClick={handleStop}
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition cursor-pointer flex-shrink-0"
                title="Detener"
              >
                <Square className="w-4 h-4" />
              </button>

              <div className="flex-1 space-y-1">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <FileAudio className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">Audio pendiente de generación</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Puedes escuchar una <strong>Vista Previa (Navegador)</strong> sin costo, o hacer clic en <strong>Generar Audio MP3</strong> para producir el archivo definitivo con Gemini 3.8.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={handleBrowserPreview}
              disabled={!draft}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer"
            >
              Probar Vista Previa Local
            </button>
            <button
              onClick={handleGenerateMp3}
              disabled={isSynthesizing || !draft}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSynthesizing ? 'Generando MP3...' : 'Generar Archivo MP3'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
