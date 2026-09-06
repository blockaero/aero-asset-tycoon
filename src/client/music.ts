/**
 * Music library.
 *
 * Track 1 is the recorded hangar theme. Every other track is synthesised in the
 * browser from the same harmonic language — slow warm minor-ninth and sus voicings
 * over a soft air bed — so the library can grow without shipping more audio files.
 *
 * All variants share one chord set and one tempo family, so switching between them
 * feels like a change of shift rather than a change of game.
 */

import type { Season } from "../sim/types.ts";

export type TrackId =
  | "hangar-theme"
  | "dawn-shift"
  | "quarter-close"
  | "night-ops"
  | "teardown-floor"
  | "flight-line";

export type TrackDef = {
  id: TrackId;
  label: string;
  blurb: string;
  kind: "file" | "synth";
  /** Beats per minute. The recorded theme sits at 84; variants orbit it. */
  bpm: number;
  /** Season this track is chosen for when seasonal auto-select is on. */
  season: Season | null;
};

export const TRACKS: TrackDef[] = [
  {
    id: "hangar-theme",
    label: "Hangar Theme",
    blurb: "The recorded main theme. Warm, unhurried, 84 BPM.",
    kind: "file",
    bpm: 84,
    season: null,
  },
  {
    id: "dawn-shift",
    label: "Dawn Shift",
    blurb: "Sparser and higher. First light on the ramp.",
    kind: "synth",
    bpm: 76,
    season: "spring",
  },
  {
    id: "quarter-close",
    label: "Quarter Close",
    blurb: "Percussive and a step faster. Numbers are due.",
    kind: "synth",
    bpm: 96,
    season: "summer",
  },
  {
    id: "night-ops",
    label: "Night Ops",
    blurb: "Low pad at half tempo. The floor is quiet.",
    kind: "synth",
    bpm: 62,
    season: "winter",
  },
  {
    id: "teardown-floor",
    label: "Teardown Floor",
    blurb: "Metallic partials over a wide bed. Something is being taken apart.",
    kind: "synth",
    bpm: 82,
    season: "autumn",
  },
  {
    id: "flight-line",
    label: "Flight Line",
    blurb: "Open fifths and a slow swell. Wide and outdoors.",
    kind: "synth",
    bpm: 88,
    season: null,
  },
];

const DEFAULT_VOLUME = 0.42;
const STORAGE_KEY = "aat.music.track";

/** Semitone offsets from the root for each chord in the shared progression. */
const PROGRESSIONS: Record<TrackId, number[][]> = {
  "hangar-theme": [[0, 3, 7, 14]],
  "dawn-shift": [
    [0, 7, 14, 19],
    [-3, 4, 12, 19],
    [-5, 2, 9, 16],
    [-1, 7, 11, 18],
  ],
  "quarter-close": [
    [0, 3, 7, 10],
    [5, 8, 12, 15],
    [-2, 3, 7, 14],
    [3, 7, 10, 17],
  ],
  "night-ops": [
    [-12, -5, 3, 7],
    [-12, -5, 2, 9],
    [-14, -7, 0, 5],
    [-12, -3, 4, 7],
  ],
  "teardown-floor": [
    [0, 5, 7, 12],
    [-2, 3, 10, 15],
    [-4, 3, 8, 12],
    [0, 7, 12, 19],
  ],
  "flight-line": [
    [0, 7, 12, 19],
    [-5, 2, 7, 14],
    [-3, 4, 9, 16],
    [-7, 0, 7, 12],
  ],
};

/** Root note in Hz. A soft D, low enough to sit under speech. */
const ROOT_HZ = 73.42;

let audio: HTMLAudioElement | null = null;
let context: AudioContext | null = null;
let master: GainNode | null = null;
let synthStop: (() => void) | null = null;
let current: TrackId = readStoredTrack();
let playing = false;
let seasonalAuto = false;

const listeners = new Set<(state: MusicState) => void>();

export type MusicState = {
  on: boolean;
  track: TrackId;
  label: string;
  seasonalAuto: boolean;
};

function state(): MusicState {
  const def = trackDef(current);
  return { on: playing, track: current, label: def.label, seasonalAuto };
}

function emit(): void {
  const snapshot = state();
  for (const listener of listeners) listener(snapshot);
}

export function trackDef(id: TrackId): TrackDef {
  return TRACKS.find((track) => track.id === id) ?? TRACKS[0]!;
}

function readStoredTrack(): TrackId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && TRACKS.some((track) => track.id === stored)) return stored as TrackId;
  } catch {
    // Private mode or blocked storage. Fall through to the default.
  }
  return "hangar-theme";
}

function storeTrack(id: TrackId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Non-fatal; the choice simply will not survive a reload.
  }
}

/* ------------------------------------------------------------------ *
 * Recorded track
 * ------------------------------------------------------------------ */

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(`${import.meta.env.BASE_URL}audio/hangar-theme.m4a`);
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
    audio.preload = "auto";
    audio.dataset.track = "hangar-theme";
    document.body.appendChild(audio);
    audio.addEventListener("playing", () => {
      playing = true;
      emit();
    });
    audio.addEventListener("pause", () => {
      if (current === "hangar-theme") {
        playing = false;
        emit();
      }
    });
  }
  return audio;
}

/* ------------------------------------------------------------------ *
 * Synthesised tracks
 * ------------------------------------------------------------------ */

function ensureContext(): AudioContext | null {
  if (context) return context;
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  return context;
}

/** A tiny deterministic PRNG so a track sounds the same every time it plays. */
function makeRng(seed: number): () => number {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    value >>>= 0;
    return value / 0xffffffff;
  };
}

function hzFor(semitones: number): number {
  return ROOT_HZ * Math.pow(2, semitones / 12);
}

/** One soft pad voice: two detuned oscillators through a slow lowpass. */
function padVoice(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType,
): void {
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(320, start);
  filter.frequency.linearRampToValueAtTime(1400, start + duration * 0.4);
  filter.frequency.linearRampToValueAtTime(500, start + duration);
  filter.Q.value = 0.6;

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + duration * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  for (const detune of [-6, 6]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.1);
  }
  gain.connect(filter);
  filter.connect(destination);
}

/** A short bell partial used sparsely, so the pad has something to breathe against. */
function bellVoice(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  peak: number,
): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.6);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + 2.7);
}

/** The air bed: filtered noise, always present, very quiet. */
function airBed(ctx: AudioContext, destination: AudioNode, level: number): () => void {
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = makeRng(0x5eed);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = rng() * 2 - 1;
    // Brown-ish noise reads as room air rather than hiss.
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 620;
  const gain = ctx.createGain();
  gain.gain.value = level;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start();
  return () => {
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
  };
}

function startSynth(id: TrackId): void {
  const ctx = ensureContext();
  if (!ctx || !master) return;
  void ctx.resume();

  const def = trackDef(id);
  const chords = PROGRESSIONS[id] ?? PROGRESSIONS["flight-line"]!;
  const beat = 60 / def.bpm;
  const barSeconds = beat * 4;

  const space = ctx.createDelay(1.2);
  space.delayTime.value = beat * 1.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const spaceFilter = ctx.createBiquadFilter();
  spaceFilter.type = "lowpass";
  spaceFilter.frequency.value = 1800;
  space.connect(feedback);
  feedback.connect(spaceFilter);
  spaceFilter.connect(space);
  space.connect(master);

  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  bus.connect(space);

  const stopAir = airBed(ctx, master, id === "night-ops" ? 0.05 : 0.03);

  const rng = makeRng(
    id.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7),
  );

  const padType: OscillatorType = id === "teardown-floor" ? "square" : "triangle";
  const octave = id === "night-ops" ? -12 : id === "dawn-shift" ? 12 : 0;
  let bar = 0;
  let nextTime = ctx.currentTime + 0.15;

  const scheduleAhead = () => {
    while (nextTime < ctx.currentTime + 2.5) {
      const chord = chords[bar % chords.length]!;
      for (const [index, semitone] of chord.entries()) {
        padVoice(
          ctx,
          bus,
          hzFor(semitone + octave),
          nextTime,
          barSeconds * 1.05,
          0.055 - index * 0.006,
          padType,
        );
      }
      // Root an octave down, so the chord has a floor.
      padVoice(ctx, bus, hzFor(chord[0]! + octave - 12), nextTime, barSeconds, 0.05, "sine");

      // A sparse bell, more often on the busier tracks.
      const bellChance = id === "quarter-close" ? 0.85 : id === "night-ops" ? 0.2 : 0.45;
      if (rng() < bellChance) {
        const note = chord[1 + Math.floor(rng() * (chord.length - 1))]!;
        bellVoice(ctx, bus, hzFor(note + octave + 24), nextTime + beat * (rng() < 0.5 ? 1 : 2), 0.05);
      }
      if (id === "quarter-close") {
        // A soft pulse on beats two and four rather than a drum.
        for (const offset of [beat, beat * 3]) {
          bellVoice(ctx, bus, hzFor(chord[0]! + octave + 12), nextTime + offset, 0.028);
        }
      }
      nextTime += barSeconds;
      bar += 1;
    }
  };

  scheduleAhead();
  const timer = window.setInterval(scheduleAhead, 700);

  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
  master.gain.linearRampToValueAtTime(DEFAULT_VOLUME, ctx.currentTime + 2.5);

  synthStop = () => {
    window.clearInterval(timer);
    stopAir();
    if (master && context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(master.gain.value, context.currentTime);
      master.gain.linearRampToValueAtTime(0.0001, context.currentTime + 0.6);
    }
    try {
      bus.disconnect();
      space.disconnect();
    } catch {
      // Already torn down.
    }
  };
}

function stopEverything(): void {
  if (audio && !audio.paused) audio.pause();
  if (synthStop) {
    synthStop();
    synthStop = null;
  }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Start the current track. Safe to call from any user gesture; idempotent. */
export function startMusic(): void {
  if (playing) return;
  if (current === "hangar-theme") {
    const element = ensureAudio();
    void element.play().catch(() => {
      // Browser blocked autoplay; the next gesture will start it.
    });
    return;
  }
  startSynth(current);
  playing = true;
  emit();
}

export function stopMusic(): void {
  stopEverything();
  playing = false;
  emit();
}

export function toggleMusic(): void {
  if (playing) stopMusic();
  else startMusic();
}

/** Switch tracks, keeping play state. */
export function selectTrack(id: TrackId): void {
  if (!TRACKS.some((track) => track.id === id)) return;
  const wasPlaying = playing;
  stopEverything();
  playing = false;
  current = id;
  storeTrack(id);
  if (wasPlaying) startMusic();
  else emit();
}

export function currentTrack(): TrackId {
  return current;
}

export function listTracks(): TrackDef[] {
  return TRACKS;
}

/** When on, the season picks the track at each season change. */
export function setSeasonalAuto(on: boolean): void {
  seasonalAuto = on;
  emit();
}

export function applySeason(season: Season): void {
  if (!seasonalAuto) return;
  const match = TRACKS.find((track) => track.season === season);
  if (match && match.id !== current) selectTrack(match.id);
}

export function subscribeMusic(listener: (state: MusicState) => void): () => void {
  listeners.add(listener);
  listener(state());
  return () => {
    listeners.delete(listener);
  };
}

export function musicOn(): boolean {
  return playing;
}
