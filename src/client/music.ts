interface Track {
  id: string;
  url: string;
}

const TRACKS: Track[] = [
  { id: "hangar-solarpunk", url: `${import.meta.env.BASE_URL}audio/hangar-theme.m4a` },
  { id: "hangar-neoclassical", url: `${import.meta.env.BASE_URL}audio/hangar-s2-neoclassical.m4a` },
];
const DEFAULT_VOLUME = 0.42;

let audio: HTMLAudioElement | null = null;
let playing = false;
let queue: number[] = [];
let queuePos = 0;
const listeners = new Set<(on: boolean) => void>();

function emit() {
  for (const listener of listeners) listener(playing);
}

function shuffled(): number[] {
  const order = TRACKS.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function loadCurrent(element: HTMLAudioElement): void {
  const track = TRACKS[queue[queuePos]];
  element.src = track.url;
  element.dataset.track = track.id;
}

function advance(element: HTMLAudioElement): void {
  queuePos += 1;
  if (queuePos >= queue.length) {
    const last = queue[queue.length - 1];
    queue = shuffled();
    if (TRACKS.length > 1 && queue[0] === last) {
      [queue[0], queue[1]] = [queue[1], queue[0]];
    }
    queuePos = 0;
  }
  loadCurrent(element);
  void element.play().catch(() => {});
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    queue = shuffled();
    queuePos = 0;
    audio = new Audio();
    audio.loop = false;
    audio.volume = DEFAULT_VOLUME;
    audio.preload = "auto";
    loadCurrent(audio);
    document.body.appendChild(audio);
    audio.addEventListener("playing", () => {
      playing = true;
      emit();
    });
    audio.addEventListener("pause", () => {
      playing = false;
      emit();
    });
    audio.addEventListener("ended", () => {
      if (audio) advance(audio);
    });
  }
  return audio;
}

/** Start the soundtrack shuffle. Safe to call from any user gesture; idempotent. */
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
