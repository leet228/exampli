import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { hapticSlideReveal, hapticTiny, hapticSelect } from '../lib/haptics';
import { supabase } from '../lib/supabase';
import { warmupOnboardingSvgs } from '../lib/warmup';

type Props = { open: boolean; onDone: () => void };

export default function Onboarding({ open, onDone }: Props) {
  const [step, setStep] = useState(0);
  const canGoNext = true;
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // всегда стартуем с первого слайда
    setStep(0);
  }, [open]);

  // Прогрев SVG/иконок при старте онбординга (очередь, чтобы не лагало, остаётся в кэше/CDN)
  useEffect(() => {
    if (!open) return;
    // Важно: не грузим "всё подряд". Во время онбординга — только базовые папки.
    try { warmupOnboardingSvgs(); } catch {}
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
              try {
                await supabase.from('user_profile').upsert({
                  user_id: user.id,
                  phone_number: String(phone),
                }, { onConflict: 'user_id' });
              } catch {}
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
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpDigits, setOtpDigits] = useState<string>('');
  const [otpError, setOtpError] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [resendIn, setResendIn] = useState<number>(0);
  const resendTimerRef = useRef<number | null>(null);

  // Telegram BackButton: when on OTP step, allow going back to phone input
  useEffect(() => {
    try {
      const tg = (window as any)?.Telegram?.WebApp;
      const btn = tg?.BackButton;
      if (!tg || !btn) return;
      const handler = () => {
        setOtpSent(false);
        setOtpDigits('');
        setOtpError('');
        try { btn.hide(); } catch {}
      };
      if (open && step === 1 && otpSent) {
        try { btn.show(); } catch {}
        try { btn.onClick?.(handler); } catch {}
        return () => { try { btn.offClick?.(handler); btn.hide?.(); } catch {} };
      } else {
        try { btn.hide(); } catch {}
      }
    } catch {}
  }, [open, step, otpSent]);

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
    if (sending) return;
    setOtpError('');
    setSending(true);
    const tg = (window as any)?.Telegram?.WebApp;
    const full = `${prefix}${digits}`;
    try {
      const tgId: number | undefined = tg?.initDataUnsafe?.user?.id;
      let userId: string | undefined;
      try { userId = (window as any)?.__exampliBoot?.user?.id; } catch {}
      const r = await fetch('/api/phone_start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: full, tg_id: tgId, user_id: userId })
      });
      if (!r.ok) throw new Error('fail');
      const js = await r.json();
      setOtpSent(true);
      setOtpDigits('');
      // стартуем таймер на ресенд (60с)
      const wait = 60;
      setResendIn(wait);
      if (resendTimerRef.current) window.clearInterval(resendTimerRef.current);
      resendTimerRef.current = window.setInterval(() => {
        setResendIn((s) => { if (s <= 1) { if (resendTimerRef.current) window.clearInterval(resendTimerRef.current); return 0; } return s - 1; });
      }, 1000) as unknown as number;
    } catch (e) {
      setOtpError('Не удалось отправить код. Попробуйте позже.');
    } finally {
      setSending(false);
    }
  }, [digits, prefix, sending]);

  const resendCode = useCallback(async () => {
    if (resendIn > 0 || sending || !otpSent) return;
    await submitPhoneManually();
  }, [otpSent, resendIn, sending, submitPhoneManually]);

  const confirmCode = useCallback(async () => {
    if (confirming || otpDigits.length < 4) return;
    setConfirming(true);
    setOtpError('');
    const tg = (window as any)?.Telegram?.WebApp;
    const full = `${prefix}${digits}`;
    try {
      const tgId: number | undefined = tg?.initDataUnsafe?.user?.id;
      let userId: string | undefined; try { userId = (window as any)?.__exampliBoot?.user?.id; } catch {}
      const r = await fetch('/api/phone_confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: full, code: otpDigits, tg_id: tgId, user_id: userId })
      });
      const js = await r.json().catch(() => ({}));
      if (!r.ok || !js?.ok) throw new Error(js?.error || 'fail');

      // success → persist phone to Supabase directly (как в существующем коде выше)
      try {
        const tgId2: number | undefined = tg?.initDataUnsafe?.user?.id;
        if (tgId2) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('tg_id', String(tgId2))
            .single();
          if (user?.id) {
            await supabase.from('users').update({ phone_number: full }).eq('id', user.id);
            try {
              const { data: prof } = await supabase.from('user_profile').select('user_id').eq('user_id', user.id).maybeSingle();
              if (prof?.user_id) {
                await supabase.from('user_profile').update({ phone_number: full }).eq('user_id', user.id);
              } else {
                await supabase.from('user_profile').insert({
                  user_id: user.id,
                  phone_number: full,
                  first_name: '',
                  username: '',
                  background_color: '#3280c2',
                  background_icon: 'bg_icon_cat',
                });
              }
            } catch {}
          }
        }
      } catch {}

      // update local boot and move next
      try {
        const boot = (window as any).__exampliBoot as any | undefined;
        if (boot?.user) boot.user.phone_number = full;
      } catch {}
      next();
    } catch (e) {
      setOtpError('Неверный или просроченный код.');
    } finally {
      setConfirming(false);
    }
  }, [confirming, digits, next, otpDigits, prefix]);

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
      {!otpSent && (
        <div className="space-y-3 px-6 w-full max-w-md">
          <div className="text-2xl font-bold text-white leading-tight">Укажите номер телефона</div>
        </div>
      )}

      {!otpSent && (
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
        </div>
      )}

      {otpSent && (
        <div className="w-full px-6 max-w-md">
          <div className="text-left text-white/80 mb-2">Мы отправили код на {prefix}{digits}</div>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="tel"
            className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left font-semibold tracking-widest text-center"
            placeholder="Введите код"
            value={otpDigits}
            onChange={(e) => setOtpDigits((e.currentTarget.value || '').replace(/\D+/g, '').slice(0, 6))}
            maxLength={6}
          />
          {!!otpError && <div className="mt-2 text-[13px] text-red-300">{otpError}</div>}
          <div className="mt-2 text-[12px] text-[color:var(--muted)]">
            {resendIn > 0 ? `Отправить код повторно можно через ${resendIn} с` : <button type="button" className="underline underline-offset-2" onClick={resendCode}>Отправить код ещё раз</button>}
          </div>
        </div>
      )}

      <div className="w-full px-6 max-w-md">
        {!otpSent ? (
          <button
            type="button"
            disabled={!canSubmitPhone || sending}
            className={`w-full rounded-2xl py-4 font-semibold transition ${canSubmitPhone ? 'btn' : 'bg-[#37464f] text-white/60 cursor-not-allowed'}`}
            onClick={submitPhoneManually}
          >
            {sending ? 'Отправляем…' : 'Отправить код'}
          </button>
        ) : (
          <button
            type="button"
            disabled={otpDigits.length < 4 || confirming}
            className={`w-full rounded-2xl py-4 font-semibold transition ${otpDigits.length >= 4 ? 'btn' : 'bg-[#37464f] text-white/60 cursor-not-allowed'}`}
            onClick={confirmCode}
          >
            {confirming ? 'Проверяем…' : 'Подтвердить'}
          </button>
        )}
        <div className="mt-2 text-[11px] text-[color:var(--muted)] text-center">
          Нажимая кнопку, вы принимаете{' '}
          <button type="button" className="underline underline-offset-2 text-white/85" onClick={() => setPolicyOpen(true)}>Пользовательское соглашение</button>{' '}
          и{' '}
          <button type="button" className="underline underline-offset-2 text-white/85" onClick={() => setPolicyOpen(true)}>Политику обработки персональных данных</button>.
        </div>
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
            <AnimatePresence>
              {policyOpen && (
                <motion.div className="fixed inset-0 z-[66] bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPolicyOpen(false)}>
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <motion.div className="relative max-w-2xl w-full max-h-[80vh] overflow-auto rounded-2xl bg-white/95 text-black p-5" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
                      <h2 className="text-xl font-extrabold mb-3">Пользовательское соглашение и политика данных</h2>
                      <p className="mb-2">Используя сервис «КУРСИК», вы подтверждаете согласие с условиями ниже и даёте согласие на обработку персональных данных для работы сервиса.</p>
                      <div className="mb-3 text-sm leading-relaxed space-y-2">
                        <p className="font-semibold">Зачем нужен номер телефона:</p>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>подтверждение, что вы реальный пользователь, и защита от спама/дубликатов;</li>
                          <li>восстановление доступа и уведомления об оплатах/квитанциях;</li>
                          <li>связь по вопросам поддержки и безопасности аккаунта;</li>
                          <li>законное оформление платных услуг и чеков.</li>
                        </ul>
                        <p>Мы не используем номер для звонков или сторонней рекламы. По запросу можно обновить или удалить данные, если их хранение не требуется по закону.</p>
                      </div>
                      <ul className="list-disc ml-5 space-y-1 text-sm">
                        <li>Цели: регистрация, авторизация, восстановление доступа, платные услуги и поддержка.</li>
                        <li>Состав: номер телефона, идентификатор Telegram, имя пользователя и иные предоставленные данные.</li>
                        <li>Основание: ваше согласие и исполнение договора-оферты.</li>
                        <li>Срок хранения: до достижения целей или отзыва согласия, если иное не требуется законом.</li>
                        <li>Права: доступ, исправление, ограничение, отзыв согласия, удаление — по запросу.</li>
                        <li>Передача третьим лицам: только операторам связи/платёжным провайдерам в объёме, необходимом для оказания услуг.</li>
                      </ul>
                      <div className="mt-4 text-sm">Нажимая «Дальше» на шаге ввода телефона, вы подтверждаете ознакомление с настоящей политикой и выражаете согласие на обработку персональных данных.</div>

                      <div className="mt-5 space-y-4 text-sm leading-relaxed">
                        <h3 className="text-base font-bold">1. Термины и определения</h3>
                        <p>«Оператор» — лицо, организующее и осуществляющее обработку персональных данных, а также определяющее цели обработки, состав персональных данных и действия, совершаемые с персональными данными. В рамках сервиса «КУРСИК» оператором выступает администратор проекта.</p>
                        <p>«Персональные данные» — любая информация, относящаяся к прямо или косвенно определённому пользователю, включая номер телефона, идентификатор Telegram, имя, имя пользователя и иные сведения, предоставленные пользователем.</p>

                        <h3 className="text-base font-bold">2. Принципы обработки</h3>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>Законность, справедливость и прозрачность обработки.</li>
                          <li>Ограничение обработки достижением конкретных, заранее определённых и законных целей.</li>
                          <li>Соответствие состава и объёма данных заявленным целям обработки.</li>
                          <li>Достоверность персональных данных, их достаточность и, при необходимости, актуальность.</li>
                          <li>Хранение в форме, позволяющей определить субъекта, не дольше, чем того требуют цели обработки.</li>
                        </ul>

                        <h3 className="text-base font-bold">3. Категории данных</h3>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>Идентификатор Telegram (tg_id) и служебные атрибуты WebApp.</li>
                          <li>Контактные данные (номер телефона), если вы его предоставляете.</li>
                          <li>Профильные сведения (имя, имя пользователя, аватар), если вы их указываете.</li>
                          <li>Статистические и технические данные (стрики, энергия, внутриигровые показатели, события интерфейса).</li>
                        </ul>

                        <h3 className="text-base font-bold">4. Правовые основания</h3>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>Согласие субъекта персональных данных.</li>
                          <li>Необходимость исполнения договора-оферты и предоставления сервиса.</li>
                          <li>Выполнение обязанностей, возложенных законом (например, бухгалтерский учёт).</li>
                        </ul>

                        <h3 className="text-base font-bold">5. Цели обработки</h3>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>Регистрация и авторизация пользователей в сервисе.</li>
                          <li>Предоставление платных функций и обработка платежей.</li>
                          <li>Отображение прогресса, достижений и персонализация интерфейса.</li>
                          <li>Коммуникация с пользователем по вопросам сервиса и поддержки.</li>
                          <li>Улучшение качества сервиса и аналитика работы функций.</li>
                        </ul>

                        <h3 className="text-base font-bold">6. Операции с данными</h3>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>Сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение).</li>
                          <li>Извлечение, использование, передача (предоставление, доступ), обезличивание, блокирование, удаление.</li>
                        </ul>

                        <h3 className="text-base font-bold">7. Хранение и сроки</h3>
                        <p>Персональные данные хранятся до достижения целей обработки либо до момента отзыва согласия пользователем, если дальнейшее хранение не требуется по закону. Сроки хранения отдельных категорий данных могут различаться в зависимости от правовых оснований и договорных обязательств.</p>

                        <h3 className="text-base font-bold">8. Передача и трансграничная передача</h3>
                        <p>Передача персональных данных третьим лицам осуществляется только при наличии правовых оснований и в объёме, необходимом для оказания услуг (например, операторам связи, платёжным провайдерам). При трансграничной передаче оператор обеспечивает соблюдение требований законодательства к уровню защиты данных в стране получателя.</p>

                        <h3 className="text-base font-bold">9. Права субъекта</h3>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>Право на получение информации об обработке своих персональных данных.</li>
                          <li>Право требовать уточнения данных, их блокирования или удаления при наличии оснований.</li>
                          <li>Право на отзыв согласия на обработку в любой момент.</li>
                          <li>Право на ограничение обработки и возражение против неё в случаях, предусмотренных законом.</li>
                        </ul>

                        <h3 className="text-base font-bold">10. Cookies и идентификаторы</h3>
                        <p>Сервис может использовать файлы cookies, локальное и сессионное хранилище для сохранения настроек, кэша и ускорения работы интерфейса. Вы можете ограничить использование cookies в настройках браузера; это может повлиять на доступность ряда функций.</p>

                        <h3 className="text-base font-bold">11. Безопасность</h3>
                        <ul className="list-disc ml-5 space-y-1">
                          <li>Ограничение доступа к данным и принцип минимально необходимого доступа.</li>
                          <li>Использование защищённых каналов передачи и резервных копий.</li>
                          <li>Мониторинг событий безопасности и регулярное обновление компонентов.</li>
                        </ul>

                        <h3 className="text-base font-bold">12. Порядок отзыва согласия</h3>
                        <p>Вы можете в любой момент отозвать своё согласие на обработку персональных данных, направив запрос в службу поддержки. После получения запроса оператор прекращает обработку, за исключением случаев, когда продолжение обработки обязательно по закону.</p>

                        <h3 className="text-base font-bold">13. Контакты оператора</h3>
                        <p>Для вопросов по обработке персональных данных и реализации ваших прав используйте форму поддержки в приложении или напишите в службу поддержки сервиса «КУРСИК».</p>

                        <h3 className="text-base font-bold">14. Изменения политики</h3>
                        <p>Оператор вправе обновлять настоящую Политику. Актуальная версия всегда доступна в приложении. Продолжая использовать сервис после публикации изменений, вы подтверждаете согласие с обновлённой редакцией.</p>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

