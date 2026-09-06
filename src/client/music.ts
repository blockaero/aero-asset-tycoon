const TRACK_URL = "/audio/hangar-theme.m4a";
const DEFAULT_VOLUME = 0.42;

let audio: HTMLAudioElement | null = null;
let playing = false;
const listeners = new Set<(on: boolean) => void>();

function emit() {
  for (const listener of listeners) listener(playing);
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(TRACK_URL);
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
      playing = false;
      emit();
    });
  }
  return audio;
}

/** Start the hangar theme. Safe to call from any user gesture; idempotent. */
export function startMusic(): void {
  const element = ensureAudio();
  if (!element.paused) return;
  void element.play().catch(() => {
    // Browser blocked autoplay; the next toggle/gesture will start it.
  });
}

export function toggleMusic(): void {
  const element = ensureAudio();
  if (element.paused) {
    void element.play().catch(() => {});
  } else {
    element.pause();
  }
}

export function subscribeMusic(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  listener(playing);
  return () => {
    listeners.delete(listener);
  };
}

export function musicOn(): boolean {
  return playing;
}
