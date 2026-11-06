import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { GoogleGenAI, Type } from '@google/genai';
// Direct import of ESM bundle to guarantee Mp3Encoder constructor is present in tsx/Node runtime
// @ts-ignore
import * as breezystackLame from './node_modules/@breezystack/lamejs/dist/lamejs.js';
const Mp3Encoder =
  (breezystackLame as any).Mp3Encoder ||
  (breezystackLame as any).default?.Mp3Encoder;
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
const SESSIONS_DIR = path.resolve(DATA_DIR, 'sessions');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS configuration for seamless multi-device access (desktop, mobile, external browsers)
app.use((req: Request, res: Response, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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

interface CurtainMixOptions {
  curtainId?: string;
  customCurtainUrl?: string;
  baseVolume?: number;
  duckingVolume?: number;
  enabled?: boolean;
}

// Professional Broadcast Radio Audio Mixer with Dynamic Ducking
function mixVoiceWithBackgroundCurtain(voiceWavBuffer: Buffer, options: CurtainMixOptions = {}): Buffer {
  if (options.enabled === false) {
    return voiceWavBuffer;
  }

  const baseVolume =
    typeof options.baseVolume === 'number'
      ? Math.max(0.08, Math.min(0.5, options.baseVolume))
      : 0.25;
  const duckingVolume =
    typeof options.duckingVolume === 'number'
      ? Math.max(0.03, Math.min(0.2, options.duckingVolume))
      : 0.08;
  const curtainId = options.curtainId || 'curtain-rcv-institucional';

  try {
    // 1. Parse Voice WAV Buffer
    const channels = voiceWavBuffer.readUInt16LE(22) || 1;
    const sampleRate = voiceWavBuffer.readUInt32LE(24) || 24000;

    let dataOffset = 12;
    let found = false;
    while (dataOffset < voiceWavBuffer.length - 8) {
      const chunkId = voiceWavBuffer.toString('ascii', dataOffset, dataOffset + 4);
      const chunkSize = voiceWavBuffer.readUInt32LE(dataOffset + 4);
      if (chunkId === 'data') {
        dataOffset += 8;
        found = true;
        break;
      }
      dataOffset += 8 + chunkSize;
    }
    if (!found) dataOffset = 44;

    const voicePcm = voiceWavBuffer.subarray(dataOffset);
    const voiceSamplesCount = Math.floor(voicePcm.byteLength / 2);
    if (voiceSamplesCount <= 0) return voiceWavBuffer;

    // Safe memory extraction avoiding unaligned Int16Array byte offsets
    let voiceSamples: Int16Array;
    if (voicePcm.byteOffset % 2 === 0) {
      voiceSamples = new Int16Array(
        voicePcm.buffer,
        voicePcm.byteOffset,
        voiceSamplesCount
      );
    } else {
      voiceSamples = new Int16Array(voiceSamplesCount);
      for (let i = 0; i < voiceSamplesCount; i++) {
        voiceSamples[i] = voicePcm.readInt16LE(i * 2);
      }
    }

    const voiceDurationSec = voiceSamplesCount / (sampleRate * channels);

    // 2. Radio Timing Structure
    // Intro lead: 1.0s of curtain at baseVolume before speech enters
    // Outro lead: 1.8s of curtain at baseVolume after speech completes
    const introLeadSec = 1.0;
    const outroLeadSec = 1.8;
    const totalDurationSec = introLeadSec + voiceDurationSec + outroLeadSec;
    const totalFrames = Math.ceil(totalDurationSec * sampleRate);
    const introFrames = Math.floor(introLeadSec * sampleRate);

    // 3. Custom curtain PCM decoding if provided as WAV data URL
    let customSamples: Int16Array | null = null;
    let customSampleRate = sampleRate;
    let customChannels = 1;

    if (options.customCurtainUrl && typeof options.customCurtainUrl === 'string') {
      try {
        let customBuf: Buffer | null = null;
        if (options.customCurtainUrl.startsWith('/api/audio/file/')) {
          const fname = options.customCurtainUrl.replace('/api/audio/file/', '');
          const fpath = path.join(AUDIO_DIR, fname);
          if (fs.existsSync(fpath)) {
            customBuf = fs.readFileSync(fpath);
            console.log(`[Audio Mixer] Reading custom curtain from disk: ${fpath} (${customBuf.length} bytes)`);
          }
        } else if (options.customCurtainUrl.startsWith('data:')) {
          const base64Index = options.customCurtainUrl.indexOf('base64,');
          if (base64Index !== -1) {
            const rawBase64 = options.customCurtainUrl.substring(base64Index + 7);
            customBuf = Buffer.from(rawBase64, 'base64');
          }
        }

        if (customBuf && customBuf.length > 44) {
          if (customBuf.toString('ascii', 0, 4) === 'RIFF') {
            let cOffset = 12;
            while (cOffset < customBuf.length - 8) {
              const cId = customBuf.toString('ascii', cOffset, cOffset + 4);
              const cSize = customBuf.readUInt32LE(cOffset + 4);
              if (cId === 'data') {
                cOffset += 8;
                const cPcm = customBuf.subarray(cOffset, cOffset + cSize);
                const sCount = Math.floor(cPcm.byteLength / 2);
                if (cPcm.byteOffset % 2 === 0) {
                  customSamples = new Int16Array(cPcm.buffer, cPcm.byteOffset, sCount);
                } else {
                  customSamples = new Int16Array(sCount);
                  for (let i = 0; i < sCount; i++) {
                    customSamples[i] = cPcm.readInt16LE(i * 2);
                  }
                }
                customSampleRate = customBuf.readUInt32LE(24) || sampleRate;
                customChannels = customBuf.readUInt16LE(22) || 1;
                console.log(
                  `[Audio Mixer] Successfully loaded custom audio curtain: ${customSamples.length} samples at ${customSampleRate}Hz (${customChannels}ch)`
                );
                break;
              }
              cOffset += 8 + cSize;
            }
          }
        }
      } catch (custErr) {
        console.warn('[Audio Mixer] Custom audio parsing fell back to synthesized bed:', custErr);
      }
    }

    // 4. Harmonic musical progressions for broadcast beds (warm, acoustic, melodic)
    let chords: number[][];
    let tempo = 96;

    switch (curtainId) {
      case 'curtain-rcv-urgente':
        chords = [
          [146.83, 220.0, 261.63], // Dm
          [130.81, 196.0, 246.94], // C
          [116.54, 174.61, 233.08],// Bb
          [110.0, 164.81, 220.0],  // A
        ];
        tempo = 110;
        break;
      case 'curtain-rcv-panorama':
        chords = [
          [130.81, 196.0, 261.63], // C
          [196.0, 246.94, 293.66], // G
          [110.0, 164.81, 220.0],  // Am
          [174.61, 220.0, 261.63], // F
        ];
        tempo = 95;
        break;
      case 'curtain-rcv-litoral':
        chords = [
          [110.0, 164.81, 220.0],  // Am
          [146.83, 220.0, 261.63], // Dm
          [196.0, 246.94, 293.66], // G
          [130.81, 196.0, 261.63], // C
        ];
        tempo = 84;
        break;
      case 'curtain-rcv-institucional':
      default:
        chords = [
          [146.83, 220.0, 293.66], // Dm
          [174.61, 220.0, 349.23], // F
          [196.0, 246.94, 293.66], // G
          [110.0, 164.81, 220.0],  // Am
        ];
        tempo = 90;
        break;
    }

    const chordDuration = (60 / tempo) * 4; // 4 beats per measure

    // 5. Output PCM array
    const outSamplesCount = totalFrames * channels;
    const outputSamples = new Int16Array(outSamplesCount);

    const voiceEndFrame = introFrames + Math.floor(voiceSamplesCount / channels);
    const fadeOutFrames = Math.floor(0.8 * sampleRate);
    const duckRampFrames = Math.floor(0.35 * sampleRate); // 350ms smooth S-curve ducking ramp

    for (let f = 0; f < totalFrames; f++) {
      const t = f / sampleRate;

      // Smooth Ducking Envelope (Cosine S-curve to prevent any audible pops or clicks)
      let musicVol = baseVolume;
      if (f < introFrames) {
        musicVol = baseVolume;
      } else if (f >= introFrames && f < introFrames + duckRampFrames) {
        const p = (f - introFrames) / duckRampFrames;
        const smooth = 0.5 - 0.5 * Math.cos(Math.PI * p);
        musicVol = baseVolume * (1 - smooth) + duckingVolume * smooth;
      } else if (f >= introFrames + duckRampFrames && f < voiceEndFrame) {
        musicVol = duckingVolume;
      } else if (f >= voiceEndFrame && f < voiceEndFrame + duckRampFrames) {
        const p = (f - voiceEndFrame) / duckRampFrames;
        const smooth = 0.5 - 0.5 * Math.cos(Math.PI * p);
        musicVol = duckingVolume * (1 - smooth) + baseVolume * smooth;
      } else if (f >= voiceEndFrame + duckRampFrames && f < totalFrames - fadeOutFrames) {
        musicVol = baseVolume;
      } else {
        const rem = Math.max(0, totalFrames - f);
        musicVol = baseVolume * (rem / fadeOutFrames);
      }

      // Generate Music Bed Sample at time t
      let musicSample = 0;

      if (customSamples && customSamples.length > 0) {
        // High quality linear interpolation + stereo to mono downmixing (ZERO phase jumps or noise)
        const totalCustomFrames = Math.floor(customSamples.length / customChannels);
        if (totalCustomFrames > 0) {
          const samplePos = (t * customSampleRate) % totalCustomFrames;
          const idx0 = Math.floor(samplePos);
          const frac = samplePos - idx0;
          const idx1 = (idx0 + 1) % totalCustomFrames;

          let s0 = 0, s1 = 0;
          if (customChannels === 2) {
            s0 = (customSamples[idx0 * 2] + customSamples[idx0 * 2 + 1]) / 65536.0;
            s1 = (customSamples[idx1 * 2] + customSamples[idx1 * 2 + 1]) / 65536.0;
          } else {
            s0 = customSamples[idx0] / 32768.0;
            s1 = customSamples[idx1] / 32768.0;
          }
          musicSample = s0 * (1 - frac) + s1 * frac;
        }
      } else {
        // Broadcast Radio Acoustic Synth Bed:
        // Pure sinusoidal harmonics with continuous phase, gentle lowpass rolloff
        const chordIndex = Math.floor(t / chordDuration) % chords.length;
        const chord = chords[chordIndex];
        const measureT = (t % chordDuration) / chordDuration;
        const padEnvelope = 0.6 + 0.4 * Math.sin(measureT * Math.PI);

        // Warm chord harmonic pad
        for (let i = 0; i < chord.length; i++) {
          const f0 = chord[i];
          const tone =
            Math.sin(2 * Math.PI * f0 * t) * 0.15 +
            Math.sin(2 * Math.PI * f0 * 2 * t) * 0.05;
          musicSample += tone * padEnvelope;
        }

        // Soft melodic broadcast chime (opening & closing identifiers)
        if (t < 1.0) {
          const chimeEnv = Math.exp(-3.5 * t);
          musicSample +=
            (Math.sin(2 * Math.PI * 587.33 * t) * 0.18 +
             Math.sin(2 * Math.PI * 880.00 * t) * 0.10) * chimeEnv;
        }
        const outroT = t - voiceEndFrame / sampleRate;
        if (outroT >= 0 && outroT < 1.5) {
          const chimeEnv = Math.exp(-3.0 * outroT);
          musicSample +=
            (Math.sin(2 * Math.PI * 587.33 * outroT) * 0.18 +
             Math.sin(2 * Math.PI * 880.00 * outroT) * 0.10) * chimeEnv;
        }
      }

      // Mix channels without clipping
      for (let ch = 0; ch < channels; ch++) {
        let voiceSampleFloat = 0;
        if (f >= introFrames && f < voiceEndFrame) {
          const vIdx = (f - introFrames) * channels + ch;
          if (vIdx < voiceSamples.length) {
            voiceSampleFloat = voiceSamples[vIdx] / 32768.0;
          }
        }

        const mixed = voiceSampleFloat * 0.92 + musicSample * musicVol;
        const clipped = Math.max(-0.95, Math.min(0.95, mixed));
        outputSamples[f * channels + ch] = Math.round(clipped * 32767);
      }
    }

    // 6. Build Standard 44-byte WAV Buffer
    const byteLength = outputSamples.length * 2;
    const mixedWav = Buffer.alloc(44 + byteLength);

    mixedWav.write('RIFF', 0);
    mixedWav.writeUInt32LE(36 + byteLength, 4);
    mixedWav.write('WAVE', 8);

    mixedWav.write('fmt ', 12);
    mixedWav.writeUInt32LE(16, 16);
    mixedWav.writeUInt16LE(1, 20);
    mixedWav.writeUInt16LE(channels, 22);
    mixedWav.writeUInt32LE(sampleRate, 24);
    mixedWav.writeUInt32LE(sampleRate * channels * 2, 28);
    mixedWav.writeUInt16LE(channels * 2, 32);
    mixedWav.writeUInt16LE(16, 34);

    mixedWav.write('data', 36);
    mixedWav.writeUInt32LE(byteLength, 40);

    Buffer.from(
      outputSamples.buffer,
      outputSamples.byteOffset,
      outputSamples.byteLength
    ).copy(mixedWav, 44);

    console.log(
      `[Audio Mixer] Successfully produced broadcast mix with ducking: voice=${voiceDurationSec.toFixed(
        1
      )}s, total=${totalDurationSec.toFixed(1)}s, curtain=${curtainId}`
    );
    return Buffer.from(mixedWav);
  } catch (mixErr) {
    console.error('[Audio Mixer] Error during mixing, returning voice buffer:', mixErr);
    return Buffer.from(voiceWavBuffer);
  }
}

// Genuine WAV to MP3 Converter using lamejs
function convertWavToMp3(wavBuffer: Buffer): Buffer {
  try {
    if (!Mp3Encoder) {
      throw new Error('El codificador MP3 (lamejs) no está disponible en este entorno');
    }

    // Read standard 44-byte RIFF WAV header
    const channels = wavBuffer.readUInt16LE(22) || 1;
    const sampleRate = wavBuffer.readUInt32LE(24) || 24000;

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
    const sampleCount = Math.floor(pcmData.byteLength / 2);
    if (sampleCount <= 0) {
      throw new Error('Buffer WAV sin muestras PCM de audio');
    }

    // Safely extract Int16Array regardless of buffer memory byteOffset alignment
    let samples: Int16Array;
    if (pcmData.byteOffset % 2 === 0) {
      samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, sampleCount);
    } else {
      samples = new Int16Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        samples[i] = pcmData.readInt16LE(i * 2);
      }
    }

    // Initialize 128 kbps broadcast MP3 encoder
    const mp3encoder = new Mp3Encoder(channels, sampleRate, 128);
    const mp3Chunks: Buffer[] = [];
    const blockSize = 1152;

    if (channels === 1) {
      for (let i = 0; i < samples.length; i += blockSize) {
        const chunk = samples.subarray(i, i + blockSize);
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if (mp3buf && mp3buf.length > 0) {
          mp3Chunks.push(Buffer.from(mp3buf));
        }
      }
    } else {
      // Stereo: split channels
      const half = Math.floor(samples.length / 2);
      const left = new Int16Array(half);
      const right = new Int16Array(half);
      for (let i = 0; i < half; i++) {
        left[i] = samples[i * 2];
        right[i] = samples[i * 2 + 1];
      }
      for (let i = 0; i < left.length; i += blockSize) {
        const leftChunk = left.subarray(i, i + blockSize);
        const rightChunk = right.subarray(i, i + blockSize);
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf && mp3buf.length > 0) {
          mp3Chunks.push(Buffer.from(mp3buf));
        }
      }
    }

    const endBuf = mp3encoder.flush();
    if (endBuf && endBuf.length > 0) {
      mp3Chunks.push(Buffer.from(endBuf));
    }

    const finalMp3Buffer = Buffer.concat(mp3Chunks);
    if (finalMp3Buffer.length === 0) {
      throw new Error('La codificación MP3 generó un archivo de 0 bytes');
    }

    return finalMp3Buffer;
  } catch (err) {
    console.error('Error converting WAV to MP3 with lamejs:', err);
    throw err;
  }
}

// Generate Broadcast Radio Audio Bed in WAV format
function generateInstitutionalRadioBedWav(
  durationSec: number,
  options: CurtainMixOptions = {}
): Buffer {
  const sampleRate = 24000;
  const channels = 1;
  const totalSamples = Math.max(24000 * 8, Math.floor(durationSec * sampleRate));
  const silencePcm = Buffer.alloc(totalSamples * 2);

  const dummyWav = Buffer.alloc(44 + silencePcm.length);
  dummyWav.write('RIFF', 0);
  dummyWav.writeUInt32LE(36 + silencePcm.length, 4);
  dummyWav.write('WAVE', 8);
  dummyWav.write('fmt ', 12);
  dummyWav.writeUInt32LE(16, 16);
  dummyWav.writeUInt16LE(1, 20); // PCM
  dummyWav.writeUInt16LE(channels, 22);
  dummyWav.writeUInt32LE(sampleRate, 24);
  dummyWav.writeUInt32LE(sampleRate * channels * 2, 28);
  dummyWav.writeUInt16LE(channels * 2, 32);
  dummyWav.writeUInt16LE(16, 34);
  dummyWav.write('data', 36);
  dummyWav.writeUInt32LE(silencePcm.length, 40);
  silencePcm.copy(dummyWav, 44);

  return mixVoiceWithBackgroundCurtain(dummyWav, {
    ...options,
    enabled: true,
  });
}

// Split bulletin scripts into natural speech chunks for TTS models (~600-800 chars per chunk)
function splitScriptIntoChunks(fullText: string, maxChunkLength = 700): string[] {
  const clean = fullText.replace(/[*_#`]/g, '').trim();
  const paragraphs = clean
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkLength) {
      const sentences = paragraph
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const sentence of sentences) {
        if ((currentChunk + ' ' + sentence).trim().length <= maxChunkLength) {
          currentChunk = (currentChunk + ' ' + sentence).trim();
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = sentence;
        }
      }
    } else {
      if ((currentChunk + '\n\n' + paragraph).trim().length <= maxChunkLength) {
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [clean];
}

// Generate Speech Audio using prioritized Gemini TTS models with rate-limit backoff
async function generateSpeechAudio(
  ai: GoogleGenAI,
  text: string,
  voice: VoiceOption
): Promise<string> {
  // gemini-3.8-flash-tts is primary, gemini-3.8-flash-lite-tts is secondary
  const candidateModels = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
  let lastError: any = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`[TTS Engine] Requesting speech with model ${model} (Attempt ${attempt + 1}, Voice: ${voice.geminiVoice})...`);
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text,
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
        if (base64Wav && base64Wav.length > 100) {
          console.log(`[TTS Engine] Model ${model} returned ${base64Wav.length} base64 chars of audio.`);
          return base64Wav;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        const isRateLimit =
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('quota') ||
          msg.includes('rate-limit');
        console.warn(`[TTS Engine] Model ${model} (attempt ${attempt + 1}) failed: ${msg}`);
        lastError = err;

        if (isRateLimit && attempt === 0) {
          // Automatic backoff: wait 6 seconds to clear the rate-limit window
          console.log('[TTS Engine] Rate limit encountered, pausing 6s before retry...');
          await new Promise((r) => setTimeout(r, 6000));
          continue;
        }
        break; // try next candidate model
      }
    }
  }

  throw lastError || new Error('No se pudo generar voz con los modelos TTS disponibles');
}

// Synthesize voice across multiple chunks using Gemini TTS
async function synthesizeVoiceWithGemini(
  ai: GoogleGenAI,
  text: string,
  voice: VoiceOption
): Promise<Buffer> {
  // Use natural paragraphs up to 1800 chars so even large 15-24 news bulletins require only 2-3 calls
  const chunks = splitScriptIntoChunks(text, 1800);
  console.log(`[TTS Engine] Synthesizing ${chunks.length} chunk(s) (${voice.geminiVoice})...`);

  const pcmBuffers: Buffer[] = [];
  let sampleRate = 24000;
  let channels = 1;

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    console.log(`[TTS Engine] Processing chunk ${i + 1}/${chunks.length} (${chunkText.length} chars)...`);

    const base64Wav = await generateSpeechAudio(ai, chunkText, voice);

    const wavBuf = Buffer.from(base64Wav, 'base64');
    channels = wavBuf.readUInt16LE(22) || 1;
    sampleRate = wavBuf.readUInt32LE(24) || 24000;

    let dataOffset = 12;
    let found = false;
    while (dataOffset < wavBuf.length - 8) {
      const cId = wavBuf.toString('ascii', dataOffset, dataOffset + 4);
      const cSize = wavBuf.readUInt32LE(dataOffset + 4);
      if (cId === 'data') {
        dataOffset += 8;
        found = true;
        break;
      }
      dataOffset += 8 + cSize;
    }
    if (!found) dataOffset = 44;

    const rawPcm = wavBuf.subarray(dataOffset);
    pcmBuffers.push(Buffer.from(rawPcm));

    // 250ms silence between chunks for natural radio pacing
    if (i < chunks.length - 1) {
      const silenceBytes = Math.floor(sampleRate * channels * 2 * 0.25);
      pcmBuffers.push(Buffer.alloc(silenceBytes));
      // Gentle 1.2s delay between API chunk calls to prevent bursting RPM limits
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  const totalPcm = Buffer.concat(pcmBuffers);
  const totalWav = Buffer.alloc(44 + totalPcm.length);

  totalWav.write('RIFF', 0);
  totalWav.writeUInt32LE(36 + totalPcm.length, 4);
  totalWav.write('WAVE', 8);
  totalWav.write('fmt ', 12);
  totalWav.writeUInt32LE(16, 16);
  totalWav.writeUInt16LE(1, 20); // PCM
  totalWav.writeUInt16LE(channels, 22);
  totalWav.writeUInt32LE(sampleRate, 24);
  totalWav.writeUInt32LE(sampleRate * channels * 2, 28);
  totalWav.writeUInt16LE(channels * 2, 32);
  totalWav.writeUInt16LE(16, 34);
  totalWav.write('data', 36);
  totalWav.writeUInt32LE(totalPcm.length, 40);
  totalPcm.copy(totalWav, 44);

  return totalWav;
}

// Initial Sources: Corrientes, Litoral / NEA, and National
const DEFAULT_SOURCES: NewsSource[] = [
  {
    id: 'diario-corrientes',
    name: 'Diario El Libertador y Noticias de Corrientes (El Litoral, Época, Radio Dos)',
    siteUrl: 'https://www.ellitoral.com.ar',
    rssUrl: 'https://news.google.com/rss/search?q=Corrientes&hl=es-419&gl=AR&ceid=AR:es-419',
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
  let targetUrl = source.rssUrl;
  if (targetUrl.includes('diarioellibertador.com.ar')) {
    targetUrl = 'https://news.google.com/rss/search?q=Corrientes&hl=es-419&gl=AR&ceid=AR:es-419';
  }

  const fetchRssText = async (url: string, timeoutMs: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
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
      return await response.text();
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  let xmlText = '';
  try {
    xmlText = await fetchRssText(targetUrl, 7000);
  } catch (primaryErr: any) {
    if (
      source.regionOrCity.toLowerCase().includes('corrientes') ||
      source.id.includes('corrientes') ||
      source.id.includes('libertador')
    ) {
      try {
        console.log(`[RSS Ingestion] Fallback to regional Corrientes feed for ${source.name}`);
        xmlText = await fetchRssText(
          'https://news.google.com/rss/search?q=Corrientes&hl=es-419&gl=AR&ceid=AR:es-419',
          5000
        );
      } catch (backupErr) {
        return [];
      }
    } else {
      return [];
    }
  }

  try {
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
    console.log(`[RSS XML Parse] Error parsing XML for ${source.name}:`, err?.message);
    return [];
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
      console.log(`[RSS Ingestion] Notice for ${source.name}:`, err?.message);
      source.status = 'ok';
      source.lastFetchedAt = new Date().toISOString();
      errors.push({ sourceName: source.name, error: err?.message || 'Demora de conexión' });
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
  const { period = '6h', count = 5, categories = [], sourceMix } = req.body;
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

  // Filter by overall categories if set
  if (categories.length > 0) {
    candidates = candidates.filter((item) => categories.includes(item.category));
  }

  // Filter by Source Category Mix if configured (e.g., Infobae: Policiales + Política, Clarín: Deportes + Salud)
  let mixEntries: [string, string[]][] = [];
  if (sourceMix && typeof sourceMix === 'object') {
    mixEntries = Object.entries(sourceMix).filter(
      ([_, cats]) => Array.isArray(cats) && cats.length > 0
    ) as [string, string[]][];
  }

  const matchesMix = (item: NewsItem) => {
    if (mixEntries.length === 0) return true;
    return mixEntries.some(([srcKey, cats]) => {
      const srcKeyLower = srcKey.toLowerCase();
      const srcKeyBase = srcKeyLower.split('-')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const itemSrcBase = (item.sourceId || '').toLowerCase().split('-')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const itemSrcName = (item.sourceName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const matchesSource =
        item.sourceId === srcKey ||
        itemSrcName === srcKeyLower ||
        itemSrcName.includes(srcKeyLower) ||
        srcKeyLower.includes(itemSrcName) ||
        (srcKeyBase.length >= 4 && itemSrcName.includes(srcKeyBase)) ||
        (srcKeyBase.length >= 4 && itemSrcBase === srcKeyBase);

      if (!matchesSource) return false;
      return cats.includes(item.category);
    });
  };

  if (mixEntries.length > 0) {
    const mixFiltered = candidates.filter(matchesMix);
    if (mixFiltered.length > 0) {
      candidates = mixFiltered;
    } else {
      const allMixFiltered = allNews.filter(matchesMix);
      if (allMixFiltered.length > 0) {
        candidates = allMixFiltered;
      }
    }
  }

  // Use Gemini to intelligently rank and cluster with Corrientes & Regional priority
  const ai = getGenAIClient();
  if (ai && candidates.length > 0) {
    try {
      const mixPromptText =
        mixEntries.length > 0
          ? `\n5. Regla mandatoria de mezcla por medios y secciones configurada: ${mixEntries
              .map(([s, c]) => `${s} -> [${c.join(', ')}]`)
              .join(' | ')}. Procura seleccionar noticias equilibradas entre estos medios y sus secciones asignadas.`
          : '';

      const prompt = `Actúa como Jefe de Redacción y Director de Noticias de Radio Corrientes Viva (Corrientes, Argentina).
Analiza las siguientes ${candidates.length} noticias candidatas de las últimas horas.
Criterios de selección periodística:
1. Priorizar temas de impacto regional en Corrientes y el Litoral (obras, río Paraná, clima, servicios, política local y nacional relevante).
2. Agrupar informaciones que traten sobre el mismo acontecimiento.
3. Diferenciar noticias confirmadas de hechos sin verificar.
4. Seleccionar exactamente las mejores ${count} noticias principales.${mixPromptText}

Candidatas:
${JSON.stringify(
  candidates.slice(0, Math.max(50, count + 20)).map((c) => ({
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
      const allCandidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
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

// Helper to provide fluid radio transition phrases matching category and pacing
function getTransitionForCategory(category?: string, idx?: number): string {
  const c = (category || '').toLowerCase();
  if (c.includes('política') || c.includes('politica')) {
    return 'En el ámbito político e institucional,';
  }
  if (c.includes('economía') || c.includes('economia')) {
    return 'En materia económica y productiva,';
  }
  if (c.includes('deporte')) {
    return 'En el panorama deportivo regional,';
  }
  if (c.includes('clima')) {
    return 'En cuanto a las condiciones del tiempo para las próximas horas,';
  }
  if (c.includes('cultura') || c.includes('carnaval')) {
    return 'En la agenda cultural y artística de nuestra provincia,';
  }
  if (c.includes('policial') || c.includes('seguridad')) {
    return 'En información del ámbito policial y judicial,';
  }
  if (c.includes('local') || c.includes('corrientes')) {
    return 'En otra de las noticias destacadas de la ciudad y el interior correntino,';
  }
  if (c.includes('regional') || c.includes('litoral') || c.includes('nea')) {
    return 'Ampliando el panorama hacia la región del Litoral,';
  }
  if (c.includes('nacional')) {
    return 'En el plano de las noticias nacionales,';
  }

  const general = [
    'Continuando con más información para toda la provincia,',
    'Por otra parte, entre los temas importantes de esta hora,',
    'En otro de los acontecimientos destacados de la jornada,',
    'Asimismo, en el reporte de esta hora,',
    'Siguiendo con el desarrollo informativo,',
  ];
  return general[(idx || 0) % general.length];
}

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
    station.openingTemplate.replace('{EMISORA}', station.stationName);
  const stationOutro =
    customClosing ||
    station.closingTemplate.replace('{EMISORA}', station.stationName);

  if (ai) {
    try {
      const prompt = `Eres el redactor periodístico y locutor jefe de "${station.stationName}" en ${station.cityCountry}.
Redacta un boletín informativo profesional de radio con las siguientes noticias seleccionadas.

PAUTAS DE ESTILO RADIAL FUNDAMENTALES:
1. Lenguaje oral, claro, profesional, objetivo y dinámico, pensado para ser leído al aire para la audiencia de Corrientes y la región del Litoral.
2. NUNCA utilizar frases artificiales como "según el artículo que estamos leyendo" ni "en este posteo".
3. Transiciones naturales entre noticias ("En materia económica...", "En noticias de la región...", "Pasando al plano deportivo...", "Por otra parte...").
4. CERO invención: no inventar cifras, declaraciones ni nombres; atribuir la procedencia con claridad (ej: "según informó El Libertador", "de acuerdo con Infobae", etc.).
5. Estructura del boletín:
   - Apertura informativa cordial con saludo de la emisora ${station.stationName}.
   - Segmentos de noticias con sus transiciones fluidas.
   - Cierre institucional con despedida formal de ${station.stationName}.

REQUISITO ESTRICTO DE INTEGRIDAD PERIODÍSTICA:
Se han seleccionado EXACTAMENTE ${newsItems.length} noticias por la redacción.
El array "segments" DEBE incluir TODAS y cada una de las ${newsItems.length} noticias (exactamente ${newsItems.length} objetos en el array), respetando el orden recibido.
NO resumas en grupo, NO omitas ninguna noticia y NO reduzcas la cantidad. Deben redactarse las ${newsItems.length} noticias completas.

Noticias de entrada (${newsItems.length} noticias a procesar):
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
- segments: Array con exactamente ${newsItems.length} objetos de noticia con:
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
      const allCandidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
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
                    description: `Array con exactamente ${newsItems.length} noticias redactadas`,
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
        const segments: BulletinSegment[] = [];

        // 1. Apertura
        segments.push({
          id: 'seg-apertura',
          type: 'apertura',
          title: 'Apertura Institucional',
          text: parsed.aperturaText || stationIntro,
        });

        // 2. Map EVERY newsItem to guarantee that ALL selected news (e.g. 15, 20, 24) are present!
        newsItems.forEach((n: any, idx: number) => {
          const seg = rawSegments[idx];

          const transText =
            seg?.transitionText?.trim() ||
            (idx === 0
              ? 'Iniciamos el repaso informativo con el tema más destacado de la jornada.'
              : idx === newsItems.length - 1
              ? 'Para finalizar este resumen de noticias en Corrientes y la región,'
              : getTransitionForCategory(n.category, idx));

          segments.push({
            id: `seg-trans-${idx}`,
            type: 'transicion',
            text: transText,
          });

          segments.push({
            id: `seg-news-${idx}`,
            type: 'noticia',
            title: seg?.title?.trim() || n.title,
            category: (seg?.category as NewsCategory) || n.category || 'Sociedad',
            text:
              seg?.bodyText?.trim() ||
              `${n.title}. ${n.summary || 'Ampliando los detalles de esta información para nuestra audiencia.'}`,
            sourceAttribution:
              seg?.sourceAttribution ||
              `Informe periodístico de ${n.sourceName || station.stationName}`,
            sourceUrl: n.originalUrl,
            requiresReview: Boolean(seg?.requiresReview ?? n.requiresHumanReview),
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

        // Instantly register and persist in central storage
        try {
          const currentBulletins = getBulletins();
          const existingIdx = currentBulletins.findIndex((b) => b.id === draft.id);
          if (existingIdx >= 0) {
            currentBulletins[existingIdx] = draft;
          } else {
            currentBulletins.unshift(draft);
          }
          saveBulletins(currentBulletins);
          console.log(`[Central Storage] Auto-saved bulletin draft ${draft.id} (${draft.selectedNewsCount} news).`);
        } catch (saveErr) {
          console.warn('[Central Storage] Could not auto-save draft:', saveErr);
        }

        updateUsageStats(false, 0, true);
        return res.json(draft);
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

  // Instantly register and persist fallback draft in central storage
  try {
    const currentBulletins = getBulletins();
    const existingIdx = currentBulletins.findIndex((b) => b.id === draft.id);
    if (existingIdx >= 0) {
      currentBulletins[existingIdx] = draft;
    } else {
      currentBulletins.unshift(draft);
    }
    saveBulletins(currentBulletins);
    console.log(`[Central Storage] Auto-saved fallback draft ${draft.id} (${draft.selectedNewsCount} news).`);
  } catch (saveErr) {
    console.warn('[Central Storage] Could not auto-save draft:', saveErr);
  }

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
    `Transmite ${station.stationName}. Estas son las noticias más destacadas de la hora en Corrientes y la región.`;

  const ai = getGenAIClient();
  if (ai) {
    try {
      const base64Audio = await generateSpeechAudio(ai, sampleText, voice);
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

// Custom Background Music Curtain Upload endpoint
app.post('/api/audio/upload-curtain', (req: Request, res: Response) => {
  try {
    const { audioData, filename = 'cortina-personalizada.wav' } = req.body;
    if (!audioData || typeof audioData !== 'string') {
      return res.status(400).json({ error: 'Datos de audio no recibidos' });
    }

    let buffer: Buffer;
    if (audioData.startsWith('data:')) {
      const base64Index = audioData.indexOf('base64,');
      if (base64Index === -1) {
        return res.status(400).json({ error: 'Formato base64 no válido' });
      }
      buffer = Buffer.from(audioData.substring(base64Index + 7), 'base64');
    } else {
      buffer = Buffer.from(audioData, 'base64');
    }

    const ext = path.extname(filename) || '.wav';
    const savedFilename = `custom-curtain-${Date.now()}${ext}`;
    const filePath = path.join(AUDIO_DIR, savedFilename);
    fs.writeFileSync(filePath, buffer);

    const curtainUrl = `/api/audio/file/${savedFilename}`;
    console.log(`[Custom Curtain Upload] Saved ${savedFilename} (${Math.round(buffer.length / 1024)} KB)`);

    // Update station config with custom curtain
    const station = getStationConfig();
    station.selectedCurtainId = 'custom-uploaded';
    station.customCurtainUrl = curtainUrl;
    station.customCurtainName = filename;
    saveStationConfig(station);

    return res.json({
      success: true,
      curtainUrl,
      curtainName: filename,
      sizeKb: Math.round(buffer.length / 1024),
    });
  } catch (err: any) {
    console.error('Error saving custom curtain:', err);
    res.status(500).json({ error: `Error al guardar cortina: ${err.message}` });
  }
});

// Complete Audio Synthesis with Genuine MP3 Conversion via lamejs
app.post('/api/audio/synthesize', async (req: Request, res: Response) => {
  const {
    draftId,
    voiceId,
    scriptText,
    speed = 1.0,
    pitch = 1.0,
    includeCortina = true,
    selectedCurtainId,
    customCurtainUrl,
    musicBedVolume,
    musicBedDuckingVolume,
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
  let textToSynthesize = (scriptText || '').trim();

  // If text was not provided in body, try to recover from bulletin draft
  if (!textToSynthesize && draftId) {
    const bulletins = getBulletins();
    const foundDraft = bulletins.find((b) => b.id === draftId);
    if (foundDraft) {
      textToSynthesize =
        foundDraft.fullScript?.trim() ||
        foundDraft.segments?.map((s) => s.text).filter(Boolean).join('\n\n') ||
        '';
    }
  }

  if (!textToSynthesize) {
    textToSynthesize = `Transmite ${station.stationName}. Síntesis informativa de esta hora en Corrientes y la región.`;
  }

  try {
    const cleanSpokenText = textToSynthesize
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`]/g, '')
      .trim();

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(400).json({
        error:
          'No hay clave de Gemini API configurada en el servidor. Puedes utilizar "Vista Previa (Navegador)" para locución en vivo con música de fondo ducking sin consumir créditos.',
      });
    }

    let wavBuffer: Buffer;
    const synthesisMethod = 'gemini-tts';

    try {
      console.log(`[TTS Engine] Initiating Gemini voice synthesis for ${cleanSpokenText.length} characters...`);
      wavBuffer = await synthesizeVoiceWithGemini(ai, cleanSpokenText, voice);
      console.log(`[TTS Engine] Speech synthesis successful. Voice WAV size: ${wavBuffer.length} bytes`);
    } catch (ttsErr: any) {
      const msg = ttsErr?.message || '';
      const isQuota =
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('exceeded your current quota');
      console.error(`[TTS Engine] Voice synthesis error: ${msg}`);

      if (isQuota) {
        return res.status(429).json({
          error:
            'La cuota de síntesis de voz con IA en Google Cloud (Gemini TTS) se ha agotado temporalmente en este momento. Puedes utilizar de inmediato el botón "Vista Previa (Navegador)" para locutar todo el boletín con música de fondo en vivo y efecto ducking sin costo de cuota, o reintentar más tarde.',
        });
      }

      return res.status(500).json({
        error: `Error al sintetizar la locución: ${msg}. Puedes utilizar "Vista Previa (Navegador)" para locutar con música de fondo ducking sin interrupción.`,
      });
    }

    let processedWav: Buffer;
    const shouldIncludeCortina =
      includeCortina !== false &&
      (station.musicBedEnabled !== false || includeCortina === true);

    if (shouldIncludeCortina) {
      processedWav = Buffer.from(
        mixVoiceWithBackgroundCurtain(wavBuffer, {
          enabled: true,
          curtainId:
            selectedCurtainId || station.selectedCurtainId || 'curtain-rcv-institucional',
          customCurtainUrl: customCurtainUrl || station.customCurtainUrl,
          baseVolume:
            typeof musicBedVolume === 'number'
              ? musicBedVolume
              : station.musicBedVolume || 0.45,
          duckingVolume:
            typeof musicBedDuckingVolume === 'number'
              ? musicBedDuckingVolume
              : station.musicBedDuckingVolume || 0.14,
        })
      );
    } else {
      processedWav = wavBuffer;
    }

    // Convert mixed audio to genuine MP3 using lamejs
    let finalBuffer: Buffer;
    let finalExt = 'mp3';

    try {
      finalBuffer = convertWavToMp3(processedWav);
      finalExt = 'mp3';
      console.log(
        `[AUDIO ENCODER] Successfully encoded genuine MP3 (${finalBuffer.length} bytes, method=${synthesisMethod})`
      );
    } catch (convErr: any) {
      console.warn('[AUDIO ENCODER] MP3 conversion error, using WAV buffer:', convErr.message);
      finalBuffer = processedWav;
      finalExt = 'wav';
    }

    const filename = `boletin-rcv-${draftId || Date.now()}-${Date.now()}.${finalExt}`;
    const filePath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filePath, finalBuffer);

    const audioUrl = `/api/audio/file/${filename}`;
    const finalChannels = processedWav.readUInt16LE(22) || 1;
    const finalSampleRate = processedWav.readUInt32LE(24) || 24000;
    const durationSeconds = Math.max(
      15,
      Math.round((processedWav.length - 44) / (finalSampleRate * finalChannels * 2))
    );

    // Update usage stats
    updateUsageStats(true, cleanSpokenText.length, false);

    // Auto-save & update bulletin in central storage (data/bulletins.json)
    try {
      const currentBulletins = getBulletins();
      const existingIdx = currentBulletins.findIndex((b) => b.id === draftId);
      if (existingIdx >= 0) {
        currentBulletins[existingIdx] = {
          ...currentBulletins[existingIdx],
          audioUrl,
          audioDurationSeconds: durationSeconds,
          voiceId: voice.id,
          voiceName:
            synthesisMethod === 'gemini-tts'
              ? voice.name
              : `${station.stationName} (Banda Sonora Institucional)`,
          status: 'synthesized',
          fileFormat: finalExt as 'mp3' | 'wav',
        };
      } else {
        currentBulletins.unshift({
          id: draftId || `rcv-${Date.now()}`,
          title: `Boletín Informativo - ${station.stationName}`,
          stationName: station.stationName,
          createdAt: new Date().toISOString(),
          timePeriod: 'Emisión Radial',
          segments: [],
          fullScript: cleanSpokenText,
          selectedNewsCount: 1,
          sourcesUsed: [station.stationName],
          status: 'synthesized',
          voiceId: voice.id,
          voiceName:
            synthesisMethod === 'gemini-tts'
              ? voice.name
              : `${station.stationName} (Banda Sonora Institucional)`,
          audioUrl,
          audioDurationSeconds: durationSeconds,
          fileFormat: finalExt as 'mp3' | 'wav',
        });
      }
      saveBulletins(currentBulletins);
      console.log(`[Central Storage] Auto-saved synthesized audio bulletin to data/bulletins.json for ${draftId || filename}`);
    } catch (saveErr) {
      console.warn('[Central Storage] Could not auto-save bulletin in synthesize:', saveErr);
    }

    return res.json({
      success: true,
      audioUrl,
      filename,
      durationSeconds,
      voiceName:
        synthesisMethod === 'gemini-tts'
          ? voice.name
          : `${station.stationName} (Banda Sonora Institucional)`,
      format: finalExt,
      fileSizeKb: Math.round(finalBuffer.length / 1024),
      method: synthesisMethod,
      isAssistedBed: synthesisMethod !== 'gemini-tts',
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('Audio synthesis unexpected error:', errMsg);
    return res.status(500).json({
      error: `Error al procesar el audio: ${errMsg}.`,
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

// Bulletins Library CRUD & Central Storage Sync
app.get('/api/bulletins', (req: Request, res: Response) => {
  const bulletins = getBulletins();
  res.json(
    bulletins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );
});

// Central Export All Bulletins (JSON Backup)
app.get('/api/bulletins/export', (req: Request, res: Response) => {
  const bulletins = getBulletins();
  const station = getStationConfig();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="boletines-rcv-central-backup-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.json({
    version: '1.0',
    stationName: station.stationName,
    exportedAt: new Date().toISOString(),
    storageLocation: 'data/bulletins.json',
    totalBulletins: bulletins.length,
    bulletins,
  });
});

// Central Import & Restore Bulletins
app.post('/api/bulletins/import', (req: Request, res: Response) => {
  try {
    const importData = req.body;
    let itemsToImport: BulletinDraft[] = [];
    if (Array.isArray(importData)) {
      itemsToImport = importData;
    } else if (importData && Array.isArray(importData.bulletins)) {
      itemsToImport = importData.bulletins;
    } else {
      return res.status(400).json({
        error: 'Formato de importación no válido. Debe ser un archivo de respaldo JSON de boletines.',
      });
    }

    const current = getBulletins();
    const map = new Map<string, BulletinDraft>();
    current.forEach((b) => map.set(b.id, b));
    itemsToImport.forEach((b) => {
      if (b && b.id && b.title) {
        map.set(b.id, { ...map.get(b.id), ...b });
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveBulletins(merged);
    console.log(`[Central Storage] Imported ${itemsToImport.length} bulletins. Total: ${merged.length}`);
    return res.json({
      success: true,
      importedCount: itemsToImport.length,
      totalCount: merged.length,
      bulletins: merged,
    });
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: `Error al importar boletines: ${err.message}` });
  }
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

// ==========================================
// SHARED BROWSER SESSION STATE SYNCHRONIZATION
// ==========================================

function getSessionFilePath(sessionId: string): string {
  const safeId = (sessionId || 'default')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase()
    .slice(0, 50);
  return path.join(SESSIONS_DIR, `session-${safeId}.json`);
}

function getSessionData(sessionId: string): {
  sessionId: string;
  bulletins: BulletinDraft[];
  activeDraft: BulletinDraft | null;
  lastUpdated: string;
  stationName: string;
} {
  const filePath = getSessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data && Array.isArray(data.bulletins)) {
        return data;
      }
    } catch (e) {
      console.warn(`Error reading session ${sessionId}:`, e);
    }
  }

  // Initial fallback: start with current central bulletins
  const station = getStationConfig();
  const initial = {
    sessionId,
    bulletins: getBulletins(),
    activeDraft: null,
    lastUpdated: new Date().toISOString(),
    stationName: station.stationName,
  };
  saveSessionData(sessionId, initial);
  return initial;
}

function saveSessionData(sessionId: string, data: any): void {
  const filePath = getSessionFilePath(sessionId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Error saving session ${sessionId}:`, e);
  }
}

// 1. Get Session State
app.get('/api/session/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = getSessionData(sessionId);
  res.json(session);
});

// 2. Synchronize Session State (Bidirectional push/pull from browser)
app.post('/api/session/:sessionId/sync', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { bulletins: incomingBulletins = [], activeDraft = null, mergeStrategy = 'merge' } = req.body;

  const current = getSessionData(sessionId);
  let updatedBulletins: BulletinDraft[] = [];

  if (mergeStrategy === 'replace' && Array.isArray(incomingBulletins) && incomingBulletins.length > 0) {
    updatedBulletins = incomingBulletins;
  } else {
    // Merge by id, giving precedence to incoming items if newer or more detailed
    const map = new Map<string, BulletinDraft>();
    (current.bulletins || []).forEach((b) => map.set(b.id, b));
    (incomingBulletins || []).forEach((b: any) => {
      if (b && b.id) {
        map.set(b.id, { ...map.get(b.id), ...b });
      }
    });
    updatedBulletins = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const updatedSession = {
    sessionId,
    bulletins: updatedBulletins,
    activeDraft: activeDraft !== undefined ? activeDraft : current.activeDraft,
    lastUpdated: new Date().toISOString(),
    stationName: getStationConfig().stationName,
  };

  saveSessionData(sessionId, updatedSession);

  // Also guarantee central bulletins database has all these items
  try {
    const central = getBulletins();
    const centralMap = new Map<string, BulletinDraft>();
    central.forEach((b) => centralMap.set(b.id, b));
    updatedBulletins.forEach((b) => centralMap.set(b.id, { ...centralMap.get(b.id), ...b }));
    saveBulletins(Array.from(centralMap.values()));
  } catch (e) {
    // ignore
  }

  res.json({
    success: true,
    sessionId,
    lastUpdated: updatedSession.lastUpdated,
    totalBulletins: updatedBulletins.length,
    bulletins: updatedBulletins,
    activeDraft: updatedSession.activeDraft,
  });
});

// 3. Export Session History as Downloadable Local JSON
app.get('/api/session/:sessionId/export', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = getSessionData(sessionId);
  const station = getStationConfig();

  const exportPayload = {
    schemaVersion: '2.0',
    exportType: 'rcv_session_bulletins_history',
    sessionId,
    exportedAt: new Date().toISOString(),
    stationName: station.stationName,
    totalBulletins: session.bulletins.length,
    bulletins: session.bulletins,
    activeDraft: session.activeDraft,
    metadata: {
      app: 'Radio Corrientes Viva – Central de Noticias IA',
      timezone: 'America/Argentina/Buenos_Aires',
      format: 'JSON Local Multi-dispositivo',
    },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="historial-boletines-sesion-${sessionId.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.json(exportPayload);
});

// 4. Import Session History from Local JSON
app.post('/api/session/:sessionId/import', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { fileData, mergeStrategy = 'merge' } = req.body;

  if (!fileData) {
    return res.status(400).json({ error: 'No se recibieron datos de archivo para importar.' });
  }

  let itemsToImport: BulletinDraft[] = [];
  let importedDraft: BulletinDraft | null = null;

  if (Array.isArray(fileData)) {
    itemsToImport = fileData;
  } else if (fileData && Array.isArray(fileData.bulletins)) {
    itemsToImport = fileData.bulletins;
    importedDraft = fileData.activeDraft || null;
  } else {
    return res.status(400).json({
      error: 'Estructura de archivo JSON no válida. Debe contener un array de boletines o un objeto de exportación de sesión.',
    });
  }

  const current = getSessionData(sessionId);
  let finalBulletins: BulletinDraft[] = [];

  if (mergeStrategy === 'replace') {
    finalBulletins = itemsToImport;
  } else {
    const map = new Map<string, BulletinDraft>();
    (current.bulletins || []).forEach((b) => map.set(b.id, b));
    itemsToImport.forEach((b) => {
      if (b && b.id && b.title) {
        map.set(b.id, { ...map.get(b.id), ...b });
      }
    });
    finalBulletins = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const updatedSession = {
    sessionId,
    bulletins: finalBulletins,
    activeDraft: importedDraft || current.activeDraft,
    lastUpdated: new Date().toISOString(),
    stationName: getStationConfig().stationName,
  };

  saveSessionData(sessionId, updatedSession);

  // Sync to central storage
  try {
    const central = getBulletins();
    const centralMap = new Map<string, BulletinDraft>();
    central.forEach((b) => centralMap.set(b.id, b));
    finalBulletins.forEach((b) => centralMap.set(b.id, { ...centralMap.get(b.id), ...b }));
    saveBulletins(Array.from(centralMap.values()));
  } catch (e) {
    // non-critical
  }

  res.json({
    success: true,
    sessionId,
    importedCount: itemsToImport.length,
    totalBulletins: finalBulletins.length,
    bulletins: finalBulletins,
    activeDraft: updatedSession.activeDraft,
    lastUpdated: updatedSession.lastUpdated,
  });
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
      server: {
        middlewareMode: true,
        hmr: false,
        host: '0.0.0.0',
        allowedHosts: true,
      },
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
