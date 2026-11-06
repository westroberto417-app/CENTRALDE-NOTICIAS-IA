import { useState, useRef, useEffect, useCallback } from 'react';
import { MusicCurtain } from '../types';

export const PRESET_CURTAINS: MusicCurtain[] = [
  {
    id: 'curtain-rcv-institucional',
    name: 'Cortina RCV Institucional (Taragüí Informativo)',
    description: 'Sintetizador melódico moderno, ritmo informativo sobrio y colchón armónico cálido.',
    type: 'synth',
    defaultVolume: 0.45,
    duckingVolume: 0.14,
    genre: 'Institucional Radial',
  },
  {
    id: 'curtain-rcv-panorama',
    name: 'Cortina Panorama Central (Mediodía y Tarde)',
    description: 'Armonía orquestal con pulso dinámico y campanas de transición periodística.',
    type: 'synth',
    defaultVolume: 0.50,
    duckingVolume: 0.15,
    genre: 'Panorama Informativo',
  },
  {
    id: 'curtain-rcv-urgente',
    name: 'Cortina Alerta / Último Momento',
    description: 'Tensión periodística controlada, latido percusivo y aviso de noticia urgente.',
    type: 'synth',
    defaultVolume: 0.52,
    duckingVolume: 0.16,
    genre: 'Breaking News',
  },
  {
    id: 'curtain-rcv-litoral',
    name: 'Cortina Acústica Litoral (Río y Tradición)',
    description: 'Acordes suaves inspirados en la calma del Litoral, ideales para noticias de sociedad y cultura.',
    type: 'synth',
    defaultVolume: 0.42,
    duckingVolume: 0.12,
    genre: 'Litoral Suave',
  },
];

interface UseAudioDuckingPlayerOptions {
  voiceAudioUrl?: string | null;
  selectedCurtainId?: string;
  customCurtainUrl?: string | null;
  baseVolume?: number; // e.g. 0.45
  duckingVolume?: number; // e.g. 0.14
  duckingEnabled?: boolean;
}

export function useAudioDuckingPlayer(options: UseAudioDuckingPlayerOptions = {}) {
  const {
    voiceAudioUrl,
    selectedCurtainId = 'curtain-rcv-institucional',
    customCurtainUrl,
    baseVolume = 0.45,
    duckingVolume = 0.14,
    duckingEnabled = true,
  } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isDucking, setIsDucking] = useState(false);
  const [previewingCurtainId, setPreviewingCurtainId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Web Audio Context & Nodes refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const curtainAudioRef = useRef<HTMLAudioElement | null>(null);
  const curtainGainNodeRef = useRef<GainNode | null>(null);
  const synthIntervalRef = useRef<number | null>(null);
  const synthNodesRef = useRef<{ stop: () => void } | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  // Initialize or get AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Built-in Pure Web Audio Ambient Radio Curtain Synthesizer
  // Produces distinctly different broadcast textures for each preset
  const startSynthCurtain = useCallback(
    (ctx: AudioContext, gainNode: GainNode, curtainStyle: string) => {
      let chords: number[][];
      let tickerFreq = 880;
      let tickerSpeed = 8;
      let bassFreq = 73.42;

      switch (curtainStyle) {
        case 'curtain-rcv-urgente':
          chords = [
            [146.83, 220.0, 261.63], // Dm
            [130.81, 196.0, 246.94], // C
            [116.54, 174.61, 233.08],// Bb
            [110.0, 164.81, 220.0],  // A
          ];
          tickerFreq = 960;
          tickerSpeed = 12;
          bassFreq = 65.41;
          break;
        case 'curtain-rcv-panorama':
          chords = [
            [130.81, 196.0, 261.63], // C
            [196.0, 246.94, 293.66], // G
            [110.0, 164.81, 220.0],  // Am
            [174.61, 220.0, 261.63], // F
          ];
          tickerFreq = 1046.5;
          tickerSpeed = 6;
          bassFreq = 82.41;
          break;
        case 'curtain-rcv-litoral':
          chords = [
            [110.0, 164.81, 220.0],  // Am
            [146.83, 220.0, 261.63], // Dm
            [196.0, 246.94, 293.66], // G
            [130.81, 196.0, 261.63], // C
          ];
          tickerFreq = 784;
          tickerSpeed = 4;
          bassFreq = 55.0;
          break;
        case 'curtain-rcv-institucional':
        default:
          chords = [
            [146.83, 220.0, 293.66], // Dm
            [174.61, 220.0, 349.23], // F
            [196.0, 246.94, 293.66], // G
            [110.0, 164.81, 220.0],  // Am
          ];
          tickerFreq = 880;
          tickerSpeed = 8;
          bassFreq = 73.42;
          break;
      }

      let chordIdx = 0;
      const activeOscillators: OscillatorNode[] = [];

      const playChord = () => {
        if (ctx.state === 'closed') return;
        const now = ctx.currentTime;
        const chord = chords[chordIdx % chords.length];
        chordIdx++;

        // Chords with rich harmonic texture
        chord.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const noteGain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800 + i * 200, now);

          osc.type = i === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, now);

          noteGain.gain.setValueAtTime(0, now);
          noteGain.gain.linearRampToValueAtTime(0.12 / (i + 1), now + 0.3);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

          osc.connect(filter);
          filter.connect(noteGain);
          noteGain.connect(gainNode);

          osc.start(now);
          osc.stop(now + 3.5);
          activeOscillators.push(osc);
        });

        // Warm subtle sub-bass note (non-distorting smooth broadcast foundation)
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(bassFreq, now);
        kickGain.gain.setValueAtTime(0, now);
        kickGain.gain.linearRampToValueAtTime(0.08, now + 0.1);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        kickOsc.connect(kickGain);
        kickGain.connect(gainNode);
        kickOsc.start(now);
        kickOsc.stop(now + 2.0);
        activeOscillators.push(kickOsc);
      };

      playChord();
      const intervalId = window.setInterval(playChord, 3000);
      synthIntervalRef.current = intervalId;

      return {
        stop: () => {
          if (synthIntervalRef.current) {
            clearInterval(synthIntervalRef.current);
            synthIntervalRef.current = null;
          }
          activeOscillators.forEach((osc) => {
            try {
              osc.stop();
            } catch {}
          });
        },
      };
    },
    []
  );

  // Apply Ducking Automation to GainNode or Audio element
  const applyDucking = useCallback(
    (duck: boolean) => {
      const node = curtainGainNodeRef.current;
      const ctx = audioCtxRef.current;
      const target = duck && duckingEnabled ? duckingVolume : baseVolume;

      if (node && ctx && ctx.state !== 'closed') {
        const now = ctx.currentTime;
        node.gain.cancelScheduledValues(now);
        node.gain.setTargetAtTime(target, now, 0.25);
      }

      if (curtainAudioRef.current) {
        curtainAudioRef.current.volume = target;
      }

      setIsDucking(duck);
    },
    [baseVolume, duckingVolume, duckingEnabled]
  );

  // Stop All Audio Playback
  const stop = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current.currentTime = 0;
    }
    if (curtainAudioRef.current) {
      curtainAudioRef.current.pause();
      curtainAudioRef.current.currentTime = 0;
      curtainAudioRef.current = null;
    }
    if (synthNodesRef.current) {
      synthNodesRef.current.stop();
      synthNodesRef.current = null;
    }
    applyDucking(false);
    setIsPlaying(false);
    setPreviewingCurtainId(null);
    setCurrentTime(0);
  }, [applyDucking]);

  // Preview an individual preset curtain directly (e.g. 5 seconds)
  const previewPreset = useCallback(
    (curtainId: string, durationSec = 5) => {
      stop();
      const ctx = getAudioContext();

      if (!curtainGainNodeRef.current) {
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(baseVolume, ctx.currentTime);
        gainNode.connect(ctx.destination);
        curtainGainNodeRef.current = gainNode;
      } else {
        curtainGainNodeRef.current.gain.setValueAtTime(baseVolume, ctx.currentTime);
      }

      synthNodesRef.current = startSynthCurtain(
        ctx,
        curtainGainNodeRef.current,
        curtainId
      );

      setPreviewingCurtainId(curtainId);
      setIsPlaying(true);

      previewTimerRef.current = window.setTimeout(() => {
        stop();
      }, durationSec * 1000);
    },
    [baseVolume, getAudioContext, startSynthCurtain, stop]
  );

  // Preview custom uploaded audio directly
  const previewCustom = useCallback(
    (url?: string) => {
      const targetUrl = url || customCurtainUrl;
      if (!targetUrl) return;
      stop();

      const el = new Audio(targetUrl);
      el.volume = baseVolume;
      curtainAudioRef.current = el;
      el.play().catch((err) => console.log('Custom audio preview error:', err));

      setPreviewingCurtainId('custom-uploaded');
      setIsPlaying(true);

      previewTimerRef.current = window.setTimeout(() => {
        stop();
      }, 7000);
    },
    [customCurtainUrl, baseVolume, stop]
  );

  // Test Ducking (Full 8s simulation with ducking transition)
  const testDucking = useCallback(async () => {
    stop();
    const ctx = getAudioContext();

    if (!curtainGainNodeRef.current) {
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(baseVolume, ctx.currentTime);
      gainNode.connect(ctx.destination);
      curtainGainNodeRef.current = gainNode;
    } else {
      curtainGainNodeRef.current.gain.setValueAtTime(baseVolume, ctx.currentTime);
    }

    if (customCurtainUrl) {
      // Play user custom audio
      const el = new Audio(customCurtainUrl);
      el.loop = true;
      el.volume = baseVolume;
      curtainAudioRef.current = el;
      el.play().catch((err) => console.log('Custom ducking test play error:', err));
    } else {
      // Play selected synth preset
      synthNodesRef.current = startSynthCurtain(
        ctx,
        curtainGainNodeRef.current,
        selectedCurtainId
      );
    }

    setIsPlaying(true);
    applyDucking(false); // 0.0s - 1.5s: Intro at full volume

    // 1.5s: Locutor begins speaking -> Duck down!
    const t1 = window.setTimeout(() => {
      applyDucking(true);
    }, 1500);

    // 5.5s: Locutor finishes speaking -> Swell back up!
    const t2 = window.setTimeout(() => {
      applyDucking(false);
    }, 5500);

    // 8.0s: Outro concludes
    const t3 = window.setTimeout(() => {
      stop();
    }, 8000);

    previewTimerRef.current = t3;
  }, [
    baseVolume,
    customCurtainUrl,
    selectedCurtainId,
    getAudioContext,
    startSynthCurtain,
    applyDucking,
    stop,
  ]);

  // Play Background Music Bed at ducking volume (for speech preview or live reading)
  const play = useCallback(() => {
    stop();
    const ctx = getAudioContext();

    if (!curtainGainNodeRef.current) {
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(duckingVolume, ctx.currentTime);
      gainNode.connect(ctx.destination);
      curtainGainNodeRef.current = gainNode;
    } else {
      curtainGainNodeRef.current.gain.setValueAtTime(duckingVolume, ctx.currentTime);
    }

    if (customCurtainUrl) {
      const el = new Audio(customCurtainUrl);
      el.loop = true;
      el.volume = duckingVolume;
      curtainAudioRef.current = el;
      el.play().catch((err) => console.log('Curtain audio play error:', err));
    } else {
      synthNodesRef.current = startSynthCurtain(
        ctx,
        curtainGainNodeRef.current,
        selectedCurtainId
      );
    }

    setIsPlaying(true);
    setIsDucking(true);
  }, [duckingVolume, customCurtainUrl, selectedCurtainId, getAudioContext, startSynthCurtain, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (synthNodesRef.current) synthNodesRef.current.stop();
      if (voiceAudioRef.current) voiceAudioRef.current.pause();
      if (curtainAudioRef.current) curtainAudioRef.current.pause();
    };
  }, []);

  return {
    isPlaying,
    isDucking,
    previewingCurtainId,
    currentTime,
    duration,
    play,
    pause: stop,
    stop,
    previewPreset,
    previewCustom,
    testDucking,
    applyDucking,
  };
};
