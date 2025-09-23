import React from 'react';
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

  const hasAnyUser = React.useMemo(() => messages.some((m) => m.role === 'user'), [messages]);

  const inputBaseColor = '#2b2b2b';
  const inputDarkColor = React.useMemo(() => darken(inputBaseColor, 18), []);
  function focusComposer(e?: any) {
    try {
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await safeText(response as any);
        throw new Error(detail || `Request failed with ${response.status}`);
      }

      // SSE поток из /api/chat -> постепенно накапливаем ответ
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let acc = '';
      // добавляем «пустое» ассистентское сообщение, которое будем дополнять
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      let lastTick = 0;
      let pending = '';
      let lastFlush = 0;
      const flush = () => {
        if (!pending) return;
        const chunkToAppend = pending;
        pending = '';
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant' && typeof last.content === 'string') {
            copy[copy.length - 1] = { role: 'assistant', content: last.content + chunkToAppend };
          }
          return copy;
        });
        const now = Date.now();
        if (now - lastTick > 150) { try { hapticTypingTick(); } catch {} lastTick = now; }
        lastFlush = now;
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // протокол OpenAI SSE: строки data: {...}\n\n, выберем content дельты
        chunk.split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'))
          .forEach((line) => {
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') return;
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length) {
                acc += delta;
                pending += delta;
                if (Date.now() - lastFlush > 80) {
                  flush();
                }
              }
            } catch {}
          });
      }
      // финальный флеш накопившегося буфера
      flush();
      // Хаптик на завершение ответа
      try { hapticSelect(); } catch {}
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
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const allowed = files.filter((f) => f.type.startsWith('image/'));
    if (!allowed.length) { setError('Пожалуйста, выберите изображение.'); return; }
    try {
      const remain = Math.max(0, 3 - pendingImages.length);
      if (remain <= 0) return;
      const picked = allowed.slice(0, remain);
      const urls = await Promise.all(picked.map((f) => readFileAsDataUrl(f)));
      setPendingImages((prev) => [...prev, ...urls].slice(0, 3));
    } catch (_err: any) {
      setError('Не удалось прочитать файл изображения.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
          <div className="inline-block text-3xl font-extrabold tracking-wide text-[#e5edff] opacity-95">
            {messages.length && messages[0]?.role === 'assistant' && typeof messages[0].content === 'string'
              ? messages[0].content
              : 'КУРСИК AI'}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-44 pt-1 relative"
          aria-live="polite"
        >
          {messages.slice(1).map((m, idx) => (
            <ChatBubble key={idx + 1} role={m.role} content={m.content} />
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
            >
              +
            </MotionPressButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              multiple
              onChange={onFileChange}
            />

            {/* поле ввода — скруглённое, растёт до 8 строк */}
            <div
              ref={inputShellRef}
              className="flex-1 min-w-0 rounded-full border border-transparent px-4 py-2"
              style={{
                background: inputBaseColor,
                boxShadow: `0px ${PRESS_SHADOW_HEIGHT}px 0px ${inputDarkColor}`,
                borderRadius: 9999,
              }}
            >
              <textarea
                ref={textareaRef}
                className="block w-full bg-transparent outline-none text-[var(--text)] placeholder-[var(--muted)] text-base leading-6 resize-none no-scrollbar whitespace-pre-wrap break-normal"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={true}
                placeholder="Спроси что угодно"
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
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

function ChatBubble({ role, content }: ChatMessage) {
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
        <RenderMessageContent content={content} role={role} />
      </div>
    </div>
  );
}

function RenderMessageContent({ content, role }: { content: MessageContent; role: ChatRole }) {
  const common = 'prose prose-invert max-w-none prose-p:my-0 prose-li:my-0 prose-pre:bg-white/10';
  if (typeof content === 'string') {
    return role === 'assistant' ? (
      <MarkdownRenderer className={`${common} text-base leading-relaxed`} content={content} />
    ) : (
      <div className="whitespace-pre-wrap break-normal text-base leading-relaxed">{content}</div>
    );
  }
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
    </div>
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
