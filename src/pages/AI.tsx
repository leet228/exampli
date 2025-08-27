import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
      content:
        'Привет! Я твой умный учитель. Скажи, что хочешь понять — объясню просто и по шагам. 😊',
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
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Не удалось получить ответ.');
    } finally {
      setIsLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
    <div className="safe-top safe-bottom main-scroll">
      <div className="w-full px-3 py-4 h-full flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar space-y-4"
          aria-live="polite"
        >
          {messages.map((m, idx) => (
            <ChatBubble key={idx} role={m.role} content={m.content} />
          ))}

          {isLoading && (
            <div className="flex items-start gap-3 fade-in">
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">🤖</div>
              <div className="rounded-2xl px-4 py-3 bg-white/5 border border-white/10 text-sm text-[var(--text)]">
                Печатаю ответ...
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* Ввод как на макете: слева +, по центру поле, справа круглая кнопка отправки */}
        <div className="mt-3 px-1">
          {pendingImage && (
            <div className="pb-2">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2">
                <img src={pendingImage} alt="Выбранное изображение" className="w-16 h-16 object-cover rounded-xl" />
                <button className="text-xs text-red-300" onClick={() => setPendingImage(null)}>
                  Убрать фото
                </button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            {/* плюсик */}
            <button
              type="button"
              onClick={onPickImageClick}
              aria-label="Прикрепить изображение"
              className="shrink-0 w-12 h-12 rounded-full bg-white/10 border border-white/10 text-xl text-white/90 flex items-center justify-center"
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
            <div className="flex-1 min-w-0 rounded-full bg-white/5 border border-white/10 px-4 py-2">
              <textarea
                ref={textareaRef}
                className="block w-full bg-transparent outline-none text-[var(--text)] placeholder-[var(--muted)] text-base leading-6 resize-none no-scrollbar whitespace-pre-wrap break-normal"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={true}
                placeholder="Напиши сообщение… (Enter — отправить, Shift+Enter — перенос)"
              />
            </div>

            {/* отправка */}
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && !pendingImage) || isLoading}
              aria-label="Отправить"
              className="shrink-0 w-12 h-12 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
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
      {!isUser && (
        <div className="mt-1 w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">🤖</div>
      )}
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
