import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { hapticSlideReveal, hapticTiny, hapticSelect } from '../lib/haptics';
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

  // Состояние для шага телефона
  const [prefix, setPrefix] = useState<string>('+7');
  const [digits, setDigits] = useState<string>('');
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const prefixOptions = useMemo(() => ['+7', '+375', '+380', '+374', '+1'], []);
  const prefixMax: Record<string, number> = useMemo(() => ({ '+7': 10, '+375': 9, '+380': 9, '+374': 8, '+1': 10 }), []);

  const onDigitsChange = useCallback((raw: string) => {
    const only = (raw || '').replace(/\D+/g, '');
    const lim = prefixMax[prefix] || 12;
    setDigits(only.slice(0, lim));
  }, [prefix, prefixMax]);

  const canSubmitPhone = (prefixMax[prefix] || 12) === digits.length;

  const submitPhoneManually = useCallback(async () => {
    try {
      const tg = (window as any)?.Telegram?.WebApp;
      const full = `${prefix}${digits}`;
      const tgId: number | undefined = tg?.initDataUnsafe?.user?.id;
      if (tgId) {
        await supabase.from('users').update({ phone_number: full }).eq('tg_id', String(tgId));
      }
    } catch {}
    next();
  }, [digits, next, prefix]);

  const firstStep = (
    <div className="flex flex-col items-center text-center gap-6 w-full min-h-[60vh] justify-center">
      <img src="/stickers/onBoarding.svg" alt="Onboarding" className="w-64 h-64 object-contain" />
      <div className="space-y-3 px-6 w-full max-w-md">
        <div className="text-3xl font-bold text-white leading-tight">Добро пожаловать в КУРСИК</div>
        <div className="text-[color:var(--muted)] text-base">
          Прокачивайся каждый день. ОГЭ и ЕГЭ — в одном месте, в удобном формате.
        </div>
      </div>
      <div className="w-full px-6 max-w-md">
        <button
          type="button"
          className="btn w-full"
          onClick={next}
        >
          Поехали
        </button>
      </div>
    </div>
  );

  const phoneStep = (
    <div className="flex flex-col items-center text-center gap-6 w-full min-h-[60vh] justify-center">
      <div className="space-y-3 px-6 w-full max-w-md">
        <div className="text-3xl font-bold text-white leading-tight">Поделитесь номером</div>
        <div className="text-[color:var(--muted)] text-base">
          Это поможет нам связаться по важным обновлениям и восстановить доступ.
        </div>
      </div>

      <div className="w-full px-6 max-w-md">
        <div className="flex items-stretch gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => { hapticSelect(); setShowPicker((v) => !v); }}
              className="h-14 px-4 rounded-2xl border border-white/10 bg-white/5 font-semibold"
            >
              {prefix}
            </button>
            {showPicker && (
              <div className="absolute z-10 mt-2 min-w-[120px] rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                {prefixOptions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { hapticSelect(); setPrefix(p); setShowPicker(false); setDigits(''); }}
                    className={`block w-full text-left px-4 py-3 hover:bg-white/10 ${p===prefix ? 'text-white' : 'text-[color:var(--muted)]'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="tel"
            className="h-14 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-left font-semibold tracking-wider placeholder:text-[color:var(--muted)]"
            placeholder={prefix === '+7' ? '(___) ___-__-__' : 'Введите номер'}
            value={digits}
            onChange={(e) => onDigitsChange(e.currentTarget.value)}
            maxLength={prefixMax[prefix] || 12}
          />
        </div>
        <div className="mt-2 text-xs text-[color:var(--muted)] text-left">
          Вводите номер без начального знака «+». Префикс выбирается слева.
        </div>
      </div>

      <div className="w-full px-6 max-w-md">
        <button
          type="button"
          disabled={!canSubmitPhone}
          className={`w-full rounded-2xl py-4 font-semibold transition ${canSubmitPhone ? 'btn' : 'bg-[#37464f] text-white/60 cursor-not-allowed'}`}
          onClick={submitPhoneManually}
        >
          Дальше
        </button>
      </div>
    </div>
  );

  const thanksStep = (
    <div className="flex flex-col items-center text-center gap-6 w-full min-h-[60vh] justify-center">
      <img src="/stickers/onBoarding.svg" alt="Thanks" className="w-64 h-64 object-contain" />
      <div className="space-y-3 px-6 w-full max-w-md">
        <div className="text-3xl font-bold text-white leading-tight">Спасибо!</div>
        <div className="text-[color:var(--muted)] text-base">
          Готовы приступить к обучению? Выберите свой первый курс.
        </div>
      </div>
      <div className="w-full px-6 max-w-md">
        <button
          type="button"
          className="btn w-full"
          onClick={finish}
        >
          Продолжить
        </button>
      </div>
    </div>
  );

  const content = step === 0 ? firstStep : step === 1 ? phoneStep : thanksStep;

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[65] bg-[color:var(--bg)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <motion.div
              key={step}
              className="w-full h-full max-w-xl mx-auto flex items-center justify-center px-5"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            >
              {content}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


