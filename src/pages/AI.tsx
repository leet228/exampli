import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hapticTiny, hapticSelect } from '../lib/haptics';

type ChatRole = 'user' | 'assistant';

type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type MessageContent = string | MessagePart[];

type ChatMessage = {
  role: ChatRole;
  content: MessageContent;
};

export default function AI() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Привет! Я твой личный учитель.',
    },
  ]);
  const [input, setInput] = React.useState<string>('');
  const [pendingImage, setPendingImage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const MAX_VISIBLE_LINES = 8;
  const [isInputFocused, setIsInputFocused] = React.useState<boolean>(false);

  React.useEffect(() => {
    // автопрокрутка вниз при новых сообщениях
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isLoading]);

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

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed && !pendingImage) return;
    if (isLoading) return;
    setError(null);

    const userContent: MessageContent = pendingImage
      ? [
          ...(trimmed ? [{ type: 'text', text: trimmed } as const] : [{ type: 'text', text: 'Опиши, что на фото.' } as const]),
          { type: 'image_url', image_url: { url: pendingImage } } as const,
        ]
      : trimmed;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: userContent }];
    setMessages(nextMessages);
    setInput('');
    setPendingImage(null);
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

      if (!response.ok) {
        const detail = await safeText(response);
        throw new Error(detail || `Request failed with ${response.status}`);
      }

      const data: { content?: string } = await response.json();
      const assistantReply = data.content?.trim() || 'Извини, я сейчас не смог ответить.';
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantReply }]);
      // Хаптик «как смс пришла» на ответ бота
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
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Пожалуйста, выберите изображение.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingImage(dataUrl);
    } catch (_err: any) {
      setError('Не удалось прочитать файл изображения.');
    } finally {
      // allow reselect same file later
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="safe-top safe-bottom main-scroll ai-top">
      <div className="w-full px-3 pt-0 pb-4 h-full flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-44"
          aria-live="polite"
        >
          {/* приветственное сообщение наверху */}
          {/* принудительно показываем всегда на первом экране */}
          {messages.length && messages[0]?.role === 'assistant' && (
            <ChatBubble role="assistant" content={messages[0].content} />
          )}
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
          {pendingImage && (
            <div className="mb-2">
              <div className="relative inline-block">
                <img src={pendingImage} alt="Выбранное изображение" className="w-20 h-20 object-cover rounded-2xl border border-white/10" />
                <button
                  type="button"
                  className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center"
                  aria-label="Убрать фото"
                  onClick={() => setPendingImage(null)}
                >
                  ×
                </button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2 ai-input-row">
            {/* плюсик */}
            <button
              type="button"
              onClick={onPickImageClick}
              aria-label="Прикрепить изображение"
              className="shrink-0 ai-btn rounded-full bg-[#2b2b2b] border border-transparent text-xl text-white/90 flex items-center justify-center"
            >
              +
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />

            {/* поле ввода — скруглённое, растёт до 8 строк */}
            <div className="flex-1 min-w-0 rounded-full bg-[#2b2b2b] border border-transparent px-4 py-2">
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
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && !pendingImage) || isLoading}
              aria-label="Отправить"
              className="shrink-0 ai-btn rounded-full bg-white text-black flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ↑
            </button>
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
            : 'max-w-full inline-block px-1 py-1 text-[var(--text)]'
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
      <ReactMarkdown className={`${common} text-base leading-relaxed`} remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    ) : (
      <div className="whitespace-pre-wrap break-normal text-base leading-relaxed">{content}</div>
    );
  }
  return (
    <div className="space-y-2">
      {content.map((part, idx) => {
        if (part.type === 'text') {
          return role === 'assistant' ? (
            <ReactMarkdown key={idx} className={`${common} text-base leading-relaxed`} remarkPlugins={[remarkGfm]} skipHtml>
              {part.text}
            </ReactMarkdown>
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
