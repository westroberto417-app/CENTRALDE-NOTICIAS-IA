import React, { useState } from 'react';
import {
  Music,
  Upload,
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Sliders,
  CheckCircle2,
  FileAudio,
  Headphones,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { MusicCurtain, StationConfig } from '../types';
import { PRESET_CURTAINS, useAudioDuckingPlayer } from '../hooks/useAudioDuckingPlayer';
import { audioBufferToWavBlob } from '../utils/audioUtils';

interface BackgroundMusicDuckingControlProps {
  station: StationConfig;
  onUpdateStation?: (updated: Partial<StationConfig>) => void;
  compact?: boolean;
}

export const BackgroundMusicDuckingControl: React.FC<BackgroundMusicDuckingControlProps> = ({
  station,
  onUpdateStation,
  compact = false,
}) => {
  const [selectedCurtain, setSelectedCurtain] = useState<string>(
    station.selectedCurtainId || 'curtain-rcv-institucional'
  );
  const [isEnabled, setIsEnabled] = useState<boolean>(station.musicBedEnabled ?? true);
  const [baseVol, setBaseVol] = useState<number>(station.musicBedVolume || 0.45);
  const [duckingVol, setDuckingVol] = useState<number>(
    station.musicBedDuckingVolume || 0.14
  );
  const [customFileUrl, setCustomFileUrl] = useState<string | null>(
    station.customCurtainUrl || null
  );
  const [customFileName, setCustomFileName] = useState<string>(
    station.customCurtainName || ''
  );
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Hook for testing ducking in real-time and individual preset previews
  const {
    isPlaying,
    isDucking,
    previewingCurtainId,
    previewPreset,
    previewCustom,
    testDucking,
    stop,
  } = useAudioDuckingPlayer({
    selectedCurtainId: selectedCurtain,
    customCurtainUrl: customFileUrl,
    baseVolume: baseVol,
    duckingVolume: duckingVol,
    duckingEnabled: isEnabled,
  });

  const handleToggle = (checked: boolean) => {
    setIsEnabled(checked);
    if (!checked) stop();
    onUpdateStation?.({ musicBedEnabled: checked });
  };

  const handleSelectPreset = (id: string) => {
    setSelectedCurtain(id);
    setCustomFileUrl(null);
    setCustomFileName('');
    previewPreset(id, 4); // Immediately plays 4s of this curtain so the user hears it works!
    onUpdateStation?.({
      selectedCurtainId: id,
      customCurtainUrl: undefined,
      customCurtainName: undefined,
    });
  };

  const handleClearCustomCurtain = () => {
    stop();
    setCustomFileUrl(null);
    setCustomFileName('');
    setSelectedCurtain('curtain-rcv-institucional');
    onUpdateStation?.({
      selectedCurtainId: 'curtain-rcv-institucional',
      customCurtainUrl: undefined,
      customCurtainName: undefined,
    });
  };

  const handleBaseVolChange = (val: number) => {
    setBaseVol(val);
    onUpdateStation?.({ musicBedVolume: val });
  };

  const handleDuckingVolChange = (val: number) => {
    setDuckingVol(val);
    onUpdateStation?.({ musicBedDuckingVolume: val });
  };

  // Handle custom audio file upload from Computer or Android device (MP3, WAV, AAC, OGG)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecoding(true);
    setUploadError(null);
    stop();

    try {
      // Decode audio in browser: native Web Audio decoder handles MP3, WAV, AAC, OGG, M4A
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Convert decoded PCM to a standard RIFF WAV Blob
      const wavBlob = audioBufferToWavBlob(decodedBuffer);
      audioCtx.close();

      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          // Upload to server endpoint so both server and browser share the exact same file
          const res = await fetch('/api/audio/upload-curtain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioData: base64Data,
              filename: file.name.replace(/\.[^/.]+$/, '') + '.wav',
            }),
          });

          if (!res.ok) {
            throw new Error('Error al registrar cortina en el servidor');
          }

          const data = await res.json();
          setCustomFileUrl(data.curtainUrl);
          setCustomFileName(file.name);
          setSelectedCurtain('custom-uploaded');
          setUploadSuccess(true);
          setTimeout(() => setUploadSuccess(false), 3500);

          onUpdateStation?.({
            selectedCurtainId: 'custom-uploaded',
            customCurtainUrl: data.curtainUrl,
            customCurtainName: file.name,
          });

          // Play preview of the uploaded curtain
          previewCustom(data.curtainUrl);
        } catch (postErr: any) {
          console.error(postErr);
          setUploadError(postErr.message || 'Error al guardar');
        } finally {
          setIsDecoding(false);
        }
      };
      reader.readAsDataURL(wavBlob);
    } catch (decodeErr: any) {
      console.warn('Browser decode fallback to direct upload:', decodeErr);
      // Fallback: direct base64 upload
      const fallbackReader = new FileReader();
      fallbackReader.onload = async () => {
        const rawData = fallbackReader.result as string;
        try {
          const res = await fetch('/api/audio/upload-curtain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioData: rawData,
              filename: file.name,
            }),
          });
          const data = await res.json();
          setCustomFileUrl(data.curtainUrl);
          setCustomFileName(file.name);
          setSelectedCurtain('custom-uploaded');
          setUploadSuccess(true);
          onUpdateStation?.({
            selectedCurtainId: 'custom-uploaded',
            customCurtainUrl: data.curtainUrl,
            customCurtainName: file.name,
          });
          previewCustom(data.curtainUrl);
        } catch (err: any) {
          setUploadError(err.message || 'Error al procesar archivo');
        } finally {
          setIsDecoding(false);
        }
      };
      fallbackReader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Música de Fondo Manual y Atenuación Ducking</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                Efecto Radiofónico
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              La música de fondo baja automáticamente su volumen (ducking) cuando la voz habla y sube en las pausas.
            </p>
          </div>
        </div>

        {/* Master Toggle */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          <span className="ml-2 text-xs font-semibold text-slate-300">
            {isEnabled ? 'Cortina Activa' : 'Desactivada'}
          </span>
        </label>
      </div>

      {isEnabled && (
        <div className="space-y-4">
          {/* Curtain Presets Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300">
                Seleccionar Cortina Musical Radiofónica:
              </label>
              <span className="text-[11px] text-slate-400">
                Haz clic para activar y escuchar cada opción
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {PRESET_CURTAINS.map((curtain) => {
                const isSelected = selectedCurtain === curtain.id && !customFileUrl;
                const isThisPreviewing = previewingCurtainId === curtain.id;

                return (
                  <div
                    key={curtain.id}
                    onClick={() => handleSelectPreset(curtain.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 text-white shadow-sm ring-1 ring-amber-400/40'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between font-bold text-white mb-1">
                        <span className="truncate pr-1">{curtain.name}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                        {curtain.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-amber-300/80 bg-slate-900 px-1.5 py-0.5 rounded">
                        {curtain.genre}
                      </span>

                      {/* Direct Preview Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isThisPreviewing) {
                            stop();
                          } else {
                            previewPreset(curtain.id, 5);
                          }
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                          isThisPreviewing
                            ? 'bg-rose-600 text-white animate-pulse'
                            : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300'
                        }`}
                      >
                        {isThisPreviewing ? (
                          <Square className="w-3 h-3 fill-current" />
                        ) : (
                          <Play className="w-3 h-3 fill-current" />
                        )}
                        <span>{isThisPreviewing ? 'Detener' : 'Escuchar'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manual File Upload from PC or Android Device */}
          <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-cyan-400" />
                <span>Incorporar Archivo de Música Propio (MP3 / WAV / AAC / OGG):</span>
              </span>
              {customFileUrl && (
                <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tu Audio Propio está Activo</span>
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-md shadow-blue-600/20">
                {isDecoding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileAudio className="w-4 h-4" />
                )}
                <span>
                  {isDecoding
                    ? 'Procesando y Subiendo Audio...'
                    : 'Subir Audio desde Computadora o Celular'}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  disabled={isDecoding}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {customFileName && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-cyan-300 font-mono bg-cyan-950/60 border border-cyan-800 px-2.5 py-1 rounded-lg truncate max-w-xs">
                    🎵 {customFileName}
                  </span>

                  {/* Play custom preview button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (previewingCurtainId === 'custom-uploaded') {
                        stop();
                      } else {
                        previewCustom(customFileUrl || undefined);
                      }
                    }}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      previewingCurtainId === 'custom-uploaded'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {previewingCurtainId === 'custom-uploaded' ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>
                      {previewingCurtainId === 'custom-uploaded'
                        ? 'Detener'
                        : 'Escuchar Audio Subido'}
                    </span>
                  </button>

                  {/* Revert to presets */}
                  <button
                    type="button"
                    onClick={handleClearCustomCurtain}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 px-2 py-1 transition cursor-pointer"
                    title="Quitar archivo subido y volver a cortinas predefinidas"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Volver a Presets</span>
                  </button>
                </div>
              )}
            </div>

            {uploadSuccess && (
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4" />
                <span>¡Audio propio decodificado y configurado como fondo con ducking!</span>
              </div>
            )}

            {uploadError && (
              <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Sliders for Volume & Ducking */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
            {/* Normal Volume */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span>Volumen de Cortina Normal (Intro / Cierre / Pausas)</span>
                </span>
                <span className="font-mono text-amber-400 font-bold">
                  {Math.round(baseVol * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.10"
                max="1.0"
                step="0.05"
                value={baseVol}
                onChange={(e) => handleBaseVolChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <p className="text-[10px] text-slate-500">
                Volumen cuando la voz NO está hablando o durante el saludo inicial.
              </p>
            </div>

            {/* Ducking Volume */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Volumen Atenuado Ducking (mientras la Voz Habla)</span>
                </span>
                <span className="font-mono text-cyan-400 font-bold">
                  {Math.round(duckingVol * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.40"
                step="0.02"
                value={duckingVol}
                onChange={(e) => handleDuckingVolChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <p className="text-[10px] text-slate-500">
                Nivel al que baja automáticamente la música cuando el locutor habla para no tapar la voz.
              </p>
            </div>
          </div>

          {/* Interactive Test & Live Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Estado en vivo:</span>
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 ${
                  isDucking
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                    : isPlaying
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isDucking
                  ? '⚡ Ducking Activo (Música al 14% bajo la voz)'
                  : isPlaying
                  ? '🎵 Música Plena (Apertura / Pausa / Cierre)'
                  : 'En espera'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={isPlaying ? stop : testDucking}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-md ${
                  isPlaying
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/25'
                }`}
              >
                {isPlaying ? (
                  <Square className="w-4 h-4 fill-current" />
                ) : (
                  <Headphones className="w-4 h-4" />
                )}
                <span>
                  {isPlaying
                    ? 'Detener Simulación'
                    : '🎧 Probar Efecto Ducking (8s de Simulación)'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
