import React, { useState } from 'react';
import {
  FileEdit,
  Sparkles,
  Mic2,
  Clock,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  Copy,
  ChevronUp,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { BulletinDraft, BulletinSegment, NewsItem, StationConfig } from '../types';

interface BulletinEditorTabProps {
  draft: BulletinDraft | null;
  selectedNews: NewsItem[];
  station: StationConfig;
  onGenerateDraft: (customOpening?: string, customClosing?: string) => Promise<void>;
  isGenerating: boolean;
  onUpdateDraft: (draft: BulletinDraft) => void;
  onSaveBulletin: (draft: BulletinDraft) => Promise<void>;
  onProceedToVoiceStudio: () => void;
}

export const BulletinEditorTab: React.FC<BulletinEditorTabProps> = ({
  draft,
  selectedNews,
  station,
  onGenerateDraft,
  isGenerating,
  onUpdateDraft,
  onSaveBulletin,
  onProceedToVoiceStudio,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [approvedHuman, setApprovedHuman] = useState(draft?.isHumanApproved ?? false);

  if (!draft) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto">
          <FileEdit className="w-8 h-8" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white">
          Redactor de Noticias – Radio Corrientes Viva
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
          {selectedNews.length > 0
            ? `Tienes ${selectedNews.length} noticias seleccionadas listas para redactar un boletín informativo con estilo radial para Corrientes y la región.`
            : 'Selecciona primero las noticias en el panel de Noticias & Períodos o haz clic para preparar un boletín automático.'}
        </p>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => onGenerateDraft()}
            disabled={isGenerating || selectedNews.length === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Redactando Boletín...' : 'Redactar Boletín con IA'}</span>
          </button>
        </div>
      </div>
    );
  }

  const totalWords = draft.fullScript.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round((totalWords / 135) * 60);
  const estMin = Math.floor(estimatedSeconds / 60);
  const estSec = estimatedSeconds % 60;

  const handleSegmentTextChange = (index: number, newText: string) => {
    const updatedSegments = [...draft.segments];
    updatedSegments[index] = { ...updatedSegments[index], text: newText };
    const fullScript = updatedSegments.map((s) => s.text).join('\n\n');
    onUpdateDraft({
      ...draft,
      segments: updatedSegments,
      fullScript,
      isHumanApproved: false, // Reset approval on edit
    });
  };

  const handleDeleteSegment = (index: number) => {
    const updatedSegments = draft.segments.filter((_, idx) => idx !== index);
    const fullScript = updatedSegments.map((s) => s.text).join('\n\n');
    onUpdateDraft({
      ...draft,
      segments: updatedSegments,
      fullScript,
    });
  };

  const handleMoveSegment = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= draft.segments.length) return;
    const updatedSegments = [...draft.segments];
    const temp = updatedSegments[index];
    updatedSegments[index] = updatedSegments[targetIdx];
    updatedSegments[targetIdx] = temp;
    const fullScript = updatedSegments.map((s) => s.text).join('\n\n');
    onUpdateDraft({
      ...draft,
      segments: updatedSegments,
      fullScript,
    });
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(draft.fullScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApproveAndProceed = async () => {
    const updated = { ...draft, isHumanApproved: true, status: 'approved' as const };
    setApprovedHuman(true);
    onUpdateDraft(updated);
    await onSaveBulletin(updated);
    onProceedToVoiceStudio();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveBulletin(draft);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">
              {station.stationName}
            </span>
            <span className="text-xs text-slate-400">• {draft.timePeriod}</span>
          </div>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onUpdateDraft({ ...draft, title: e.target.value })}
            className="text-lg sm:text-xl font-bold text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none mt-1 w-full"
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onGenerateDraft()}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            title="Volver a redactar con IA"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Regenerar</span>
          </button>

          <button
            onClick={handleCopyScript}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Copiado' : 'Copiar Texto'}</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
          </button>

          <button
            onClick={handleApproveAndProceed}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Aprobar y Generar MP3</span>
          </button>
        </div>
      </div>

      {/* Broadcast Teleprompter stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/70 border border-slate-800 p-3 rounded-lg text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-slate-400 text-[10px]">Duración Estimada</div>
            <div className="font-bold text-white">
              {estMin} min {estSec} seg
            </div>
          </div>
        </div>

        <div>
          <div className="text-slate-400 text-[10px]">Total de Palabras</div>
          <div className="font-bold text-cyan-300">{totalWords} palabras</div>
        </div>

        <div>
          <div className="text-slate-400 text-[10px]">Noticias Incluidas</div>
          <div className="font-bold text-white">
            {draft.segments.filter((s) => s.type === 'noticia').length} noticias
          </div>
        </div>

        <div>
          <div className="text-slate-400 text-[10px]">Aprobación Humana</div>
          <div className="font-bold text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{draft.isHumanApproved ? 'Texto Aprobado' : 'Borrador Editable'}</span>
          </div>
        </div>
      </div>

      {/* Structured Segment by Segment Editor */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Estructura del Boletín (Apertura • Noticias • Cierre)
          </h3>
          <span className="text-xs text-slate-500">
            Puedes corregir cualquier párrafo, moverlo o eliminarlo antes de generar el MP3.
          </span>
        </div>

        {draft.segments.map((seg, idx) => {
          const isApertura = seg.type === 'apertura';
          const isCierre = seg.type === 'cierre';
          const isTransicion = seg.type === 'transicion';
          const totalNewsCount = draft.segments.filter((s) => s.type === 'noticia').length;
          const currentNewsNumber =
            !isApertura && !isCierre && !isTransicion
              ? draft.segments.slice(0, idx + 1).filter((s) => s.type === 'noticia').length
              : 0;

          return (
            <div
              key={seg.id || idx}
              className={`rounded-xl border p-4 transition ${
                isApertura
                  ? 'bg-blue-950/20 border-blue-500/40 ring-1 ring-blue-500/20'
                  : isCierre
                  ? 'bg-amber-950/20 border-amber-500/40 ring-1 ring-amber-500/20'
                  : isTransicion
                  ? 'bg-slate-950/80 border-slate-800/80 py-2.5'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isApertura
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : isCierre
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : isTransicion
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-extrabold'
                    }`}
                  >
                    {isApertura
                      ? '1. Apertura Informativa'
                      : isCierre
                      ? '4. Cierre del Boletín'
                      : isTransicion
                      ? '3. Transición Radial'
                      : `2. Noticia ${currentNewsNumber} de ${totalNewsCount}`}
                  </span>

                  {seg.category && (
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                      {seg.category}
                    </span>
                  )}

                  {seg.title && (
                    <span className="text-xs font-semibold text-white truncate max-w-sm">
                      {seg.title}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {!isApertura && !isCierre && (
                    <>
                      <button
                        onClick={() => handleMoveSegment(idx, 'up')}
                        disabled={idx <= 1}
                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        title="Subir"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveSegment(idx, 'down')}
                        disabled={idx >= draft.segments.length - 2}
                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        title="Bajar"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSegment(idx)}
                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-red-400 cursor-pointer"
                        title="Eliminar del boletín"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {seg.sourceUrl && (
                    <a
                      href={seg.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate-500 hover:text-cyan-400 flex items-center gap-1 ml-1"
                    >
                      <span>Fuente</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Text Area */}
              <textarea
                rows={isTransicion ? 1 : isApertura || isCierre ? 3 : 4}
                value={seg.text}
                onChange={(e) => handleSegmentTextChange(idx, e.target.value)}
                className={`w-full bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-sans leading-relaxed resize-y ${
                  isTransicion ? 'italic text-slate-300' : ''
                }`}
                placeholder="Escribe o ajusta la redacción periodística aquí..."
              />

              {seg.sourceAttribution && (
                <div className="mt-1 text-[11px] text-slate-500 italic flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span>{seg.sourceAttribution}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Floating Bar */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
        <div className="text-xs text-slate-400">
          ¿Texto verificado? Al aprobar, el texto quedará fijado para la conversión exacta a audio MP3.
        </div>
        <button
          onClick={handleApproveAndProceed}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/25 transition cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Aprobar y Pasar al Estudio de Audio MP3</span>
        </button>
      </div>
    </div>
  );
};
