import React, { useState } from 'react';
import { Download, Smartphone, Monitor, CheckCircle, X, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'settings';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  // If already installed and running standalone, do not clutter
  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-3 py-2 rounded-lg">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Aplicación instalada y activa en modo Standalone</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  // Header mini button
  if (variant === 'header') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm shadow-emerald-500/20 transition cursor-pointer"
          title="Instalar como App PWA en Celular Android o Computadora"
        >
          {isAndroid ? (
            <Smartphone className="w-3.5 h-3.5 text-emerald-200" />
          ) : (
            <Monitor className="w-3.5 h-3.5 text-emerald-200" />
          )}
          <span className="hidden sm:inline">Instalar App</span>
          <span className="sm:hidden">App</span>
        </button>

        {showGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-white">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-base">Instalar en Android y Computadora</h3>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-300">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                  <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>En Celulares Android (Chrome, Edge, Samsung Internet):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                    <li>Abre el menú de opciones (los tres puntos verticales <strong>⋮</strong> arriba a la derecha).</li>
                    <li>Toca en <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</li>
                    <li>¡Listo! Se creará el ícono oficial de <strong>Radio Corrientes Viva</strong> como app nativa.</li>
                  </ol>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                  <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-cyan-400" />
                    <span>En Computadora (Chrome, Edge, Brave):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                    <li>Haz clic en el ícono de instalación <strong>⊕</strong> en la barra de direcciones de tu navegador.</li>
                    <li>Confirma <strong>"Instalar"</strong> para abrirla en ventana independiente sin barras de navegador.</li>
                  </ol>
                </div>

                {isIOS && (
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                    <div className="font-bold text-amber-300 mb-1">En iPhone / iPad (Safari):</div>
                    <p className="text-slate-400">
                      Toca el botón <strong>Compartir</strong> y luego selecciona <strong>"Agregar al inicio"</strong>.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Banner variant for home/header
  if (variant === 'banner' && !dismissedBanner) {
    return (
      <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-xl p-3.5 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {isAndroid ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>App PWA Compatible con Android y Computadora</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold border border-emerald-500/30">
                PWA Standalone
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Instala Radio Corrientes Viva en tu celular o PC para acceso directo en pantalla principal y mejor rendimiento de audio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-emerald-500/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalar Ahora</span>
          </button>
          <button
            onClick={() => setDismissedBanner(true)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            title="Descartar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Settings variant
  return (
    <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
      <div>
        <div className="font-bold text-white flex items-center gap-1.5">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span>Instalar como Aplicación PWA</span>
        </div>
        <p className="text-slate-400 text-[11px] mt-0.5">
          Permite ejecutar la consola radial en pantalla completa sin barra de navegación en celulares Android y PC.
        </p>
      </div>
      <button
        onClick={handleInstallClick}
        className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>
    </div>
  );
};
