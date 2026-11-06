import React, { useState, useRef } from 'react';
import {
  X,
  Share2,
  Download,
  Upload,
  RefreshCw,
  Copy,
  Check,
  HardDrive,
  FileText,
  Smartphone,
  Laptop,
  Radio,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Layers,
} from 'lucide-react';
import { BulletinDraft } from '../types';
import { triggerDownload } from '../utils/audioUtils';

interface SharedSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onChangeSessionId: (newSessionId: string) => void;
  bulletins: BulletinDraft[];
  activeDraft: BulletinDraft | null;
  onSyncSession: (options?: { forcePull?: boolean }) => Promise<void>;
  onImportSessionData: (
    fileData: any,
    mergeStrategy: 'merge' | 'replace'
  ) => Promise<{ importedCount: number; totalBulletins: number }>;
  isSyncing: boolean;
  lastSyncTime: string | null;
}

export const SharedSessionModal: React.FC<SharedSessionModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  onChangeSessionId,
  bulletins,
  activeDraft,
  onSyncSession,
  onImportSessionData,
  isSyncing,
  lastSyncTime,
}) => {
  const [activeTab, setActiveTab] = useState<'session' | 'export' | 'import'>('session');
  const [customSessionInput, setCustomSessionInput] = useState(sessionId);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Export options
  const [includeDraftInExport, setIncludeDraftInExport] = useState(true);

  // Import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedImportData, setParsedImportData] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<'merge' | 'replace'>('merge');
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const getShareableUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('session', sessionId);
    return url.toString();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareableUrl());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleGenerateNewId = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newId = `RCV-${randomSuffix}`;
    setCustomSessionInput(newId);
    onChangeSessionId(newId);
  };

  const handleApplySessionId = () => {
    const clean = customSessionInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    if (clean) {
      setCustomSessionInput(clean);
      onChangeSessionId(clean);
    }
  };

  // Local JSON Export
  const handleExportLocalJson = () => {
    const exportPayload = {
      schemaVersion: '2.0',
      exportType: 'rcv_session_bulletins_history',
      sessionId,
      exportedAt: new Date().toISOString(),
      stationName: 'Radio Corrientes Viva',
      totalBulletins: bulletins.length,
      bulletins,
      activeDraft: includeDraftInExport ? activeDraft : null,
      metadata: {
        app: 'Radio Corrientes Viva – Central de Noticias IA',
        timezone: 'America/Argentina/Buenos_Aires',
        format: 'JSON Local Multi-dispositivo',
        generatedByDevice: navigator.userAgent.includes('Mobile') ? 'Dispositivo Móvil' : 'Estación de Trabajo',
      },
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `historial-boletines-${sessionId.toLowerCase()}-${dateStamp}.json`;

    triggerDownload(blobUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  };

  // Local JSON File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setImportSuccessMessage(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      let itemsCount = 0;
      if (Array.isArray(json)) {
        itemsCount = json.length;
      } else if (json && Array.isArray(json.bulletins)) {
        itemsCount = json.bulletins.length;
      } else {
        throw new Error('El archivo no contiene un array válido de boletines.');
      }

      setParsedImportData({
        fileName: file.name,
        sizeKb: Math.round(file.size / 1024),
        bulletinsCount: itemsCount,
        originSessionId: json.sessionId || 'Desconocido / Global',
        exportedAt: json.exportedAt || 'Fecha no especificada',
        hasActiveDraft: Boolean(json.activeDraft),
        rawPayload: json,
      });
    } catch (err: any) {
      setParseError(err.message || 'Error al analizar el archivo JSON.');
      setParsedImportData(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedImportData) return;

    setIsProcessingImport(true);
    setImportSuccessMessage(null);
    setParseError(null);

    try {
      const result = await onImportSessionData(parsedImportData.rawPayload, mergeStrategy);
      setImportSuccessMessage(
        `¡Historial importado con éxito! Se incorporaron ${result.importedCount} producciones a la sesión "${sessionId}". Total acumulado: ${result.totalBulletins} boletines.`
      );
      setSelectedFile(null);
      setParsedImportData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setParseError(`Error durante la importación: ${err.message}`);
    } finally {
      setIsProcessingImport(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400 shadow-inner">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Sincronización Multi-dispositivo por ID de Sesión
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  RCV
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Comparte y sincroniza el historial de boletines entre smartphones, tablets y PCs con exportación/importación JSON local.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-5 pt-2">
          <button
            onClick={() => setActiveTab('session')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'session'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>ID de Sesión Compartida</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'export'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar JSON Local</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'import'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Importar JSON Local</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: ID DE SESIÓN COMPARTIDA */}
          {activeTab === 'session' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  ID de Sesión Actual en este Navegador
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={customSessionInput}
                      onChange={(e) => setCustomSessionInput(e.target.value)}
                      placeholder="Ej: RCV-ESTUDIO-1"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm font-bold text-cyan-300 focus:outline-none focus:border-cyan-500 uppercase"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApplySessionId}
                      className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Conectar
                    </button>
                    <button
                      onClick={handleGenerateNewId}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                      title="Generar un nuevo código de sesión aleatorio"
                    >
                      Generar Nuevo
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>Sugerencias rápidas:</span>
                  {['RCV-CENTRAL', 'RCV-MOVIL-1', 'RCV-ESTUDIO-AIRE', 'RCV-GUARDIA'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setCustomSessionInput(preset);
                        onChangeSessionId(preset);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition cursor-pointer ${
                        sessionId === preset
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-700 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shareable Link Box */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Enlace de Conexión Rápida (para enviar al móvil o cabina)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyId}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition cursor-pointer"
                      title="Copiar solo el ID de sesión"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId ? 'ID Copiado' : 'Copiar ID'}</span>
                    </button>

                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold transition cursor-pointer"
                      title="Copiar enlace directo con parámetro de sesión"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? '¡Enlace Copiado!' : 'Copiar Enlace'}</span>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 font-mono text-[11px] text-slate-400 truncate select-all">
                  {getShareableUrl()}
                </div>
                <p className="text-[11px] text-slate-500">
                  Cualquier dispositivo que abra este enlace se unirá automáticamente a la sesión <span className="font-mono text-cyan-400">{sessionId}</span> y compartirá el historial.
                </p>
              </div>

              {/* Sync Status Banner */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-xs font-bold text-white">Sincronización Bidireccional Activa</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Boletines archivados en sesión: <span className="text-slate-200 font-bold">{bulletins.length}</span> • Última sincronización: {lastSyncTime || 'Al cargar la app'}
                  </p>
                </div>

                <button
                  onClick={() => onSyncSession({ forcePull: true })}
                  disabled={isSyncing}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
                </button>
              </div>

              {/* Multi-device Diagram / Explanation */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-center space-y-1">
                  <Smartphone className="w-5 h-5 text-cyan-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-200">1. Móvil / Redactor</div>
                  <p className="text-[10px] text-slate-400">Genera o aprueba borradores desde el exterior.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-center space-y-1">
                  <Radio className="w-5 h-5 text-amber-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-200">2. ID de Sesión</div>
                  <p className="text-[10px] text-slate-400">Canal compartido que agrupa y sincroniza el trabajo.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-center space-y-1">
                  <Laptop className="w-5 h-5 text-purple-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-200">3. PC de Estudio</div>
                  <p className="text-[10px] text-slate-400">Recibe el audio MP3 y el guión listo para emitir.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXPORTAR HISTORIAL JSON LOCAL */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-start gap-3">
                  <HardDrive className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Exportación de Historial JSON Local</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Descarga un archivo JSON autónomo con la totalidad del historial de boletines, segmentos, audios y fuentes de la sesión activa <span className="font-mono text-cyan-300">{sessionId}</span>.
                    </p>
                  </div>
                </div>

                {/* Summary Box */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">Total Boletines</span>
                    <span className="text-lg font-bold text-white">{bulletins.length}</span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">Con Audio MP3</span>
                    <span className="text-lg font-bold text-emerald-400">
                      {bulletins.filter((b) => Boolean(b.audioUrl)).length}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">Borradores</span>
                    <span className="text-lg font-bold text-cyan-400">
                      {bulletins.filter((b) => b.status === 'draft').length}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">Sesión</span>
                    <span className="text-xs font-mono font-bold text-amber-400 truncate block mt-1">
                      {sessionId}
                    </span>
                  </div>
                </div>

                {/* Options */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeDraftInExport}
                      onChange={(e) => setIncludeDraftInExport(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span>Incluir borrador activo que está en edición ({activeDraft ? activeDraft.title : 'Ninguno en curso'})</span>
                  </label>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl">
                <div className="text-xs text-amber-200">
                  El archivo JSON descargado puede llevarse en un pendrive o enviarse por correo/WhatsApp a otra consola para importar el historial completo.
                </div>

                <button
                  onClick={handleExportLocalJson}
                  className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg text-xs font-bold transition shadow-lg cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Archivo JSON</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: IMPORTAR HISTORIAL JSON LOCAL */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-start gap-3">
                  <Upload className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Importación de Historial desde Archivo JSON</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Selecciona un archivo JSON generado en otro dispositivo o sesión para incorporar sus boletines al navegador y al servidor central.
                    </p>
                  </div>
                </div>

                {/* Dropzone / File Picker */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-6 text-center bg-slate-900/60 cursor-pointer transition space-y-2"
                >
                  <FileText className="w-8 h-8 text-cyan-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-200">
                    {selectedFile ? selectedFile.name : 'Haz clic para seleccionar o arrastra el archivo JSON'}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Soporta archivos generados por Radio Corrientes Viva (.json)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {parseError && (
                  <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{parseError}</span>
                  </div>
                )}

                {importSuccessMessage && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{importSuccessMessage}</span>
                  </div>
                )}

                {/* Parsed Inspection Preview */}
                {parsedImportData && (
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                        Archivo Reconocido Válido
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">{parsedImportData.sizeKb} KB</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-950 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block uppercase">Boletines en archivo</span>
                        <span className="font-bold text-white text-sm">{parsedImportData.bulletinsCount}</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block uppercase">Sesión de Origen</span>
                        <span className="font-mono font-bold text-amber-300 truncate block">
                          {parsedImportData.originSessionId}
                        </span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-slate-500 block uppercase">Fecha Exportación</span>
                        <span className="font-mono text-slate-300 text-[11px] truncate block">
                          {parsedImportData.exportedAt.slice(0, 10)}
                        </span>
                      </div>
                    </div>

                    {/* Merge Strategy Selector */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-2">
                      <label className="block text-xs font-bold text-slate-300">
                        Estrategia de incorporación:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setMergeStrategy('merge')}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                            mergeStrategy === 'merge'
                              ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="font-bold flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Combinar (Recomendado)</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Mantiene los boletines actuales y añade los del archivo evitando duplicados por ID.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setMergeStrategy('replace')}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                            mergeStrategy === 'replace'
                              ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="font-bold flex items-center gap-1.5 text-amber-300">
                            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                            <span>Reemplazar Historial</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Sustituye por completo el historial de esta sesión con los contenidos del archivo.
                          </p>
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleConfirmImport}
                      disabled={isProcessingImport}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-lg cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{isProcessingImport ? 'Procesando Importación...' : 'Confirmar e Importar al Historial'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-mono text-cyan-400 font-bold">{sessionId}</span>
            <span>• Radio Corrientes Viva</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
