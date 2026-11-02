/**
 * Audio synthesis, radio bumper sound bed generation, and file conversion utilities
 */

// Generate a professional radio news intro / bumper sound bed using Web Audio API
export async function createRadioSoundBed(durationSeconds = 6): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate,
  });
  const numChannels = 2;
  const numFrames = sampleRate * durationSeconds;
  const buffer = audioCtx.createBuffer(numChannels, numFrames, sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Synthesize an upbeat radio news signature chord progression + rhythmic pulses
  // Frequencies for a classic broadcast jingle in D minor / F major:
  const notes = [
    { freq: 293.66, start: 0.0, dur: 0.8 }, // D4
    { freq: 349.23, start: 0.4, dur: 0.8 }, // F4
    { freq: 440.00, start: 0.8, dur: 0.8 }, // A4
    { freq: 587.33, start: 1.2, dur: 1.8 }, // D5 (signature broadcast chime)
    { freq: 523.25, start: 1.6, dur: 1.4 }, // C5
    { freq: 659.25, start: 2.0, dur: 2.2 }, // E5
    { freq: 440.00, start: 2.8, dur: 2.5 }, // A4
  ];

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Rhythmic teletype/pulse beep (classic radio ticker effect)
    if (t < 3.5) {
      const pulse = Math.sin(2 * Math.PI * 880 * t) * (Math.sin(2 * Math.PI * 8 * t) > 0.3 ? 0.08 : 0);
      sample += pulse;
    }

    // Melodic notes
    for (const note of notes) {
      if (t >= note.start && t < note.start + note.dur) {
        const noteT = t - note.start;
        // Synth bell envelope (fast attack, exponential decay)
        const envelope = Math.exp(-3.5 * (noteT / note.dur));
        // Fundamental + harmonics for rich broadcast brass/synth tone
        const tone =
          Math.sin(2 * Math.PI * note.freq * noteT) * 0.25 +
          Math.sin(2 * Math.PI * note.freq * 2 * noteT) * 0.12 +
          Math.sin(2 * Math.PI * note.freq * 3 * noteT) * 0.05;
        sample += tone * envelope;
      }
    }

    // Subtle bass sweep
    if (t < 4.0) {
      const bassEnv = Math.max(0, 1 - t / 4.0);
      sample += Math.sin(2 * Math.PI * 73.42 * t) * 0.15 * bassEnv;
    }

    // Gentle fade out at the end
    const masterFade = t > durationSeconds - 0.5 ? Math.max(0, (durationSeconds - t) / 0.5) : 1;
    const finalSample = Math.max(-0.95, Math.min(0.95, sample * masterFade * 0.7));

    left[i] = finalSample;
    right[i] = finalSample * 0.98;
  }

  return buffer;
}

// Convert AudioBuffer to WAV Blob
export function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels: Float32Array[] = [];
  let sampleRate = audioBuffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  // fmt sub-chunk
  setUint32(0x20746d66); // "fmt "
  setUint32(16); // subchunk1size (16 for PCM)
  setUint16(1); // audio format (1 is PCM)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample

  // data sub-chunk
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  // Write channel data interleaved
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out], { type: 'audio/wav' });
}

// Mix two AudioBuffers (e.g. voice speech + background cortina musical with ducking)
export async function mixVoiceAndBumper(
  voiceBuffer: AudioBuffer,
  bumperBuffer: AudioBuffer,
  bumperVolume = 0.25
): Promise<AudioBuffer> {
  const sampleRate = voiceBuffer.sampleRate;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate,
  });

  // Intro bumper plays for 1.8 seconds before voice starts, and fades down as voice begins
  const bumperLeadTime = 1.2;
  const totalDuration = voiceBuffer.duration + bumperLeadTime + 1.0;
  const totalFrames = Math.ceil(totalDuration * sampleRate);

  const outputBuffer = audioCtx.createBuffer(2, totalFrames, sampleRate);
  const outL = outputBuffer.getChannelData(0);
  const outR = outputBuffer.getChannelData(1);

  const voiceL = voiceBuffer.getChannelData(0);
  const voiceR = voiceBuffer.numberOfChannels > 1 ? voiceBuffer.getChannelData(1) : voiceL;

  const bumpL = bumperBuffer.getChannelData(0);
  const bumpR = bumperBuffer.numberOfChannels > 1 ? bumperBuffer.getChannelData(1) : bumpL;

  const leadFrames = Math.floor(bumperLeadTime * sampleRate);

  for (let i = 0; i < totalFrames; i++) {
    const t = i / sampleRate;

    // Bumper contribution
    let bumpSampleL = 0;
    let bumpSampleR = 0;
    if (i < bumperBuffer.length) {
      // Duck bumper volume when voice starts speaking
      let currentBumperVol = bumperVolume;
      if (t >= bumperLeadTime) {
        currentBumperVol = bumperVolume * 0.35; // duck down under voice
      }
      bumpSampleL = bumpL[i] * currentBumperVol;
      bumpSampleR = bumpR[i] * currentBumperVol;
    }

    // Voice contribution
    let voiceSampleL = 0;
    let voiceSampleR = 0;
    if (i >= leadFrames) {
      const voiceIndex = i - leadFrames;
      if (voiceIndex < voiceBuffer.length) {
        voiceSampleL = voiceL[voiceIndex];
        voiceSampleR = voiceR[voiceIndex];
      }
    }

    outL[i] = Math.max(-1, Math.min(1, bumpSampleL + voiceSampleL));
    outR[i] = Math.max(-1, Math.min(1, bumpSampleR + voiceSampleR));
  }

  return outputBuffer;
}

// Web Speech API fallback player with voice selection
export function speakWithWebSpeech(
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    voiceName?: string;
    onEnd?: () => void;
  } = {}
): SpeechSynthesisUtterance | null {
  if (!('speechSynthesis' in window)) return null;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate || 1.0;
  utterance.pitch = options.pitch || 1.0;
  utterance.lang = 'es-AR';

  const voices = window.speechSynthesis.getVoices();
  // Find Spanish voice, prefer Argentine or Latin American
  const esVoice =
    voices.find((v) => v.lang === 'es-AR') ||
    voices.find((v) => v.lang.startsWith('es-') && (v.name.includes('Natural') || v.name.includes('Google'))) ||
    voices.find((v) => v.lang.startsWith('es'));

  if (esVoice) {
    utterance.voice = esVoice;
  }

  if (options.onEnd) {
    utterance.onend = options.onEnd;
  }

  window.speechSynthesis.speak(utterance);
  return utterance;
}

// Download a blob or url as a file
export function triggerDownload(urlOrBlob: string | Blob, filename: string) {
  const link = document.createElement('a');
  if (typeof urlOrBlob === 'string') {
    link.href = urlOrBlob;
  } else {
    link.href = URL.createObjectURL(urlOrBlob);
  }
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
