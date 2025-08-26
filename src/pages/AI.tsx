import React from 'react';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
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
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // автопрокрутка вниз при новых сообщениях
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isLoading]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setError(null);

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
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
          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 bg-transparent outline-none text-[var(--text)] placeholder-[var(--muted)] text-sm resize-none max-h-40"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Спроси меня о чём угодно... (Enter — отправить, Shift+Enter — перенос)"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
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
        <RichText text={content} />
      </div>
    </div>
  );
}

function RichText({ text }: { text: string }) {
  // простая разбивка по строкам; можно улучшить на Markdown позже
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {text}
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
