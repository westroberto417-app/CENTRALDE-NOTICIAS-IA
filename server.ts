import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { GoogleGenAI, Type } from '@google/genai';
import { Mp3Encoder } from '@breezystack/lamejs';
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
} from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const AUDIO_DIR = path.resolve(DATA_DIR, 'audio');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper for file storage
function readJsonFile<T>(filename: string, fallback: T): T {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as T;
    }
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
  }
  return fallback;
}

function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filename}:`, err);
  }
}

// Genuine WAV to MP3 Converter using lamejs
function convertWavToMp3(wavBuffer: Buffer): Buffer {
  try {
    // Read standard 44-byte RIFF WAV header
    const channels = wavBuffer.readUInt16LE(22);
    const sampleRate = wavBuffer.readUInt32LE(24);
    const bitsPerSample = wavBuffer.readUInt16LE(34);

    // Locate "data" chunk
    let dataOffset = 12;
    let found = false;
    while (dataOffset < wavBuffer.length - 8) {
      const chunkId = wavBuffer.toString('ascii', dataOffset, dataOffset + 4);
      const chunkSize = wavBuffer.readUInt32LE(dataOffset + 4);
      if (chunkId === 'data') {
        dataOffset += 8;
        found = true;
        break;
      }
      dataOffset += 8 + chunkSize;
    }

    if (!found) {
      dataOffset = 44; // Fallback to standard 44-byte header
    }

    const pcmData = wavBuffer.subarray(dataOffset);
    // Int16 samples
    const samples = new Int16Array(
      pcmData.buffer,
      pcmData.byteOffset,
      Math.floor(pcmData.byteLength / 2)
    );

    // Initialize 128 kbps broadcast MP3 encoder
    const mp3encoder = new Mp3Encoder(channels || 1, sampleRate || 24000, 128);
    const mp3Chunks: Buffer[] = [];
    const blockSize = 1152;

    if (channels === 1) {
      for (let i = 0; i < samples.length; i += blockSize) {
        const chunk = samples.subarray(i, i + blockSize);
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) {
          mp3Chunks.push(Buffer.from(mp3buf));
        }
      }
    } else {
      // Stereo: split channels
      const left = new Int16Array(Math.floor(samples.length / 2));
      const right = new Int16Array(Math.floor(samples.length / 2));
      for (let i = 0; i < samples.length - 1; i += 2) {
        left[Math.floor(i / 2)] = samples[i];
        right[Math.floor(i / 2)] = samples[i + 1];
      }
      for (let i = 0; i < left.length; i += blockSize) {
        const leftChunk = left.subarray(i, i + blockSize);
        const rightChunk = right.subarray(i, i + blockSize);
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) {
          mp3Chunks.push(Buffer.from(mp3buf));
        }
      }
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) {
      mp3Chunks.push(Buffer.from(endBuf));
    }

    return Buffer.concat(mp3Chunks);
  } catch (err) {
    console.error('Error converting WAV to MP3 with lamejs:', err);
    throw err;
  }
}

// Initial Sources: Corrientes, Litoral / NEA, and National
const DEFAULT_SOURCES: NewsSource[] = [
  {
    id: 'diario-el-libertador',
    name: 'Diario El Libertador (Corrientes)',
    siteUrl: 'https://diarioellibertador.com.ar',
    rssUrl: 'https://diarioellibertador.com.ar/feed/',
    category: 'Noticias Locales',
    regionOrCity: 'Corrientes Capital e Interior',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'chaco-dia-por-dia',
    name: 'Chaco Día por Día (Litoral NEA)',
    siteUrl: 'https://www.chacodiapordia.com',
    rssUrl: 'https://www.chacodiapordia.com/feed/',
    category: 'Noticias Regionales',
    regionOrCity: 'Litoral / NEA',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'misiones-online',
    name: 'Misiones Online (Litoral)',
    siteUrl: 'https://misionesonline.net',
    rssUrl: 'https://misionesonline.net/feed/',
    category: 'Noticias Regionales',
    regionOrCity: 'Litoral / NEA',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'infobae-argentina',
    name: 'Infobae Argentina',
    siteUrl: 'https://www.infobae.com',
    rssUrl: 'https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml',
    category: 'Noticias Nacionales',
    regionOrCity: 'Nacional',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'clarin-nacional',
    name: 'Clarín',
    siteUrl: 'https://www.clarin.com',
    rssUrl: 'https://www.clarin.com/rss/lo-ultimo/',
    category: 'Noticias Nacionales',
    regionOrCity: 'Nacional',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'lanacion-pais',
    name: 'La Nación',
    siteUrl: 'https://www.lanacion.com.ar',
    rssUrl: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml',
    category: 'Noticias Nacionales',
    regionOrCity: 'Nacional',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'perfil-pais',
    name: 'Diario Perfil',
    siteUrl: 'https://www.perfil.com',
    rssUrl: 'https://www.perfil.com/feed',
    category: 'Sociedad',
    regionOrCity: 'Nacional',
    active: true,
    updateFrequencyMinutes: 60,
    status: 'ok',
  },
  {
    id: 'cronista-finanzas',
    name: 'El Cronista Comercial',
    siteUrl: 'https://www.cronista.com',
    rssUrl: 'https://www.cronista.com/arc/outboundfeeds/rss/?outputType=xml',
    category: 'Economía',
    regionOrCity: 'Nacional',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'espn-deportes-arg',
    name: 'ESPN Deportes',
    siteUrl: 'https://www.espn.com.ar',
    rssUrl: 'https://www.espn.com.ar/espn/rss/news',
    category: 'Deportes',
    regionOrCity: 'Nacional / Regional',
    active: true,
    updateFrequencyMinutes: 30,
    status: 'ok',
  },
  {
    id: 'bbc-mundo-inter',
    name: 'BBC News Mundo',
    siteUrl: 'https://www.bbc.com/mundo',
    rssUrl: 'https://feeds.bbci.co.uk/mundo/rss.xml',
    category: 'Noticias Internacionales',
    regionOrCity: 'Internacional',
    active: true,
    updateFrequencyMinutes: 60,
    status: 'ok',
  },
];

// Station Config: Radio Corrientes Viva
const DEFAULT_STATION: StationConfig = {
  stationName: 'Radio Corrientes Viva',
  networkName: 'Central de Noticias IA',
  dialFrequency: 'FM 97.1 / Online',
  slogan: 'La voz del Taragüí con toda la información al instante',
  broadcasterName: 'Juan Carlos Romero y Mariana Fernández',
  cityCountry: 'Corrientes, Argentina',
  openingTemplate:
    'Muy buenos días a toda la provincia de Corrientes y la región del Litoral. En el aire de {EMISORA}, comienza la síntesis informativa de esta hora. Estos son los acontecimientos más relevantes.',
  closingTemplate:
    'Hasta aquí las principales noticias en el resumen de {EMISORA}. Seguí conectado con nosotros en el 97.1 del dial o a través de nuestra transmisión digital para más actualizaciones. Redacción e informe periodístico continuo.',
  styleTone: 'periodistico',
  defaultVoiceId: 'kore-arg',
  musicBedEnabled: true,
  musicBedVolume: 0.18,
  maxDailyAudios: 20,
};

// Schedule Config (Corrientes, Argentina UTC-3)
const DEFAULT_SCHEDULE: ScheduleConfig = {
  autoEnabled: false,
  timezone: 'America/Argentina/Buenos_Aires',
  intervalMinutes: 60,
  mode: 'slots',
  autoDraftOnly: true, // Safeguard: Prepares draft for human approval before generating MP3
  includeCortina: true,
  dailyAudioLimit: 20,
  slots: [
    {
      id: 'slot-0700',
      time: '07:00',
      label: 'Primera Mañana Corrientes',
      enabled: true,
      newsCount: 5,
      categories: ['Noticias Locales', 'Noticias Regionales', 'Política', 'Clima'],
      voiceId: 'fenrir-deep',
      autoSynthesizeAudio: false,
    },
    {
      id: 'slot-0900',
      time: '09:00',
      label: 'Panorama Informativo del Taragüí',
      enabled: true,
      newsCount: 5,
      categories: ['Noticias Locales', 'Economía', 'Sociedad'],
      voiceId: 'kore-arg',
      autoSynthesizeAudio: false,
    },
    {
      id: 'slot-1200',
      time: '12:00',
      label: 'Noticiero Central del Mediodía',
      enabled: true,
      newsCount: 10,
      categories: [
        'Noticias Locales',
        'Noticias Regionales',
        'Noticias Nacionales',
        'Deportes',
        'Economía',
      ],
      voiceId: 'kore-arg',
      autoSynthesizeAudio: false,
    },
    {
      id: 'slot-1600',
      time: '16:00',
      label: 'Actualización de la Siesta',
      enabled: false,
      newsCount: 3,
      categories: ['Noticias Regionales', 'Cultura', 'Sociedad'],
      voiceId: 'zephyr-clarity',
      autoSynthesizeAudio: false,
    },
    {
      id: 'slot-1900',
      time: '19:00',
      label: 'Resumen Central del Regreso',
      enabled: true,
      newsCount: 10,
      categories: [
        'Noticias Locales',
        'Noticias Regionales',
        'Noticias Nacionales',
        'Deportes',
        'Clima',
      ],
      voiceId: 'fenrir-deep',
      autoSynthesizeAudio: false,
    },
  ],
};

// Cost & Usage Tracking
function getUsageStats(): UsageStats {
  const todayStr = new Date().toISOString().slice(0, 10);
  const fallback: UsageStats = {
    audiosGeneratedToday: 0,
    totalAudiosEver: 0,
    charactersSynthesizedToday: 0,
    bulletinsCreatedToday: 0,
    dailyLimit: 20,
    freeTierActive: true,
    estimatedCostUsd: 0.0,
  };
  const stats = readJsonFile<UsageStats & { date?: string }>('usage_stats.json', fallback);
  if (stats.date !== todayStr) {
    stats.audiosGeneratedToday = 0;
    stats.charactersSynthesizedToday = 0;
    stats.bulletinsCreatedToday = 0;
    stats.date = todayStr;
    writeJsonFile('usage_stats.json', stats);
  }
  return stats;
}

function updateUsageStats(audioAdded = false, charCount = 0, bulletinAdded = false): UsageStats {
  const stats = getUsageStats();
  if (audioAdded) {
    stats.audiosGeneratedToday++;
    stats.totalAudiosEver++;
    stats.lastGeneratedAt = new Date().toISOString();
  }
  if (charCount > 0) {
    stats.charactersSynthesizedToday += charCount;
  }
  if (bulletinAdded) {
    stats.bulletinsCreatedToday++;
  }
  writeJsonFile('usage_stats.json', { ...stats, date: new Date().toISOString().slice(0, 10) });
  return stats;
}

// Voices Catalog
const VOICES_CATALOG: VoiceOption[] = [
  {
    id: 'kore-arg',
    name: 'Lucía - Institucional & Cercana',
    gender: 'femenino',
    geminiVoice: 'Kore',
    accent: 'Español Argentino (Rioplatense / Litoral)',
    styleDescription:
      'Voz femenina institucional, cálida, con dicción periodística limpia y pausada. Ideal para boletines centrales y noticias de sociedad.',
    recommendedFor: 'Boletines Centrales, Noticias Locales y Aperturas',
    speechMetadataPrompt:
      'Locutora de radio argentina, tono periodístico profesional, cálido, dicción impecable y ritmo informativo natural.',
    pitch: 1.0,
    rate: 1.0,
    isAvailableInTTS: true,
  },
  {
    id: 'fenrir-deep',
    name: 'Hernán - Locutor Grave Central',
    gender: 'masculino',
    geminiVoice: 'Fenrir',
    accent: 'Español Latinoamericano / Rioplatense',
    styleDescription:
      'Voz masculina profunda y autorizada, estilo locutor de noticias de prime time radial. Ideal para títulos urgentes y política.',
    recommendedFor: 'Títulos urgentes, Política y Economía',
    speechMetadataPrompt:
      'Locutor de radio masculino de voz grave y resonante, estilo informativo serio, seguro y contundente.',
    pitch: 0.95,
    rate: 0.98,
    isAvailableInTTS: true,
  },
  {
    id: 'charon-anchor',
    name: 'Mariano - Periodista Neutro',
    gender: 'masculino',
    geminiVoice: 'Charon',
    accent: 'Español Neutro Periodístico',
    styleDescription:
      'Voz masculina sobria, equilibrada y altamente objetiva. Perfecta para coberturas internacionales y análisis económico.',
    recommendedFor: 'Economía, Internacionales e Informes Especiales',
    speechMetadataPrompt:
      'Periodista de noticias en radio, dicción profesional sobria, tono informativo neutral y ritmo pausado.',
    pitch: 1.0,
    rate: 1.02,
    isAvailableInTTS: true,
  },
  {
    id: 'zephyr-clarity',
    name: 'Valentina - Noticiero Dinámico',
    gender: 'femenino',
    geminiVoice: 'Zephyr',
    accent: 'Español Latinoamericano Dinámico',
    styleDescription:
      'Voz femenina moderna, clara, ágil y atractiva. Ideal para segmentos de cultura, actualidad y espectáculos.',
    recommendedFor: 'Cultura, Carnaval, Educación y Flashes',
    speechMetadataPrompt:
      'Locutora joven y dinámica para radio informativa moderna, tono fresco y profesional.',
    pitch: 1.05,
    rate: 1.05,
    isAvailableInTTS: true,
  },
  {
    id: 'puck-dynamic',
    name: 'Santiago - Joven & Deportes',
    gender: 'masculino',
    geminiVoice: 'Puck',
    accent: 'Español Rioplatense Dinámico',
    styleDescription:
      'Voz masculina entusiasta y enérgica con cadencia radial deportiva y flashes rápidos de última hora.',
    recommendedFor: 'Deportes, Flashes de 30 minutos y Clima',
    speechMetadataPrompt:
      'Periodista deportivo de radio, ritmo enérgico, claro, dinámico y expresivo.',
    pitch: 1.02,
    rate: 1.08,
    isAvailableInTTS: true,
  },
];

// In-memory / cache getters
function getSources(): NewsSource[] {
  return readJsonFile<NewsSource[]>('sources.json', DEFAULT_SOURCES);
}

function saveSources(sources: NewsSource[]): void {
  writeJsonFile('sources.json', sources);
}

function getGatheredNews(): NewsItem[] {
  return readJsonFile<NewsItem[]>('gathered_news.json', []);
}

function saveGatheredNews(news: NewsItem[]): void {
  writeJsonFile('gathered_news.json', news);
}

function getBulletins(): BulletinDraft[] {
  return readJsonFile<BulletinDraft[]>('bulletins.json', []);
}

function saveBulletins(bulletins: BulletinDraft[]): void {
  writeJsonFile('bulletins.json', bulletins);
}

function getStationConfig(): StationConfig {
  return readJsonFile<StationConfig>('station.json', DEFAULT_STATION);
}

function saveStationConfig(config: StationConfig): void {
  writeJsonFile('station.json', config);
}

function getScheduleConfig(): ScheduleConfig {
  return readJsonFile<ScheduleConfig>('schedule.json', DEFAULT_SCHEDULE);
}

function saveScheduleConfig(config: ScheduleConfig): void {
  writeJsonFile('schedule.json', config);
}

// Gemini Client
function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// AI Model Availability and Quota Management
const modelCooldowns = new Map<string, number>();

// Mark gemini-3.8-flash on cooldown immediately to respect Free Tier daily request limit
// and seamlessly route requests to gemini-flash-latest / gemini-3.1-flash-lite
modelCooldowns.set('gemini-3.8-flash', Date.now() + 14 * 3600 * 1000);

function isModelAvailable(modelName: string): boolean {
  const cooldownUntil = modelCooldowns.get(modelName);
  if (!cooldownUntil) return true;
  if (Date.now() > cooldownUntil) {
    modelCooldowns.delete(modelName);
    return true;
  }
  return false;
}

function handleModelError(modelName: string, err: any) {
  const errMsg = err?.message || String(err);
  const isQuota =
    errMsg.includes('429') ||
    errMsg.includes('quota') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    err?.status === 'RESOURCE_EXHAUSTED' ||
    err?.status === 429;

  if (isQuota) {
    let cooldownMs = 60 * 60 * 1000;
    const match = errMsg.match(/retryDelay"?:\s*"?(\d+)/i) || errMsg.match(/retry in\s+(\d+)h/i);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed)) {
        cooldownMs = errMsg.includes('retry in') ? parsed * 3600 * 1000 : parsed * 1000;
      }
    }
    modelCooldowns.set(modelName, Date.now() + cooldownMs);
    console.log(
      `[AI Quota Manager] Model '${modelName}' rate-limited. Pausing attempts for ${Math.round(
        cooldownMs / 60000
      )}m.`
    );
  } else {
    console.log(`[AI Engine] Model '${modelName}' unavailable, falling back.`);
  }
}

// RSS XML Parsing logic
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  trimValues: true,
});

function cleanHtmlTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractImageUrl(item: any): string | undefined {
  if (item['enclosure'] && item['enclosure']['@_url']) {
    return item['enclosure']['@_url'];
  }
  if (item['media:content'] && item['media:content']['@_url']) {
    return item['media:content']['@_url'];
  }
  if (item['media:thumbnail'] && item['media:thumbnail']['@_url']) {
    return item['media:thumbnail']['@_url'];
  }
  if (Array.isArray(item['media:content']) && item['media:content'][0]?.['@_url']) {
    return item['media:content'][0]['@_url'];
  }
  const desc = item.description || item['content:encoded'] || '';
  if (typeof desc === 'string') {
    const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) return imgMatch[1];
  }
  return undefined;
}

function inferCategoryAndSensitivity(
  title: string,
  desc: string,
  sourceCategory: string,
  regionOrCity: string
): { category: NewsCategory; requiresHumanReview: boolean } {
  const text = `${title} ${desc}`.toLowerCase();

  // Check if sensitive (policiales, judiciales, salud delicada)
  const isPolicial = Boolean(
    text.match(/policía|detenido|crimen|robo|asesinato|fiscal|juez|allanamiento|seguridad|homicidio|preso|narco|estafa|accidente fatal|tragedia/)
  );
  const isSaludDelicada = Boolean(
    text.match(/dengue|brote|fallecido|epidemia|enfermedad|hospital|urgencias|contagio/)
  );
  const requiresHumanReview = isPolicial || isSaludDelicada;

  if (isPolicial) {
    return { category: 'Policiales', requiresHumanReview: true };
  }
  if (isSaludDelicada || text.match(/salud|médico|vacuna|tratamiento/)) {
    return { category: 'Salud', requiresHumanReview };
  }
  if (text.match(/corrientes|taragüí|goya|paso de los libres|mercedes|bella vista|curuzú|ituzaingó|esquina/)) {
    return { category: 'Noticias Locales', requiresHumanReview };
  }
  if (text.match(/litoral|chaco|resistencia|misiones|posadas|paraná|río paraná|nea/)) {
    return { category: 'Noticias Regionales', requiresHumanReview };
  }
  if (text.match(/dólar|inflación|banco central|fmi|economía|mercado|bolsa|tasas|deuda|salario|precios|pbi/)) {
    return { category: 'Economía', requiresHumanReview };
  }
  if (text.match(/presidente|gobierno|diputados|senado|ley|congreso|ministro|oposición|casa rosada|decreto|milei/)) {
    return { category: 'Política', requiresHumanReview };
  }
  if (text.match(/fútbol|copa|messi|boca|river|selección|partido|gol|liga|campeonato|tenis|básquet/)) {
    return { category: 'Deportes', requiresHumanReview: false };
  }
  if (text.match(/clima|temperatura|tormenta|lluvia|alerta meteorológica|crecida|río paraná|viento/)) {
    return { category: 'Clima', requiresHumanReview: false };
  }
  if (text.match(/chamamé|carnaval|festival|teatro|cine|música|concierto|libro|arte/)) {
    return { category: 'Cultura', requiresHumanReview: false };
  }
  if (text.match(/escuela|docentes|universidad|unne|estudiantes|colegio|clases/)) {
    return { category: 'Educación', requiresHumanReview: false };
  }
  if (text.match(/guerra|ee\.uu|estados unidos|ucrania|rusia|medio oriente|israel|europa|onu|china|brasil/)) {
    return { category: 'Noticias Internacionales', requiresHumanReview: false };
  }
  if (text.match(/inteligencia artificial|software|apple|google|redes|app|innovación/)) {
    return { category: 'Tecnología', requiresHumanReview: false };
  }

  if (sourceCategory && sourceCategory !== 'General') {
    return { category: sourceCategory as NewsCategory, requiresHumanReview };
  }

  return { category: 'Sociedad', requiresHumanReview };
}

async function fetchAndParseRss(source: NewsSource): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(source.rssUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CentralDeNoticiasIA/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    const parsed = xmlParser.parse(xmlText);

    let rawItems: any[] = [];
    if (parsed.rss && parsed.rss.channel && parsed.rss.channel.item) {
      rawItems = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : [parsed.rss.channel.item];
    } else if (parsed.feed && parsed.feed.entry) {
      rawItems = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
    } else if (parsed['rdf:RDF'] && parsed['rdf:RDF'].item) {
      rawItems = Array.isArray(parsed['rdf:RDF'].item)
        ? parsed['rdf:RDF'].item
        : [parsed['rdf:RDF'].item];
    }

    const newsItems: NewsItem[] = [];
    const nowIso = new Date().toISOString();

    for (const raw of rawItems.slice(0, 30)) {
      const title = cleanHtmlTags(raw.title || '');
      if (!title || title.length < 5) continue;

      let link = '';
      if (typeof raw.link === 'string') {
        link = raw.link;
      } else if (raw.link && raw.link['@_href']) {
        link = raw.link['@_href'];
      } else if (Array.isArray(raw.link)) {
        link = raw.link[0]?.['@_href'] || raw.link[0] || '';
      }

      const description = cleanHtmlTags(
        raw.description || raw.summary || raw['content:encoded'] || ''
      );

      let pubDate = raw.pubDate || raw.published || raw.updated || raw['dc:date'];
      let publishedIso = nowIso;
      if (pubDate) {
        const parsedDate = new Date(pubDate);
        if (!isNaN(parsedDate.getTime())) {
          publishedIso = parsedDate.toISOString();
        }
      }

      const author = cleanHtmlTags(raw.author || raw['dc:creator'] || '');
      const imageUrl = extractImageUrl(raw);
      const { category, requiresHumanReview } = inferCategoryAndSensitivity(
        title,
        description,
        source.category,
        source.regionOrCity
      );

      const uniqueId = crypto
        .createHash('md5')
        .update(`${source.id}-${title}-${link}`)
        .digest('hex');

      newsItems.push({
        id: uniqueId,
        sourceId: source.id,
        sourceName: source.name,
        title,
        summary: description.slice(0, 450),
        originalUrl: link,
        author: author || undefined,
        publishedAt: publishedIso,
        gatheredAt: nowIso,
        imageUrl,
        category,
        region: source.regionOrCity,
        requiresHumanReview,
        reviewStatus: requiresHumanReview ? 'pending' : 'approved',
        isVerified: true,
      });
    }

    return newsItems;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Deduplicate and cluster news items
function deduplicateNews(items: NewsItem[]): NewsItem[] {
  const seenTitles = new Set<string>();
  const uniqueItems: NewsItem[] = [];

  for (const item of items) {
    const normalized = item.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let isDupe = false;
    for (const seen of seenTitles) {
      if (seen === normalized) {
        isDupe = true;
        break;
      }
      const wordsA = new Set(normalized.split(' '));
      const wordsB = new Set(seen.split(' '));
      let overlap = 0;
      for (const w of wordsA) {
        if (w.length > 3 && wordsB.has(w)) overlap++;
      }
      if (overlap >= 5 && overlap / Math.min(wordsA.size, wordsB.size) > 0.75) {
        isDupe = true;
        break;
      }
    }

    if (!isDupe) {
      seenTitles.add(normalized);
      uniqueItems.push(item);
    }
  }

  return uniqueItems;
}

// ---------------- API ROUTES ----------------

// Status & Dashboard endpoint
app.get('/api/status', (req: Request, res: Response) => {
  const sources = getSources();
  const news = getGatheredNews();
  const bulletins = getBulletins();
  const schedule = getScheduleConfig();
  const station = getStationConfig();
  const usage = getUsageStats();
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  const activeSources = sources.filter((s) => s.active);
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const recentNews = news.filter((n) => new Date(n.publishedAt).getTime() >= twentyFourHoursAgo);
  const pendingReview = news.filter((n) => n.requiresHumanReview && n.reviewStatus === 'pending');

  res.json({
    hasGeminiKey,
    stationName: station.stationName,
    dialFrequency: station.dialFrequency,
    totalSources: sources.length,
    activeSources: activeSources.length,
    totalNewsCollected: news.length,
    recentNewsCount: recentNews.length,
    pendingReviewCount: pendingReview.length,
    bulletinsCount: bulletins.length,
    scheduleActive: schedule.autoEnabled,
    usage,
    lastUpdated: news.length > 0 ? news[0].gatheredAt : null,
  });
});

// Sources CRUD
app.get('/api/sources', (req: Request, res: Response) => {
  res.json(getSources());
});

app.post('/api/sources', (req: Request, res: Response) => {
  const { name, siteUrl, rssUrl, category, regionOrCity, updateFrequencyMinutes } = req.body;
  if (!name || !rssUrl) {
    return res.status(400).json({ error: 'Nombre y URL de RSS son obligatorios' });
  }

  const sources = getSources();
  const newSource: NewsSource = {
    id: 'src-' + Date.now(),
    name: name.trim(),
    siteUrl: (siteUrl || '').trim(),
    rssUrl: rssUrl.trim(),
    category: category || 'Noticias Regionales',
    regionOrCity: regionOrCity || 'Corrientes / Litoral',
    active: true,
    updateFrequencyMinutes: Number(updateFrequencyMinutes) || 30,
    status: 'pending',
  };

  sources.push(newSource);
  saveSources(sources);
  res.status(201).json(newSource);
});

app.put('/api/sources/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const sources = getSources();
  const index = sources.findIndex((s) => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Fuente no encontrada' });
  }

  sources[index] = { ...sources[index], ...req.body };
  saveSources(sources);
  res.json(sources[index]);
});

app.delete('/api/sources/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const sources = getSources();
  const filtered = sources.filter((s) => s.id !== id);
  saveSources(filtered);
  res.json({ success: true });
});

// Validate RSS feed
app.post('/api/sources/test', async (req: Request, res: Response) => {
  const { rssUrl } = req.body;
  if (!rssUrl) {
    return res.status(400).json({ error: 'URL requerida' });
  }

  try {
    const dummySource: NewsSource = {
      id: 'test',
      name: 'Fuente de Prueba',
      siteUrl: '',
      rssUrl,
      category: 'Noticias Regionales',
      regionOrCity: 'Corrientes',
      active: true,
      updateFrequencyMinutes: 30,
    };
    const items = await fetchAndParseRss(dummySource);
    res.json({
      success: true,
      count: items.length,
      sampleItems: items.slice(0, 3),
      message: `Fuente validada exitosamente. Se extrajeron ${items.length} noticias reales del canal RSS.`,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: `No se pudo extraer noticias del canal RSS: ${err.message}. El portal podría tener restricciones de acceso automatizado.`,
    });
  }
});

// News gathering trigger
app.post('/api/gather', async (req: Request, res: Response) => {
  const sources = getSources();
  const activeSources = sources.filter((s) => s.active);
  let allNewItems: NewsItem[] = [];
  const errors: { sourceName: string; error: string }[] = [];

  for (const source of activeSources) {
    try {
      const items = await fetchAndParseRss(source);
      allNewItems.push(...items);
      source.status = 'ok';
      source.lastFetchedAt = new Date().toISOString();
      source.articlesCount = items.length;
    } catch (err: any) {
      console.warn(`Error fetching ${source.name}:`, err.message);
      source.status = 'error';
      source.errorMessage = err.message;
      errors.push({ sourceName: source.name, error: err.message });
    }
  }

  saveSources(sources);

  // Combine & deduplicate
  const existing = getGatheredNews();
  const combined = deduplicateNews([...allNewItems, ...existing]);

  // Keep up to 500 news
  const sorted = combined
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 500);

  saveGatheredNews(sorted);

  res.json({
    success: true,
    newItemsCount: allNewItems.length,
    totalSaved: sorted.length,
    errors,
    timestamp: new Date().toISOString(),
  });
});

// News list with time period and category filtering
app.get('/api/news', (req: Request, res: Response) => {
  const { period, category, region, sourceId, limit, search, pendingOnly } = req.query;
  let news = getGatheredNews();

  const now = Date.now();
  let timeLimitMs: number | null = null;

  switch (period) {
    case '1h':
      timeLimitMs = 60 * 60 * 1000;
      break;
    case '3h':
      timeLimitMs = 3 * 60 * 60 * 1000;
      break;
    case '6h':
      timeLimitMs = 6 * 60 * 60 * 1000;
      break;
    case '12h':
      timeLimitMs = 12 * 60 * 60 * 1000;
      break;
    case '24h':
      timeLimitMs = 24 * 60 * 60 * 1000;
      break;
    default:
      timeLimitMs = null;
      break;
  }

  if (timeLimitMs !== null) {
    news = news.filter((item) => {
      const pubTime = new Date(item.publishedAt).getTime();
      return now - pubTime <= timeLimitMs!;
    });
  }

  if (category && category !== 'Todas') {
    news = news.filter((item) => item.category === category);
  }

  if (region && region !== 'Todas') {
    news = news.filter((item) => item.region === region);
  }

  if (sourceId) {
    news = news.filter((item) => item.sourceId === sourceId);
  }

  if (pendingOnly === 'true') {
    news = news.filter((item) => item.requiresHumanReview && item.reviewStatus === 'pending');
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    news = news.filter(
      (item) => item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q)
    );
  }

  news.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (limit) {
    const numLimit = parseInt(limit as string, 10);
    if (!isNaN(numLimit)) {
      news = news.slice(0, numLimit);
    }
  }

  res.json({
    total: news.length,
    items: news,
  });
});

// Human review approval endpoint for sensitive news
app.post('/api/news/:id/review', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' | 'rejected'
  const news = getGatheredNews();
  const index = news.findIndex((n) => n.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Noticia no encontrada' });
  }

  news[index].reviewStatus = status;
  saveGatheredNews(news);
  res.json(news[index]);
});

// Curate & Rank news with AI
app.post('/api/curate', async (req: Request, res: Response) => {
  const { period = '6h', count = 5, categories = [] } = req.body;
  let allNews = getGatheredNews();

  const now = Date.now();
  let timeLimitMs = 6 * 60 * 60 * 1000;
  if (period === '1h') timeLimitMs = 60 * 60 * 1000;
  else if (period === '3h') timeLimitMs = 3 * 60 * 60 * 1000;
  else if (period === '6h') timeLimitMs = 6 * 60 * 60 * 1000;
  else if (period === '12h') timeLimitMs = 12 * 60 * 60 * 1000;
  else if (period === '24h') timeLimitMs = 24 * 60 * 60 * 1000;

  let candidates = allNews.filter((item) => {
    const diff = now - new Date(item.publishedAt).getTime();
    return diff <= timeLimitMs;
  });

  if (candidates.length < count) {
    candidates = allNews.filter((item) => {
      const diff = now - new Date(item.publishedAt).getTime();
      return diff <= 24 * 60 * 60 * 1000;
    });
  }

  if (categories.length > 0) {
    candidates = candidates.filter((item) => categories.includes(item.category));
  }

  // Use Gemini to intelligently rank and cluster with Corrientes & Regional priority
  const ai = getGenAIClient();
  if (ai && candidates.length > 0) {
    try {
      const prompt = `Actúa como Jefe de Redacción y Director de Noticias de Radio Corrientes Viva (FM 97.1, Corrientes, Argentina).
Analiza las siguientes ${candidates.length} noticias candidatas de las últimas horas.
Criterios de selección periodística:
1. Priorizar temas de impacto regional en Corrientes y el Litoral (obras, río Paraná, clima, servicios, política local y nacional relevante).
2. Agrupar informaciones que traten sobre el mismo acontecimiento.
3. Diferenciar noticias confirmadas de hechos sin verificar.
4. Seleccionar exactamente las mejores ${count} noticias principales.

Candidatas:
${JSON.stringify(
  candidates.slice(0, 35).map((c) => ({
    id: c.id,
    title: c.title,
    summary: c.summary,
    source: c.sourceName,
    publishedAt: c.publishedAt,
    category: c.category,
    region: c.region,
  }))
)}

Devuelve estrictamente un objeto JSON con la lista ordenada de noticias seleccionadas.`;

      let response: any = null;
      const allCandidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      const candidateModels = allCandidateModels.filter(isModelAvailable);

      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  selectedNews: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        importanceScore: { type: Type.INTEGER },
                        editorialReason: { type: Type.STRING },
                        editorialTitle: { type: Type.STRING },
                      },
                      required: ['id', 'importanceScore'],
                    },
                  },
                },
                required: ['selectedNews'],
              },
            },
          });
          if (response && response.text) break;
        } catch (mErr: any) {
          handleModelError(modelName, mErr);
        }
      }

      if (response && response.text) {
        const parsedData = JSON.parse(response.text);
        if (parsedData.selectedNews && Array.isArray(parsedData.selectedNews)) {
          const selectedMap = new Map(parsedData.selectedNews.map((s: any) => [s.id, s]));
          const selectedItems = candidates
            .filter((c) => selectedMap.has(c.id))
            .map((c) => {
              const aiMeta: any = selectedMap.get(c.id);
              return {
                ...c,
                importanceScore: aiMeta.importanceScore || 85,
                editorialReason: aiMeta.editorialReason,
                title: aiMeta.editorialTitle || c.title,
              };
            })
            .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));

          return res.json({
            curatedItems: selectedItems.slice(0, count),
            totalCandidates: candidates.length,
            method: 'ai-editorial-ranking',
          });
        }
      }
    } catch (err: any) {
      console.log('[AI Curation] Falling back to heuristic ranking.');
    }
  }

  // Fallback
  const sorted = candidates
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, count)
    .map((item, idx) => ({
      ...item,
      importanceScore: Math.max(95 - idx * 4, 50),
    }));

  res.json({
    curatedItems: sorted,
    totalCandidates: candidates.length,
    method: 'heuristic-ranking',
  });
});

// AI Broadcast Scriptwriter for Radio Corrientes Viva
app.post('/api/bulletin/draft', async (req: Request, res: Response) => {
  const { newsItems = [], timePeriod = 'Últimas horas', customOpening, customClosing } = req.body;
  const station = getStationConfig();

  if (!newsItems || newsItems.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos una noticia seleccionada' });
  }

  const ai = getGenAIClient();
  const stationIntro =
    customOpening ||
    station.openingTemplate.replace('{EMISORA}', `${station.stationName} (${station.dialFrequency})`);
  const stationOutro =
    customClosing ||
    station.closingTemplate.replace('{EMISORA}', `${station.stationName}`);

  if (ai) {
    try {
      const prompt = `Eres el redactor periodístico y locutor jefe de "${station.stationName}" (${station.dialFrequency}) en ${station.cityCountry}.
Redacta un boletín informativo profesional de radio con las siguientes noticias seleccionadas.

PAUTAS DE ESTILO RADIAL FUNDAMENTALES:
1. Lenguaje oral, claro, profesional, objetivo y dinámico, pensado para ser leído al aire para la audiencia de Corrientes y la región del Litoral.
2. NUNCA utilizar frases artificiales como "según el artículo que estamos leyendo" ni "en este posteo".
3. Transiciones naturales entre noticias ("En materia económica...", "En noticias de la región...", "Pasando al plano deportivo...", "Por otra parte...").
4. CERO invención: no inventar cifras, declaraciones ni nombres; atribuir la procedencia con claridad (ej: "según informó El Libertador", "de acuerdo con Infobae", etc.).
5. Estructura del boletín:
   - Apertura informativa cordial con saludo de la emisora.
   - Segmentos de noticias con sus transiciones fluidas.
   - Cierre institucional con despedida y mención del dial ${station.dialFrequency}.

Noticias de entrada:
${JSON.stringify(
  newsItems.map((n: any, idx: number) => ({
    orden: idx + 1,
    titulo: n.title,
    resumen: n.summary,
    medio: n.sourceName,
    categoria: n.category,
    region: n.region,
    fecha: n.publishedAt,
    url: n.originalUrl,
  }))
)}

Devuelve un JSON con:
- title: Título del boletín (ej: "Boletín Informativo - ${station.stationName}")
- aperturaText: Texto de apertura para leer al aire
- segments: Array de objetos por noticia con:
    - id: string
    - category: string
    - title: titular periodístico adaptado a radio
    - transitionText: frase de transición previa
    - bodyText: redacción de la noticia para el locutor (2-4 oraciones claras)
    - sourceAttribution: "Informe basado en reporte de [Medio]"
    - sourceUrl: URL original
    - requiresReview: boolean (true si es policial o salud delicada)
- cierreText: Texto de cierre institucional`;

      let response: any = null;
      const allCandidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      const candidateModels = allCandidateModels.filter(isModelAvailable);

      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  aperturaText: { type: Type.STRING },
                  segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        category: { type: Type.STRING },
                        title: { type: Type.STRING },
                        transitionText: { type: Type.STRING },
                        bodyText: { type: Type.STRING },
                        sourceAttribution: { type: Type.STRING },
                        sourceUrl: { type: Type.STRING },
                        requiresReview: { type: Type.BOOLEAN },
                      },
                      required: ['title', 'bodyText', 'category'],
                    },
                  },
                  cierreText: { type: Type.STRING },
                },
                required: ['title', 'aperturaText', 'segments', 'cierreText'],
              },
            },
          });
          if (response && response.text) break;
        } catch (mErr: any) {
          handleModelError(modelName, mErr);
        }
      }

      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        const rawSegments = Array.isArray(parsed?.segments) ? parsed.segments : [];
        if (rawSegments.length > 0) {
          const segments: BulletinSegment[] = [];

          // 1. Apertura
          segments.push({
            id: 'seg-apertura',
            type: 'apertura',
            title: 'Apertura Institucional',
            text: parsed.aperturaText || stationIntro,
          });

          // 2. News items & transitions
          rawSegments.forEach((seg: any, idx: number) => {
            if (seg.transitionText && seg.transitionText.trim().length > 0) {
              segments.push({
                id: `seg-trans-${idx}`,
                type: 'transicion',
                text: seg.transitionText.trim(),
              });
            }
            segments.push({
              id: `seg-news-${idx}`,
              type: 'noticia',
              title: seg.title || newsItems[idx]?.title || 'Noticia destacada',
              category: (seg.category as NewsCategory) || newsItems[idx]?.category || 'Sociedad',
              text: seg.bodyText || `${seg.title}.`,
              sourceAttribution: seg.sourceAttribution || `Informe de ${newsItems[idx]?.sourceName || 'Corrientes'}`,
              sourceUrl: seg.sourceUrl || newsItems[idx]?.originalUrl,
              requiresReview: seg.requiresReview || newsItems[idx]?.requiresHumanReview,
              isApproved: true,
            });
          });

          // 3. Cierre
          segments.push({
            id: 'seg-cierre',
            type: 'cierre',
            title: 'Cierre Institucional',
            text: parsed.cierreText || stationOutro,
          });

          const fullScript = segments.map((s) => s.text).join('\n\n');

          const draft: BulletinDraft = {
            id: 'draft-' + Date.now(),
            title: parsed.title || `Boletín Informativo - ${station.stationName}`,
            stationName: station.stationName,
            createdAt: new Date().toISOString(),
            timePeriod,
            segments,
            fullScript,
            selectedNewsCount: newsItems.length,
            sourcesUsed: Array.from(new Set(newsItems.map((n: any) => n.sourceName))),
            status: 'draft',
            fileFormat: 'mp3',
          };

          updateUsageStats(false, 0, true);
          return res.json(draft);
        }
      }
    } catch (err: any) {
      console.log('[AI Scriptwriting] Activating institutional radio editorial fallback.');
    }
  }

  // Fallback
  const segments: BulletinSegment[] = [
    {
      id: 'seg-apertura',
      type: 'apertura',
      title: 'Apertura Institucional',
      text: stationIntro,
    },
  ];

  newsItems.forEach((n: any, idx: number) => {
    segments.push({
      id: `seg-trans-${idx}`,
      type: 'transicion',
      text: idx === 0 ? 'Iniciamos con el tema más destacado.' : 'En otra de las noticias importantes,',
    });
    segments.push({
      id: `seg-news-${idx}`,
      type: 'noticia',
      title: n.title,
      category: n.category,
      text: `${n.title}. ${n.summary}`,
      sourceAttribution: `Información difundida por ${n.sourceName}`,
      sourceUrl: n.originalUrl,
      requiresReview: n.requiresHumanReview,
      isApproved: true,
    });
  });

  segments.push({
    id: 'seg-cierre',
    type: 'cierre',
    title: 'Cierre Institucional',
    text: stationOutro,
  });

  const fullScript = segments.map((s) => s.text).join('\n\n');
  const draft: BulletinDraft = {
    id: 'draft-' + Date.now(),
    title: `Boletín Informativo - ${station.stationName}`,
    stationName: station.stationName,
    createdAt: new Date().toISOString(),
    timePeriod,
    segments,
    fullScript,
    selectedNewsCount: newsItems.length,
    sourcesUsed: Array.from(new Set(newsItems.map((n: any) => n.sourceName))),
    status: 'draft',
    fileFormat: 'mp3',
  };

  updateUsageStats(false, 0, true);
  res.json(draft);
});

// Voices list
app.get('/api/audio/voices', (req: Request, res: Response) => {
  res.json(VOICES_CATALOG);
});

// Voice Preview endpoint
app.post('/api/audio/preview-voice', async (req: Request, res: Response) => {
  const { voiceId, text } = req.body;
  const voice = VOICES_CATALOG.find((v) => v.id === voiceId) || VOICES_CATALOG[0];
  const station = getStationConfig();
  const sampleText =
    text ||
    `Transmite ${station.stationName}, noventa y siete punto uno. Estas son las noticias más destacadas de la hora en Corrientes y la región.`;

  const ai = getGenAIClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: sampleText,
                speechMetadata: {
                  style: voice.speechMetadataPrompt,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice.geminiVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return res.json({
          audioUrl: `data:audio/wav;base64,${base64Audio}`,
          voiceName: voice.name,
          format: 'wav',
        });
      }
    } catch (err: any) {
      console.warn('Gemini TTS preview error:', err.message);
    }
  }

  res.json({
    audioUrl: null,
    message: 'Usa la vista previa del navegador (Web Speech API) para escuchar sin consumir créditos.',
    fallbackVoice: voice,
  });
});

// Complete Audio Synthesis with Genuine MP3 Conversion via lamejs
app.post('/api/audio/synthesize', async (req: Request, res: Response) => {
  const {
    draftId,
    voiceId,
    scriptText,
    speed = 1.0,
    pitch = 1.0,
    format = 'mp3',
  } = req.body;

  const usage = getUsageStats();
  const station = getStationConfig();

  // Enforce daily limit to protect user costs
  if (usage.audiosGeneratedToday >= (station.maxDailyAudios || 20)) {
    return res.status(429).json({
      error: `Se ha alcanzado el límite diario configurado (${station.maxDailyAudios} audios por día). Puedes modificar este límite en Configuración si deseas generar más audios.`,
    });
  }

  const voice = VOICES_CATALOG.find((v) => v.id === voiceId) || VOICES_CATALOG[0];
  const textToSynthesize = scriptText || '';

  if (!textToSynthesize.trim()) {
    return res.status(400).json({ error: 'Texto para sintetizar vacío' });
  }

  const ai = getGenAIClient();
  if (!ai) {
    return res.status(500).json({
      error:
        'La clave GEMINI_API_KEY no está configurada en el servidor. Configúrala en la pestaña de Ajustes o utiliza la vista previa nativa del navegador.',
    });
  }

  try {
    const cleanSpokenText = textToSynthesize
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`]/g, '')
      .trim();

    // Call Gemini 3.8 Flash-Lite TTS
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: cleanSpokenText,
              speechMetadata: {
                style: `${voice.speechMetadataPrompt}. Locución clara para radio.`,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice.geminiVoice },
          },
        },
      },
    });

    const base64Wav = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Wav) {
      throw new Error('El modelo no devolvió datos de audio');
    }

    const wavBuffer = Buffer.from(base64Wav, 'base64');
    let finalBuffer: Buffer = wavBuffer;
    let finalExt = 'wav';
    let mimeType = 'audio/wav';

    // Real WAV to MP3 conversion using lamejs
    try {
      finalBuffer = Buffer.from(convertWavToMp3(wavBuffer));
      finalExt = 'mp3';
      mimeType = 'audio/mpeg';
      console.log(`[AUDIO ENCODER] Successfully encoded genuine MP3 (${finalBuffer.length} bytes)`);
    } catch (convErr: any) {
      console.warn('[AUDIO ENCODER] MP3 conversion fallback to WAV:', convErr.message);
      finalBuffer = wavBuffer;
      finalExt = 'wav';
      mimeType = 'audio/wav';
    }

    const filename = `boletin-rcv-${draftId || Date.now()}-${Date.now()}.${finalExt}`;
    const filePath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filePath, finalBuffer);

    const audioUrl = `/api/audio/file/${filename}`;
    const durationSeconds = Math.max(
      15,
      Math.round(cleanSpokenText.split(' ').length / 2.3)
    );

    // Update usage stats
    updateUsageStats(true, cleanSpokenText.length, false);

    return res.json({
      success: true,
      audioUrl,
      filename,
      durationSeconds,
      voiceName: voice.name,
      format: finalExt,
      fileSizeKb: Math.round(finalBuffer.length / 1024),
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isQuota =
      errMsg.includes('429') ||
      errMsg.includes('quota') ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      err?.status === 429 ||
      err?.status === 'RESOURCE_EXHAUSTED';

    if (isQuota) {
      console.log('[AI Quota Manager] Gemini TTS rate limit reached, advising browser speech.');
      return res.status(429).json({
        error:
          'Se ha alcanzado la cuota gratuita diaria de voces en la nube de Google Gemini. Puedes continuar generando y escuchando tus boletines al 100% de manera ilimitada y gratuita utilizando el botón "Locución del Navegador".',
        isQuotaExceeded: true,
      });
    }

    console.error('Gemini TTS synthesis error:', errMsg);
    return res.status(500).json({
      error: `Error al generar audio con IA: ${errMsg}.`,
    });
  }
});

// Serve audio file with genuine MP3 / WAV content-type
app.get('/api/audio/file/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join(AUDIO_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Audio no encontrado');
  }

  const isMp3 = filename.endsWith('.mp3');
  res.setHeader('Content-Type', isMp3 ? 'audio/mpeg' : 'audio/wav');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Bulletins Library CRUD
app.get('/api/bulletins', (req: Request, res: Response) => {
  const bulletins = getBulletins();
  res.json(
    bulletins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );
});

app.post('/api/bulletins', (req: Request, res: Response) => {
  const draft: BulletinDraft = req.body;
  if (!draft || !draft.title) {
    return res.status(400).json({ error: 'Datos de boletín inválidos' });
  }

  const bulletins = getBulletins();
  const existingIndex = bulletins.findIndex((b) => b.id === draft.id);

  if (existingIndex >= 0) {
    bulletins[existingIndex] = { ...bulletins[existingIndex], ...draft };
  } else {
    bulletins.unshift(draft);
  }

  saveBulletins(bulletins);
  res.json(draft);
});

app.delete('/api/bulletins/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const bulletins = getBulletins();
  const filtered = bulletins.filter((b) => b.id !== id);
  saveBulletins(filtered);
  res.json({ success: true });
});

// Station Config
app.get('/api/station-config', (req: Request, res: Response) => {
  res.json(getStationConfig());
});

app.post('/api/station-config', (req: Request, res: Response) => {
  const current = getStationConfig();
  const updated = { ...current, ...req.body };
  saveStationConfig(updated);
  res.json(updated);
});

// Schedule Config
app.get('/api/schedule', (req: Request, res: Response) => {
  res.json(getScheduleConfig());
});

app.post('/api/schedule', (req: Request, res: Response) => {
  const current = getScheduleConfig();
  const updated = { ...current, ...req.body };
  saveScheduleConfig(updated);
  res.json(updated);
});

// Cost & Usage Stats API
app.get('/api/usage-stats', (req: Request, res: Response) => {
  res.json(getUsageStats());
});

// Background Automated Scheduler (Argentina UTC-3)
let lastCheckedMinute = -1;

setInterval(async () => {
  try {
    const schedule = getScheduleConfig();
    if (!schedule.autoEnabled) return;

    const nowUtc = new Date();
    const nowArg = new Date(nowUtc.getTime() - 3 * 60 * 60 * 1000);
    const hours = String(nowArg.getUTCHours()).padStart(2, '0');
    const minutes = String(nowArg.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const currentMinuteNum = nowArg.getUTCMinutes();
    if (currentMinuteNum === lastCheckedMinute) return;
    lastCheckedMinute = currentMinuteNum;

    const matchingSlot = schedule.slots.find((s) => s.enabled && s.time === timeStr);

    if (matchingSlot) {
      console.log(`[SCHEDULE CRON] Executing scheduled slot: ${matchingSlot.label} (${timeStr} hs Corrientes)`);

      // 1. Gather news
      const sources = getSources().filter((s) => s.active);
      let gathered: NewsItem[] = [];
      for (const src of sources) {
        try {
          const items = await fetchAndParseRss(src);
          gathered.push(...items);
        } catch (e: any) {
          // ignore individual error
        }
      }

      const existing = getGatheredNews();
      const combined = deduplicateNews([...gathered, ...existing]);
      saveGatheredNews(combined);

      // 2. Select top news
      const topNews = combined.slice(0, matchingSlot.newsCount || 5);
      if (topNews.length === 0) return;

      const station = getStationConfig();
      const intro = station.openingTemplate.replace('{EMISORA}', station.stationName);
      const outro = station.closingTemplate.replace('{EMISORA}', station.stationName);

      // 3. Create draft
      const segments: BulletinSegment[] = [
        {
          id: 'seg-apertura',
          type: 'apertura',
          title: 'Apertura',
          text: intro,
        },
      ];

      topNews.forEach((n, idx) => {
        segments.push({
          id: `seg-trans-${idx}`,
          type: 'transicion',
          text: idx === 0 ? 'Comenzamos con la información más relevante de la jornada.' : 'En otra de las noticias destacadas,',
        });
        segments.push({
          id: `seg-news-${idx}`,
          type: 'noticia',
          title: n.title,
          category: n.category,
          text: `${n.title}. ${n.summary}`,
          sourceAttribution: `Reportado por ${n.sourceName}`,
          sourceUrl: n.originalUrl,
          requiresReview: n.requiresHumanReview,
        });
      });

      segments.push({
        id: 'seg-cierre',
        type: 'cierre',
        title: 'Cierre',
        text: outro,
      });

      const fullScript = segments.map((s) => s.text).join('\n\n');
      const draftId = `sched-${Date.now()}`;

      // Save as pending draft (respecting user rule: generate draft automatically, require manual approval for audio MP3)
      const savedBulletins = getBulletins();
      savedBulletins.unshift({
        id: draftId,
        title: `${matchingSlot.label} (${matchingSlot.time} hs)`,
        stationName: station.stationName,
        createdAt: new Date().toISOString(),
        timePeriod: 'Programación Automática',
        segments,
        fullScript,
        selectedNewsCount: topNews.length,
        sourcesUsed: Array.from(new Set(topNews.map((n) => n.sourceName))),
        status: 'draft',
        voiceId: matchingSlot.voiceId,
        fileFormat: 'mp3',
      });
      saveBulletins(savedBulletins);

      matchingSlot.lastRunAt = new Date().toISOString();
      matchingSlot.lastStatus = 'success';
      saveScheduleConfig(schedule);
      console.log(`[SCHEDULE CRON] Prepared scheduled draft ${draftId} for review.`);
    }
  } catch (err: any) {
    console.error('[SCHEDULE CRON] Error:', err.message);
  }
}, 60000);

// Explicit API 404 handler: guarantees /api/* routes NEVER fall through to Vite SPA index.html fallback
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `Ruta de API no encontrada: ${req.method} ${req.originalUrl}` });
});

// Explicit Server Error Handler: returns JSON instead of default Express HTML error page
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('[SERVER UNHANDLED ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

// Start Server with Vite Dev or Static Production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(` CENTRAL DE NOTICIAS IA – RADIO CORRIENTES VIVA`);
    console.log(` Port: ${PORT} | Timezone: America/Argentina/Buenos_Aires (UTC-3)`);
    console.log(` MP3 Encoder: lamejs (MPEG-1 Layer 3 128 kbps)`);
    console.log(`=========================================`);
  });
}

startServer();
