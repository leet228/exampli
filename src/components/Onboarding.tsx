import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { hapticSlideReveal, hapticTiny, hapticSelect } from '../lib/haptics';
import { supabase } from '../lib/supabase';

type Props = { open: boolean; onDone: () => void };

export default function Onboarding({ open, onDone }: Props) {
  const [step, setStep] = useState(0);
  const canGoNext = true;

  useEffect(() => {
    if (!open) return;
    // всегда стартуем с первого слайда
    setStep(0);
  }, [open]);

  const next = useCallback(() => {
    hapticSlideReveal();
    setStep((s) => Math.min(2, s + 1));
  }, []);

  const sharePhone = useCallback(async () => {
    const tg = (window as any)?.Telegram?.WebApp;
    try {
      const resp = await tg?.requestPhoneNumber?.();
      const phone: string | undefined = resp?.phone_number || resp?.phoneNumber || resp;
      if (phone) {
        // оптимистично обновим локальный boot-кэш
        try {
          const boot = (window as any).__exampliBoot as any | undefined;
          if (boot?.user) {
            boot.user.phone_number = String(phone);
            (window as any).__exampliBoot = boot;
          }
        } catch {}
        // продолжим UI сразу
        next();
        // запись в БД: надёжно через id
        const tgId: number | undefined = tg?.initDataUnsafe?.user?.id;
        if (tgId) {
          try {
            const { data: user } = await supabase
              .from('users')
              .select('id')
              .eq('tg_id', String(tgId))
              .single();
            if (user?.id) {
              await supabase.from('users').update({ phone_number: String(phone) }).eq('id', user.id);
            }
          } catch {}
        }
        return;
      }
    } catch {}
    next();
  }, [next]);

  const finish = useCallback(async () => {
    try { localStorage.setItem('exampli:onboardDone', '1'); } catch {}
    (window as any).__exampliOnboardShown = true;
    (window as any).__exampliAfterOnboarding = true;
    // Обновим boarding_finished=true
    try {} catch {}
    hapticTiny();
    onDone();
  }, [onDone]);

  // Состояние для шага телефона
  const [prefix, setPrefix] = useState<string>('+7');
  const [digits, setDigits] = useState<string>('');
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const tapRef = useRef<{ y: number; t: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    const tg = (window as any)?.Telegram?.WebApp;
    const full = `${prefix}${digits}`;
    // оптимистичный локальный апдейт
    try {
      const boot = (window as any).__exampliBoot as any | undefined;
      if (boot) {
        if (boot.user) boot.user.phone_number = full;
        boot.onboarding = { phone_given: true, course_taken: true, boarding_finished: true };
        (window as any).__exampliBoot = boot;
      }
    } catch {}
    // UI дальше сразу
    next();
    // запись в БД: по id пользователя
    try {
      const tgId: number | undefined = tg?.initDataUnsafe?.user?.id;
      if (tgId) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('tg_id', String(tgId))
          .single();
        if (user?.id) {
          await supabase.from('users').update({ phone_number: full }).eq('id', user.id);
        }
      }
    } catch {}
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

  const handleBackspace = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Backspace') return;
    const el = inputRef.current;
    if (!el) return;
    const sel = el.selectionStart ?? formatted.length;
    // сколько цифр слева от каретки
    const digitsBefore = (formatted.slice(0, sel).match(/\d/g) || []).length;
    if (digitsBefore <= 0) return;
    e.preventDefault();
    const newDigits = digits.slice(0, digitsBefore - 1) + digits.slice(digitsBefore);
    setDigits(newDigits);
    // восстановим каретку после форматирования
    setTimeout(() => {
      const newFormatted = formatDigits(prefix, newDigits);
      // позиция после удаления: после digitsBefore-1-й цифры
      let count = 0; let pos = 0;
      while (pos < newFormatted.length && count < digitsBefore - 1) {
        if (/\d/.test(newFormatted[pos])) count++;
        pos++;
      }
      try { el.setSelectionRange(pos, pos); } catch {}
    }, 0);
  }, [digits, formatted, formatDigits, prefix]);

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
              <div
                className="absolute z-10 mt-2 min-w-[180px] max-h-60 overflow-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-1"
                style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="h-1" />
                {prefixOptions.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); tapRef.current = { y: (e as any).clientY ?? 0, t: Date.now() }; }}
                    onPointerDown={(e) => { tapRef.current = { y: (e as any).clientY ?? 0, t: Date.now() }; }}
                    onPointerUp={(e) => {
                      const y = (e as any).clientY ?? 0;
                      const stamp = Date.now();
                      const start = tapRef.current;
                      const moved = start ? Math.abs(y - start.y) : 999;
                      const dt = start ? (stamp - start.t) : 999;
                      if (moved < 10 && dt < 350) {
                        hapticSelect(); setPrefix(p.code); setShowPicker(false); setDigits('');
                      }
                      tapRef.current = null;
                    }}
                    className={`flex items-center gap-2 w-full text-left px-4 py-3 hover:bg-white/10 ${p.code===prefix ? 'text-white' : 'text-[color:var(--muted)]'}`}
                  >
                    <span className="text-lg">{p.flag}</span>
                    <span className="font-semibold">{p.code}</span>
                  </button>
                ))}
                <div className="h-1" />
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
            onKeyDown={handleBackspace}
            maxLength={50}
            ref={inputRef}
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
          Выбрать
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
          className="fixed inset-0 z-[65] bg-[var(--bg)]"
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

