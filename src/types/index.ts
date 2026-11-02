export type NewsCategory =
  | 'Noticias Regionales'
  | 'Noticias Locales'
  | 'Noticias Nacionales'
  | 'Noticias Internacionales'
  | 'Política'
  | 'Economía'
  | 'Sociedad'
  | 'Policiales'
  | 'Deportes'
  | 'Salud'
  | 'Educación'
  | 'Cultura'
  | 'Tecnología'
  | 'Clima';

export interface NewsSource {
  id: string;
  name: string;
  siteUrl: string;
  rssUrl: string;
  category: NewsCategory | 'General';
  regionOrCity: string; // e.g. 'Corrientes Capital', 'NEA / Litoral', 'Nacional', 'Internacional'
  active: boolean;
  updateFrequencyMinutes: number; // 15, 30, 60
  lastFetchedAt?: string;
  status?: 'ok' | 'error' | 'pending';
  errorMessage?: string;
  articlesCount?: number;
}

export interface NewsItem {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string;
  content?: string;
  originalUrl: string;
  author?: string;
  publishedAt: string; // ISO string
  gatheredAt: string; // ISO string
  imageUrl?: string;
  category: NewsCategory;
  region: string;
  importanceScore?: number; // 1-100
  clusterId?: string;
  relatedSources?: string[];
  requiresHumanReview?: boolean; // True for policiales, judiciales, salud delicada
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  isVerified?: boolean;
}

export interface NewsCluster {
  id: string;
  mainHeadline: string;
  summary: string;
  category: NewsCategory;
  importanceScore: number;
  sources: { sourceName: string; url: string; title: string }[];
  firstPublishedAt: string;
  latestPublishedAt: string;
  articlesCount: number;
  items: NewsItem[];
}

export interface BulletinSegment {
  id: string;
  type: 'apertura' | 'noticia' | 'transicion' | 'cierre';
  title?: string;
  category?: NewsCategory;
  text: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  requiresReview?: boolean;
  isApproved?: boolean;
  audioUrl?: string;
  audioDurationSeconds?: number;
}

export interface BulletinDraft {
  id: string;
  title: string;
  stationName: string;
  createdAt: string;
  timePeriod: string; // e.g. 'Última hora', 'Últimas 3 horas', 'Últimas 6 horas', 'Últimas 12 horas', 'Últimas 24 horas', 'Personalizado'
  segments: BulletinSegment[];
  fullScript: string;
  selectedNewsCount: number;
  sourcesUsed: string[];
  audioUrl?: string; // MP3 URL
  mp3Filename?: string;
  audioDurationSeconds?: number;
  voiceId?: string;
  voiceName?: string;
  status: 'draft' | 'approved' | 'synthesized' | 'archived';
  fileFormat?: 'mp3' | 'wav';
  musicBed?: boolean;
  isHumanApproved?: boolean;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'masculino' | 'femenino';
  geminiVoice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  styleDescription: string;
  accent: string; // e.g. 'Español Argentino (Rioplatense / Litoral)', 'Español Latinoamericano Neutro'
  recommendedFor: string;
  speechMetadataPrompt: string;
  pitch: number;
  rate: number;
  isAvailableInTTS: boolean;
}

export interface ScheduleSlot {
  id: string;
  time: string; // HH:mm format, e.g. "08:00"
  label: string; // e.g. "Resumen Corrientes Mañana"
  enabled: boolean;
  newsCount: number; // 3, 5, 10
  categories: NewsCategory[];
  voiceId: string;
  autoSynthesizeAudio: boolean; // default false to prevent cost without review
  lastRunAt?: string;
  lastStatus?: 'success' | 'failed';
}

export interface ScheduleConfig {
  autoEnabled: boolean;
  timezone: string; // "America/Argentina/Buenos_Aires"
  intervalMinutes: number; // 15, 30, 60
  mode: 'slots' | 'interval';
  slots: ScheduleSlot[];
  autoDraftOnly: boolean; // Prepares draft and notifies for human review before MP3
  includeCortina: boolean;
  dailyAudioLimit: number; // e.g. 20 audios per day max
}

export interface StationConfig {
  stationName: string; // "Radio Corrientes Viva"
  networkName: string; // "Central de Noticias IA"
  dialFrequency: string; // "FM 97.1 / Online"
  slogan: string; // "La voz del Taragüí con toda la información al instante"
  broadcasterName: string; // "Juan Carlos Romero y Mariana Fernández"
  cityCountry: string; // "Corrientes, Argentina"
  openingTemplate: string;
  closingTemplate: string;
  styleTone: 'periodistico' | 'informativo' | 'cordial' | 'dinamico';
  defaultVoiceId: string;
  musicBedEnabled: boolean;
  musicBedVolume: number;
  maxDailyAudios: number;
}

export interface UsageStats {
  audiosGeneratedToday: number;
  totalAudiosEver: number;
  charactersSynthesizedToday: number;
  bulletinsCreatedToday: number;
  lastGeneratedAt?: string;
  dailyLimit: number;
  freeTierActive: boolean;
  estimatedCostUsd: number;
}
