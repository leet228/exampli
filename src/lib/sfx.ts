// Simple SFX manager: preloads sounds and plays them safely with unlock
type SfxMap = {
  open: HTMLAudioElement;
  correct: HTMLAudioElement;
  wrong: HTMLAudioElement;
  lessonFinished: HTMLAudioElement;
  subsBought: HTMLAudioElement;
  coinsBought: HTMLAudioElement;
};

const create = (src: string) => {
  const a = new Audio(src);
  a.preload = 'auto';
  a.crossOrigin = 'anonymous';
  // Подсказки браузерам/вебвью для "мягкого" поведения на мобильных
  try {
    (a as any).playsInline = true;
    (a as any).webkitPlaysInline = true;
    (a as any).disableRemotePlayback = true;
  } catch {}
  a.volume = 1.0;
  return a;
};

const audios: SfxMap = {
  open: create('/sounds/open_sound.wav'),
  correct: create('/sounds/correct_sound.wav'),
  wrong: create('/sounds/wrong_sound.wav'),
  lessonFinished: create('/sounds/lesson_finished_sound.wav'),
  subsBought: create('/sounds/subs_bought.wav'),
  coinsBought: create('/sounds/coins_bought_sound.wav'),
};

const srcByKey = {
  open: '/sounds/open_sound.wav',
  correct: '/sounds/correct_sound.wav',
  wrong: '/sounds/wrong_sound.wav',
  lessonFinished: '/sounds/lesson_finished_sound.wav',
  subsBought: '/sounds/subs_bought.wav',
  coinsBought: '/sounds/coins_bought_sound.wav',
} satisfies Record<keyof SfxMap, string>;

let unlocked = false;
let openPlayedOnce = false;

// Глобальные флаги управления воспроизведением
let globalMuted = false;
let suppressUntil = 0;

// Мобильная политика: пробуем МИКШИРОВАТЬ поверх внешней музыки.
// Т.е. SFX на мобилках разрешены (вместе с музыкой), а не блокируются.
const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
const isIOS = /iPad|iPhone|iPod/i.test(ua) || (!!(navigator as any)?.platform && (navigator as any).platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isMobile = isIOS || isAndroid;
let respectBackgroundAudioMobile = false;

// WebAudio для попытки "мягкого" микширования с внешним аудио
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const buffers: Partial<Record<keyof SfxMap, AudioBuffer>> = {};
const loading: Partial<Record<keyof SfxMap, Promise<void>>> = {};
let preferWebAudio = true;

function ensureCtx() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx({ latencyHint: 'interactive' });
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(audioCtx.destination);
  } catch {
    audioCtx = null;
    masterGain = null;
  }
  return audioCtx;
}

async function loadBuffer(key: keyof SfxMap) {
  if (buffers[key]) return;
  if (loading[key]) return loading[key];
  const job = (async () => {
    try {
      const ctx = ensureCtx();
      if (!ctx) return;
      const url = srcByKey[key];
      const res = await fetch(url, { cache: 'force-cache' });
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr.slice(0));
      buffers[key] = buf;
    } catch {
      // keep silent; fallback останется на HTMLAudio
    } finally {
      delete loading[key];
    }
  })();
  loading[key] = job;
  return job;
}

function tryPlayKey(key: keyof SfxMap) {
  try {
    // Глобальное отключение/подавление звуков
    if (globalMuted) return;
    if (Date.now() < suppressUntil) return;

    // Если возможно — пробуем WebAudio (часто на Android микшируется вместе с внешним аудио)
    if (preferWebAudio && ensureCtx() && audioCtx && masterGain) {
      // На iOS AudioContext может быть в suspended до первого жеста
      try { void audioCtx.resume?.(); } catch {}
      if (!buffers[key]) {
        // лениво грузим и после загрузки проигрываем
        void loadBuffer(key).then(() => {
          if (!buffers[key] || !audioCtx || !masterGain) return;
          try {
            const src = audioCtx.createBufferSource();
            src.buffer = buffers[key]!;
            src.connect(masterGain);
            src.start(0);
          } catch {}
        });
        return;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buffers[key]!;
      src.connect(masterGain);
      src.start(0);
      return;
    }

    // Fallback: HTMLAudioElement
    const a = audios[key];
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof (p as any).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {}
}

export const sfx = {
  unlock() {
    if (unlocked) return;
    unlocked = true;
    // Вместо "прайминга" HTMLAudio, грузим и декодируем буферы под жестом пользователя.
    // Это снижает шанс на захват аудиофокуса и чаще дружит с внешней музыкой.
    try { ensureCtx(); } catch {}
    (Object.keys(srcByKey) as Array<keyof SfxMap>).forEach((k) => { void loadBuffer(k); });
  },
  playOpen() {
    if (openPlayedOnce) return;
    openPlayedOnce = true;
    tryPlayKey('open');
  },
  playCorrect() { tryPlayKey('correct'); },
  playWrong() { tryPlayKey('wrong'); },
  playLessonFinished() { tryPlayKey('lessonFinished'); },
  playSubsBought() { tryPlayKey('subsBought'); },
  playCoinsBought() { tryPlayKey('coinsBought'); },

  // Управление политикой воспроизведения
  setGlobalMuted(muted: boolean) {
    globalMuted = !!muted;
  },
  suppressFor(ms: number) {
    suppressUntil = Math.max(suppressUntil, Date.now() + Math.max(0, ms || 0));
  },
  setRespectBackgroundAudioMobile(enable: boolean) {
    respectBackgroundAudioMobile = !!enable;
  },
  setPreferWebAudio(enable: boolean) {
    preferWebAudio = !!enable;
  },
  getState() {
    return {
      unlocked,
      globalMuted,
      suppressMsLeft: Math.max(0, suppressUntil - Date.now()),
      isMobile,
      respectBackgroundAudioMobile,
      preferWebAudio,
    };
  },
};


