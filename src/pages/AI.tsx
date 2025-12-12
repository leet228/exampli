import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cacheGet, CACHE_KEYS } from '../lib/cache';
import { motion } from 'framer-motion';
import MarkdownRenderer from '../components/MarkdownRenderer';
import remarkGfm from 'remark-gfm';
import { hapticTiny, hapticSelect, hapticTypingTick } from '../lib/haptics';

type ChatRole = 'user' | 'assistant';

type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type MessageContent = string | MessagePart[];

type ChatMessage = {
  role: ChatRole;
  content: MessageContent;
};

const STORAGE_KEY = 'ai_chat_cache_v1';
const PRESS_SHADOW_HEIGHT = 6;

export default function AI() {
  const navigate = useNavigate();
  const [isPlus, setIsPlus] = React.useState<boolean>(() => {
    try {
      const pu0 = (window as any)?.__exampliBoot?.user?.plus_until || (cacheGet<any>(CACHE_KEYS.user)?.plus_until);
      return Boolean(pu0 && new Date(String(pu0)).getTime() > Date.now());
    } catch { return false; }
  });

  const [isAiPlus, setIsAiPlus] = React.useState<boolean>(() => {
    try {
      const apu0 = (window as any)?.__exampliBoot?.user?.ai_plus_until || (cacheGet<any>(CACHE_KEYS.user)?.ai_plus_until);
      if (apu0) return Boolean(new Date(String(apu0)).getTime() > Date.now());
      return false;
    } catch { return false; }
  });

  // Показываем если есть ЛЮБАЯ подписка (PLUS или AI+)
  const hasAccess = isPlus || isAiPlus;

  // React to subscription status updates (e.g., after purchase)
  React.useEffect(() => {
    const onStats = (evt: Event) => {
      const e = evt as CustomEvent<{ plus_until?: string; ai_plus_until?: string } & any>;
      if (e.detail?.plus_until !== undefined) {
        try { setIsPlus(Boolean(e.detail.plus_until && new Date(e.detail.plus_until).getTime() > Date.now())); } catch {}
      }
      if (e.detail?.ai_plus_until !== undefined) {
        try { setIsAiPlus(Boolean(e.detail.ai_plus_until && new Date(e.detail.ai_plus_until).getTime() > Date.now())); } catch {}
      }
    };
    window.addEventListener('exampli:statsChanged', onStats as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onStats as EventListener);
  }, []);

  // При отсутствии ЛЮБОЙ подписки блокируем скролл всей страницы
  React.useEffect(() => {
    if (!hasAccess) {
      const prevOverflow = document.body.style.overflow;
      const prevOverscroll = document.documentElement.style.overscrollBehavior as string;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
      return () => {
        document.body.style.overflow = prevOverflow;
        document.documentElement.style.overscrollBehavior = prevOverscroll || '';
      };
    }
  }, [hasAccess]);
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed)) return parsed as ChatMessage[];
    } catch {}
    return [{ role: 'assistant', content: '' }];
  });
  const [input, setInput] = React.useState<string>('');
  const [pendingImages, setPendingImages] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const inputShellRef = React.useRef<HTMLDivElement | null>(null);
  const previewWrapRef = React.useRef<HTMLDivElement | null>(null);
  const MAX_VISIBLE_LINES = 8;
  const [isInputFocused, setIsInputFocused] = React.useState<boolean>(false);
  const isFirstMountRef = React.useRef<boolean>(true);
  const [previewOffset, setPreviewOffset] = React.useState<number>(0);
  // высота «нижней полоски» для поля ввода совпадает с кнопками
  const [inputTall, setInputTall] = React.useState<boolean>(false);

  const hasAnyUser = React.useMemo(() => messages.some((m) => m.role === 'user'), [messages]);

  const inputBaseColor = '#2b2b2b';
  const inputDarkColor = React.useMemo(() => darken(inputBaseColor, 18), []);
  const sendingLocked = isLoading;
  function focusComposer(e?: any) {
    try {
      if (sendingLocked) return;
      const el = (e?.target as HTMLElement) || null;
      if (!el) { textareaRef.current?.focus(); return; }
      // Не фокусируем textarea, если клик по кнопкам/иконкам/крестикам
      if (el.closest('[data-no-focus]') || el.tagName === 'BUTTON' || el.closest('button')) return;
      if (el.tagName === 'TEXTAREA') return;
      textareaRef.current?.focus();
    } catch {}
  }

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      // На первом экране держим приветствие сверху
      el.scrollTo({ top: 0 });
      return;
    }
    // Далее — автопрокрутка вниз на новые сообщения/тайпинг
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isLoading]);

  // История диалога инициализируется лениво в useState из sessionStorage (см. STORAGE_KEY)

  // Сохранение истории в sessionStorage (только содержимого диалога)
  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // авто-рост textarea до 8 строк, дальше — внутренний скролл
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = window.getComputedStyle(el);
    const line = parseFloat(cs.lineHeight || '20');
    const pad = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');
    const maxH = line * MAX_VISIBLE_LINES + pad;
    const next = Math.min(el.scrollHeight, Math.max(maxH, line + pad));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
    // признак многострочности — «заостряем» углы у контейнера
    const singleLineH = line + pad;
    setInputTall(el.scrollHeight > singleLineH + 2);
  }, [input]);

  // Прячу нижний HUD, когда поле ввода в фокусе
  React.useEffect(() => {
    const cls = 'chat-input-active';
    if (isInputFocused) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => document.body.classList.remove(cls);
  }, [isInputFocused]);

  // Выравнивание первого превью ровно над началом поля ввода
  React.useLayoutEffect(() => {
    const align = () => {
      try {
        const inputEl = inputShellRef.current;
        const wrapEl = previewWrapRef.current;
        if (!inputEl || !wrapEl) { setPreviewOffset(0); return; }
        const r1 = inputEl.getBoundingClientRect();
        const r0 = wrapEl.getBoundingClientRect();
        const dx = Math.round(r1.left - r0.left);
        setPreviewOffset(Math.max(0, dx));
      } catch { setPreviewOffset(0); }
    };
    align();
    window.addEventListener('resize', align);
    return () => window.removeEventListener('resize', align);
  }, [pendingImages.length, isInputFocused, input]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed && pendingImages.length === 0) return;
    if (isLoading) return;
    setError(null);

    const userContent: MessageContent = pendingImages.length > 0
      ? (
          [
            ...(trimmed ? [{ type: 'text', text: trimmed } as const] : [{ type: 'text', text: 'Опиши, что на фото.' } as const]),
            ...pendingImages.map((url) => ({ type: 'image_url', image_url: { url } } as const)),
          ]
        )
      : trimmed;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: userContent }];
    setMessages(nextMessages);
    setInput('');
    setPendingImages([]);
    setIsLoading(true);
    // Хаптик «выстрел» после отправки
    try { hapticTiny(); } catch {}

    try {
      const userId = (() => {
        try {
          const w = (window as any);
          const id1 = w?.__exampliBoot?.user?.id || null;
          if (id1) return String(id1);
        } catch {}
        try {
          const u = cacheGet<any>(CACHE_KEYS.user) || null;
          if (u?.id) return String(u.id);
        } catch {}
        return null;
      })();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          user_id: userId
        }),
      });

      if (!response.ok) {
        if (response.status === 402) {
          try {
            const clonedResponse = response.clone();
            const json = await clonedResponse.json();
            if (json?.error === 'limit_exceeded' || json?.detail === 'limit_exceeded') {
              // Превышен лимит - показываем сообщение от AI
              // Если у пользователя есть AI+ подписка, показываем простое сообщение без кнопки
              const limitMessage = isAiPlus 
                ? 'Извините, вы исчерпали месячный лимит.' 
                : 'Извините, вы исчерпали месячный лимит. Чтобы продолжить использование, вы можете купить КУРСИК AI +.';
              setMessages((prev) => [...prev, { 
                role: 'assistant', 
                content: limitMessage 
              }]);
              try { hapticSelect(); } catch {}
              setIsLoading(false);
              return;
            }
          } catch {}
        }
        const detail = await safeText(response as any);
        throw new Error(detail || `Request failed with ${response.status}`);
      }
      const ct = response.headers.get('content-type') || '';
      // Стриминговый ответ (text/plain): читаем body по кусочкам
      if (ct.includes('text/plain') && response.body) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        // Микро‑хаптики во время «печати»: паттерн с разными интервалами
        // пример: 10× по ~150мс → 5× по ~250мс → 15× по ~200мс (с лёгким джиттером)
        let stopTypingHaptics = false;
        (function runTypingPattern() {
          const schedule = [
            { count: 10, delay: 150 },
            { count: 5,  delay: 250 },
            { count: 15, delay: 200 },
          ];
          let phase = 0;
          let left = schedule[phase].count;
          const tick = () => {
            if (stopTypingHaptics) return;
            try { hapticTypingTick(); } catch {}
            left -= 1;
            if (left <= 0) {
              phase = (phase + 1) % schedule.length;
              left = schedule[phase].count;
            }
            const base = schedule[phase].delay;
            const jitter = Math.round((Math.random() * 0.25 - 0.125) * base); // ±12.5%
            const next = Math.max(60, base + jitter);
            window.setTimeout(tick, next);
          };
          window.setTimeout(tick, schedule[0].delay);
        })();
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) {
              setMessages((prev) => {
                const out = prev.slice();
                const i = out.length - 1;
                const cur = out[i];
                if (cur && cur.role === 'assistant' && typeof cur.content === 'string') {
                  out[i] = { ...cur, content: String(cur.content) + chunk };
                }
                return out;
              });
            }
          }
        }
        stopTypingHaptics = true;
        try { hapticSelect(); } catch {}
      } else {
        // Старый путь: целиком JSON
        const { content } = await response.json();
        setMessages((prev) => [...prev, { role: 'assistant', content: String(content || '') }]);
        try { hapticSelect(); } catch {}
      }
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Не удалось получить ответ.');
    } finally {
      setIsLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter переносит строку; отправки на Enter больше нет
    if (e.key === 'Enter' && !e.shiftKey) {
      // ничего не делаем — стандартный перенос строки
      return;
    }
  }

  function onPickImageClick() {
    if (sendingLocked) return;
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const allowed = files.filter((f) => f.type.startsWith('image/'));
    if (!allowed.length) { setError('Пожалуйста, выберите изображение.'); return; }
    try {
      const remain = Math.max(0, 1 - pendingImages.length);
      if (remain <= 0) return;
      const picked = allowed.slice(0, remain);
      const urls = await Promise.all(picked.map((f) => readFileAsDataUrl(f)));
      setPendingImages((prev) => [...prev, ...urls].slice(0, 1));
    } catch (_err: any) {
      setError('Не удалось прочитать файл изображения.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (!hasAccess) {
    return (
      <div className="fixed inset-0 z-[40] pointer-events-none" style={{ background: '#01347a' }}>
        {/* Картинка на весь экран */}
        <img
          src="/subs/sub_pic.svg"
          alt="Подписка"
          className="absolute inset-0 m-auto max-w-full max-h-full object-contain pointer-events-none select-none"
          style={{ transform: 'translateY(100px)' }}
        />
        {/* Кнопка поверх, ещё выше HUD */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-36 z-[61] w-[min(92%,680px)] px-4 pointer-events-auto">
          <SubscribeCtaButton onClick={() => { try { hapticTiny(); } catch {}; navigate('/subscription'); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="safe-bottom main-scroll">
      <div className="w-full px-3 pt-0 pb-4 h-full flex flex-col ai-greet-pad relative">
        {!hasAnyUser && (
          <img
            src="/ai/ai_www.svg"
            alt=""
            aria-hidden
            className="fixed left-1/2 -translate-x-1/2 pointer-events-none select-none"
            style={{ bottom: 180, width: 'min(92%, 720px)', opacity: 0.85, zIndex: 0 }}
          />
        )}
        {/* Фиксированный HUD приветствия поверх ленты */}
        <div className="ai-greet-hud">
          {/* Показываем КУРСИК AI + если есть подписка AI+, иначе обычный заголовок */}
          {isAiPlus ? (
            <div className="text-center w-full">
              <span className="font-extrabold text-xl tracking-wide" style={{background:'linear-gradient(90deg,#38bdf8,#6366f1)', WebkitBackgroundClip:'text', color:'transparent'}}>КУРСИК AI</span> <span className="font-extrabold text-xl tracking-wide" style={{background:'linear-gradient(90deg,#38bdf8,#6366f1,#ec4899,#ef4444)', WebkitBackgroundClip:'text', color:'transparent'}}>+</span>
            </div>
          ) : (
            <div className="inline-block text-3xl font-extrabold tracking-wide text-[#e5edff] opacity-95">
              {messages.length && messages[0]?.role === 'assistant' && typeof messages[0].content === 'string'
                ? messages[0].content
                : 'КУРСИК AI'}
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-44 pt-1 relative"
          aria-live="polite"
        >
          {messages.slice(1).map((m, idx) => (
            <ChatBubble key={idx + 1} role={m.role} content={m.content} navigate={navigate} />
          ))}

          {isLoading && (
            <div className="px-2">
              <div className="inline-flex items-center gap-2 py-3">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* Ввод как на макете: фиксирован над нижним HUD */}
        <div className="ai-input-fixed">
          {pendingImages.length > 0 && (
            <div className="mb-2" ref={previewWrapRef}>
              <div className="flex items-center gap-2" style={{ marginLeft: `${previewOffset}px` }}>
                {pendingImages.map((src, i) => (
                  <div key={i} className="relative inline-block">
                    <img src={src} alt="Выбранное изображение" className="w-20 h-20 object-cover rounded-2xl border border-white/10" />
                    <button
                      type="button"
                      className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center"
                      data-no-focus
                      aria-label="Убрать фото"
                      onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-end gap-2 ai-input-row" onMouseDownCapture={focusComposer} onTouchStartCapture={focusComposer}>
            {/* плюсик */}
            <MotionPressButton
              ariaLabel="Прикрепить изображение"
              onClick={() => { try { hapticTiny(); } catch {}; onPickImageClick(); }}
              baseColor="#2b2b2b"
              textColor="rgba(255,255,255,0.9)"
              disabled={sendingLocked}
            >
              +
            </MotionPressButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />

            {/* поле ввода — скруглённое, растёт до 8 строк */}
            <div
              ref={inputShellRef}
              className="flex-1 min-w-0 border border-transparent px-4 py-2"
              style={{
                background: inputBaseColor,
                boxShadow: `0px ${PRESS_SHADOW_HEIGHT}px 0px ${inputDarkColor}`,
                borderRadius: inputTall ? 14 : 9999,
              }}
            >
              <textarea
                ref={textareaRef}
                className="block w-full bg-transparent outline-none text-[var(--text)] placeholder-[var(--muted)] text-base leading-6 resize-none no-scrollbar whitespace-pre-wrap break-normal disabled:cursor-not-allowed"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={true}
                placeholder="Спроси что угодно"
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                disabled={sendingLocked}
                aria-disabled={sendingLocked}
                style={{ opacity: sendingLocked ? 0.55 : 1 }}
              />
            </div>

            {/* отправка */}
            <MotionPressButton
              ariaLabel="Отправить"
              onClick={sendMessage}
              baseColor="#ffffff"
              textColor="#000000"
              disabled={(!input.trim() && pendingImages.length === 0) || isLoading}
              disabledBackgroundColor="#e5e5e5"
              disabledTextColor="#7a7a7a"
            >
              ↑
            </MotionPressButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubscribeCtaButton({ onClick }: { onClick: () => void }) {
  const base = '#3b5bff';
  const dark = darken(base, 18);
  const press = 6;
  const [pressed, setPressed] = React.useState(false);
  return (
    <motion.button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => { setPressed(false); onClick(); }}
      animate={{ y: pressed ? press : 0, boxShadow: pressed ? `0px 0px 0px ${dark}` : `0px ${press}px 0px ${dark}` }}
      transition={{ duration: 0 }}
      className="w-full rounded-full text-white font-extrabold tracking-wider py-3 text-center"
      style={{ background: base }}
    >
      КУПИТЬ ПОДПИСКУ
    </motion.button>
  );
}

function ChatBubble({ role, content, navigate }: ChatMessage & { navigate?: (path: string) => void }) {
  const isUser = role === 'user';
  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} items-start gap-2 px-1`}>
      {/* icon removed for assistant messages */}
      <div
        className={
          isUser
            ? 'max-w-full inline-block rounded-3xl px-4 py-3 bg-white/5 border border-white/10 text-[var(--text)]'
            : 'max-w-full inline-block px-1 py-1 text-[var(--text)] allow-select'
        }
      >
        <RenderMessageContent content={content} role={role} navigate={navigate} />
      </div>
    </div>
  );
}

function RenderMessageContent({ content, role, navigate }: { content: MessageContent; role: ChatRole; navigate?: (path: string) => void }) {
  const common = 'prose prose-invert max-w-none prose-p:my-0 prose-li:my-0 prose-pre:bg-white/10';
  // Проверяем наличие AI+ подписки
  const isAiPlus = (() => {
    try {
      const apu0 = (window as any)?.__exampliBoot?.user?.ai_plus_until || (cacheGet<any>(CACHE_KEYS.user)?.ai_plus_until);
      if (apu0) return Boolean(new Date(String(apu0)).getTime() > Date.now());
      return false;
    } catch { return false; }
  })();
  const isLimitMessage = typeof content === 'string' && content.includes('исчерпали месячный лимит');
  // Кнопка показывается только если нет подписки AI+ и есть упоминание о покупке
  const showLimitButton = isLimitMessage && !isAiPlus && typeof content === 'string' && content.includes('купить КУРСИК AI +');
  
  if (typeof content === 'string') {
    return role === 'assistant' ? (
      <div className="space-y-3">
        <MarkdownRenderer className={`${common} text-base leading-relaxed`} content={content} />
        {showLimitButton && navigate && (
          <LimitButton onClick={() => { try { hapticSelect(); } catch {} navigate('/subscription'); }} />
        )}
      </div>
    ) : (
      <div className="whitespace-pre-wrap break-normal text-base leading-relaxed">{content}</div>
    );
  }
  const textParts = content.filter((p) => p.type === 'text').map((p) => (p as any).text || '').join('');
  const isLimitMessageInParts = textParts.includes('исчерпали месячный лимит');
  const showLimitButtonInParts = isLimitMessageInParts && !isAiPlus && textParts.includes('купить КУРСИК AI +');
  
  return (
    <div className="space-y-2">
      {content.map((part, idx) => {
        if (part.type === 'text') {
          return role === 'assistant' ? (
            <MarkdownRenderer key={idx} className={`${common} text-base leading-relaxed`} content={part.text} />
          ) : (
            <div key={idx} className="whitespace-pre-wrap break-normal text-base leading-relaxed">
              {part.text}
            </div>
          );
        }
        if (part.type === 'image_url') {
          return (
            <img
              key={idx}
              src={part.image_url.url}
              alt="Изображение в сообщении"
              className="max-w-full rounded-xl border border-white/10"
            />
          );
        }
        return null;
      })}
      {showLimitButtonInParts && role === 'assistant' && navigate && (
        <LimitButton onClick={() => { try { hapticSelect(); } catch {} navigate('/subscription'); }} />
      )}
    </div>
  );
}

function LimitButton({ onClick }: { onClick: () => void }) {
  const base = '#3c73ff';
  const dark = darken(base, 18);
  const press = 6;
  const [pressed, setPressed] = React.useState(false);
  return (
    <motion.button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => { setPressed(false); onClick(); }}
      animate={{ y: pressed ? press : 0, boxShadow: pressed ? `0px 0px 0px ${dark}` : `0px ${press}px 0px ${dark}` }}
      transition={{ duration: 0 }}
      className="w-full rounded-full text-white font-extrabold tracking-wider py-3 px-6 text-center"
      style={{ background: base }}
    >
      КУПИТЬ КУРСИК AI +
    </motion.button>
  );
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// Цветовые утилиты для вычисления нижней «полоски»
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

function darken(hex: string, amount = 18) {
  if (hex.startsWith('rgb')) return hex; // простая защита, если уже rgb
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

// Кнопка с «нижней полоской» через box-shadow и мгновенной анимацией
function MotionPressButton({
  children,
  onClick,
  ariaLabel,
  baseColor,
  textColor,
  disabled,
  disabledBackgroundColor,
  disabledTextColor,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  baseColor: string;
  textColor: string;
  disabled?: boolean;
  disabledBackgroundColor?: string;
  disabledTextColor?: string;
}) {
  const [pressed, setPressed] = React.useState(false);
  const shadowHeight = PRESS_SHADOW_HEIGHT;
  const bg = disabled ? (disabledBackgroundColor || baseColor) : baseColor;
  const fg = disabled ? (disabledTextColor || textColor) : textColor;
  const darkColor = React.useMemo(() => darken(bg, 18), [bg]);
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => { setPressed(false); if (!disabled) onClick && onClick(); }}
      animate={{
        y: disabled ? 0 : (pressed ? shadowHeight : 0),
        boxShadow: disabled ? `0px ${shadowHeight}px 0px ${darkColor}` : (pressed ? `0px 0px 0px ${darkColor}` : `0px ${shadowHeight}px 0px ${darkColor}`),
      }}
      transition={{ duration: 0 }}
      className={`shrink-0 ai-btn rounded-full flex items-center justify-center ${disabled ? 'cursor-not-allowed' : ''}`}
      style={{ background: bg, color: fg }}
      data-no-focus
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
}
