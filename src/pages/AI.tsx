import React from 'react';

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

  React.useEffect(() => {
    // автопрокрутка вниз при новых сообщениях
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isLoading]);

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
    } catch (err: any) {
      setError('Не удалось прочитать файл изображения.');
    } finally {
      // allow reselect same file later
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="safe-top safe-bottom main-scroll">
      <div className="max-w-xl mx-auto px-4 py-4 h-full flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1"
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

        <div className="mt-3 rounded-2xl bg-white/5 border border-white/10 p-2">
          {pendingImage && (
            <div className="px-2 pb-2">
              <div className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2">
                <img src={pendingImage} alt="Выбранное изображение" className="w-16 h-16 object-cover rounded-lg" />
                <button
                  className="text-xs text-red-300 hover:text-red-200"
                  onClick={() => setPendingImage(null)}
                >
                  Убрать фото
                </button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={onPickImageClick}
              className="btn-outline px-3 py-3"
              aria-label="Прикрепить изображение"
            >
              📷
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
            <textarea
              className="flex-1 bg-transparent outline-none text-[var(--text)] placeholder-[var(--muted)] text-sm resize-none max-h-40"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Спроси меня о чём угодно или прикрепи фото... (Enter — отправить)"
            />
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && !pendingImage) || isLoading}
              className="btn disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Отправить"
            >
              Отправить
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
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">🤖</div>
      )}
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl px-4 py-3 bg-[#1cb0f6] text-black font-medium'
            : 'max-w-[85%] rounded-2xl px-4 py-3 bg-white/5 border border-white/10 text-[var(--text)]'
        }
      >
        <RenderMessageContent content={content} />
      </div>
    </div>
  );
}

function RenderMessageContent({ content }: { content: MessageContent }) {
  if (typeof content === 'string') {
    return <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>;
  }
  return (
    <div className="space-y-2">
      {content.map((part, idx) => {
        if (part.type === 'text') {
          return (
            <div key={idx} className="whitespace-pre-wrap text-sm leading-relaxed">
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
              className="max-w-full rounded-lg border border-white/10"
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
