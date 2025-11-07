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

let unlocked = false;
let openPlayedOnce = false;

function tryPlay(a: HTMLAudioElement) {
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof (p as any).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {}
}

export const sfx = {
  unlock() {
    if (unlocked) return;
    unlocked = true;
    // On first user gesture, quickly prime all sounds (muted)
    Object.values(audios).forEach((a) => {
      try {
        a.muted = true;
        const p = a.play();
        if (p && typeof (p as any).then === 'function') {
          (p as Promise<void>)
            .then(() => {
              try { a.pause(); a.currentTime = 0; a.muted = false; } catch {}
            })
            .catch(() => {
              try { a.pause(); a.currentTime = 0; a.muted = false; } catch {}
            });
        } else {
          try { a.pause(); a.currentTime = 0; a.muted = false; } catch {}
        }
      } catch {}
    });
  },
  playOpen() {
    if (openPlayedOnce) return;
    openPlayedOnce = true;
    tryPlay(audios.open);
  },
  playCorrect() { tryPlay(audios.correct); },
  playWrong() { tryPlay(audios.wrong); },
  playLessonFinished() { tryPlay(audios.lessonFinished); },
  playSubsBought() { tryPlay(audios.subsBought); },
  playCoinsBought() { tryPlay(audios.coinsBought); },
};


