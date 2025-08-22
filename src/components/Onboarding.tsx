import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const prefixOptions = useMemo(() => [
    { code: '+7',   flag: '🇷🇺', max: 10, fmt: 'ru10' },
    { code: '+375', flag: '🇧🇾', max:  9, fmt: 'nine' },
    { code: '+380', flag: '🇺🇦', max:  9, fmt: 'nine' },
    { code: '+374', flag: '🇦🇲', max:  8, fmt: 'eight' },
    { code: '+1',   flag: '🇺🇸', max: 10, fmt: 'us10' },
    { code: '+44',  flag: '🇬🇧', max: 10, fmt: 'us10' },
    { code: '+49',  flag: '🇩🇪', max: 10, fmt: 'us10' },
    { code: '+48',  flag: '🇵🇱', max:  9, fmt: 'nine' },
    { code: '+90',  flag: '🇹🇷', max: 10, fmt: 'us10' },
    { code: '+81',  flag: '🇯🇵', max: 10, fmt: 'us10' },
  ], []);
  const prefixMax: Record<string, number> = useMemo(() => Object.fromEntries(prefixOptions.map(p => [p.code, p.max])), [prefixOptions]);

  useEffect(() => {
    if (!showPicker) return;
    const onDocClick = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!pickerRef.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showPicker]);

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

  const formatDigits = useCallback((pfx: string, ds: string): string => {
    const n = ds;
    const len = n.length;
    // choose pattern
    let groups: number[] = [];
    if (pfx === '+7') groups = [3, 3, 2, 2];
    else if (pfx === '+1' || pfx === '+44' || pfx === '+49' || pfx === '+90' || pfx === '+81') groups = [3, 3, 4];
    else if (pfx === '+375' || pfx === '+380' || pfx === '+48') groups = [2, 3, 2, 2];
    else if (pfx === '+374') groups = [2, 3, 3];
    else groups = [3, 3, 2, 2];

    let i = 0;
    let out = '';
    // first group in parentheses
    const g0 = groups[0] || 0;
    const part0 = n.slice(i, i + g0);
    if (part0) {
      out += '(' + part0;
      if (part0.length === g0) out += ') ';
    }
    i += part0.length;

    for (let gi = 1; gi < groups.length && i < len; gi++) {
      const sz = groups[gi];
      const take = n.slice(i, i + sz);
      if (!take) break;
      if (gi > 1) out += '-';
      else if (part0.length < g0) out += '';
      else out += (gi === 1 ? '' : '-');
      out += (gi === 1 && part0.length < g0 ? take : take);
      i += take.length;
    }

    // if still remains without groups, append with dashes every 2
    if (i < len) {
      let rem = n.slice(i);
      while (rem.length) {
        out += (out && out[out.length - 1] !== ' ' ? '-' : '');
        out += rem.slice(0, 2);
        rem = rem.slice(2);
      }
    }
    return out;
  }, []);

  const formatted = formatDigits(prefix, digits);

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
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => { hapticSelect(); setShowPicker((v) => !v); }}
              className="h-14 px-4 rounded-2xl border border-white/10 bg-white/5 font-semibold"
            >
              {prefix}
            </button>
            {showPicker && (
              <div className="absolute z-10 mt-2 min-w-[180px] max-h-60 overflow-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                {prefixOptions.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => { hapticSelect(); setPrefix(p.code); setShowPicker(false); setDigits(''); }}
                    className={`flex items-center gap-2 w-full text-left px-4 py-3 hover:bg-white/10 ${p.code===prefix ? 'text-white' : 'text-[color:var(--muted)]'}`}
                  >
                    <span className="text-lg">{p.flag}</span>
                    <span className="font-semibold">{p.code}</span>
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
            placeholder={prefix === '+7' ? '(XXX) XXX-XX-XX' : 'Введите номер'}
            value={formatted}
            onFocus={() => setShowPicker(false)}
            onChange={(e) => onDigitsChange(e.currentTarget.value)}
            maxLength={50}
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


