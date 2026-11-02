import React from 'react';
import {
  LayoutDashboard,
  Rss,
  Newspaper,
  FileEdit,
  Mic2,
  FileAudio,
  CalendarClock,
  Radio,
} from 'lucide-react';

export type TabId =
  | 'dashboard'
  | 'sources'
  | 'news'
  | 'bulletin'
  | 'voice-studio'
  | 'library'
  | 'schedule'
  | 'station';

interface NavigationProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  selectedNewsCount: number;
  audioReady: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  selectedNewsCount,
  audioReady,
}) => {
  const tabs = [
    {
      id: 'dashboard' as TabId,
      label: 'Panel Principal',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'sources' as TabId,
      label: 'Fuentes RSS',
      icon: Rss,
      badge: null,
    },
    {
      id: 'news' as TabId,
      label: 'Noticias & Períodos',
      icon: Newspaper,
      badge: selectedNewsCount > 0 ? `${selectedNewsCount}` : null,
    },
    {
      id: 'bulletin' as TabId,
      label: 'Editor de Boletines',
      icon: FileEdit,
      badge: null,
    },
    {
      id: 'voice-studio' as TabId,
      label: 'Estudio de Voz IA',
      icon: Mic2,
      badge: audioReady ? 'Listo' : null,
    },
    {
      id: 'library' as TabId,
      label: 'Biblioteca Audios',
      icon: FileAudio,
      badge: null,
    },
    {
      id: 'schedule' as TabId,
      label: 'Programación Auto',
      icon: CalendarClock,
      badge: null,
    },
    {
      id: 'station' as TabId,
      label: 'Emisora & Ajustes',
      icon: Radio,
      badge: null,
    },
  ];

  return (
    <nav className="bg-slate-900/95 backdrop-blur border-b border-slate-800 sticky top-16 sm:top-20 z-30 overflow-x-auto scrollbar-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 sm:space-x-2 py-2 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-white text-blue-700'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
