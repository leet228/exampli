import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { hapticSlideReveal, hapticTiny } from '../lib/haptics';
import { supabase } from '../lib/supabase';

type Props = { open: boolean; onDone: () => void };

export default function Onboarding({ open, onDone }: Props) {
  const [step, setStep] = useState(0);
  const canGoNext = true;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const next = useCallback(() => {
    hapticSlideReveal();
    setStep((s) => Math.min(2, s + 1));
  }, []);

  const sharePhone = useCallback(async () => {
    try {
      const tg = (window as any)?.Telegram?.WebApp;
      // Try WebApp API (Telegram may show native phone share sheet)
      const resp = await tg?.requestPhoneNumber?.();
      const phone: string | undefined = resp?.phone_number || resp?.phoneNumber || resp;

      if (phone) {
        const tgId: number | undefined = tg?.initDataUnsafe?.user?.id;
        if (tgId) {
          await supabase.from('users').update({ phone_number: String(phone) }).eq('tg_id', String(tgId));
        }
      }
    } catch {}
    next();
  }, [next]);

  const finish = useCallback(() => {
    try { localStorage.setItem('exampli:onboardDone', '1'); } catch {}
    hapticTiny();
    onDone();
  }, [onDone]);

  const content = useMemo(() => {
    if (step === 0) return (
      <div className="flex flex-col items-center text-center gap-5">
        <img src="/kursik.svg" alt="Onboarding" className="w-56 h-56 object-contain" />
        <div className="space-y-2 px-5">
          <div className="text-2xl font-bold text-white">Добро пожаловать в КУРСИК</div>
          <div className="text-[color:var(--muted)]">
            Прокачивайся каждый день. Мы собрали курсы ОГЭ и ЕГЭ в одном месте.
          </div>
        </div>
        <button
          type="button"
          className="btn w-full max-w-xs"
          onClick={next}
        >
          Поехали
        </button>
      </div>
    );

    if (step === 1) return (
      <div className="flex flex-col items-center text-center gap-5">
        <img src="/kursik.svg" alt="Share Phone" className="w-56 h-56 object-contain" />
        <div className="space-y-2 px-5">
          <div className="text-2xl font-bold text-white">Поделитесь номером</div>
          <div className="text-[color:var(--muted)]">
            Это поможет нам связаться по важным обновлениям и восстановить доступ.
          </div>
        </div>
        <button
          type="button"
          className="btn w-full max-w-xs"
          onClick={sharePhone}
        >
          Поделиться
        </button>
      </div>
    );

    return (
      <div className="flex flex-col items-center text-center gap-5">
        <img src="/kursik.svg" alt="Thanks" className="w-56 h-56 object-contain" />
        <div className="space-y-2 px-5">
          <div className="text-2xl font-bold text-white">Спасибо!</div>
          <div className="text-[color:var(--muted)]">
            Готовы приступить к обучению? Выберите свой первый курс.
          </div>
        </div>
        <button
          type="button"
          className="btn w-full max-w-xs"
          onClick={finish}
        >
          Продолжить
        </button>
      </div>
    );
  }, [step, next, sharePhone, finish]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-[color:var(--bg)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="w-full max-w-xl px-5">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6">
              <motion.div
                key={step}
                initial={{ x: 60, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -60, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              >
                {content}
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


