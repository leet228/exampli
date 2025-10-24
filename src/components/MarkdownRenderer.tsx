import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

// Lazy loader для mermaid, чтобы не тянуть его сразу
let mermaidPromise: Promise<any> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = (m as any).default || m;
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'dark' });
      } catch {}
      return mermaid;
    });
  }
  return mermaidPromise;
}

// Lazy loader для Plotly: подключаем только при наличии блока ```plotly
let plotlyComponentPromise: Promise<any> | null = null;
function loadPlotly() {
  if (!plotlyComponentPromise) {
    plotlyComponentPromise = import('react-plotly.js').then((mod) => (mod as any).default || (mod as any));
  }
  return plotlyComponentPromise;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = React.useState<string>('');
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const id = 'mmd-' + Math.random().toString(36).slice(2, 10);
        const res = await mermaid.render(id, code);
        if (!cancelled) setSvg(res?.svg || '');
      } catch {
        if (!cancelled) setSvg(`<pre class="overflow-auto">${escapeHtml(code)}</pre>`);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  return <div className="not-prose my-2" dangerouslySetInnerHTML={{ __html: svg }} />;
};

const PlotlyBlock: React.FC<{ code: string }> = ({ code }) => {
  const [Plot, setPlot] = React.useState<any>(null);
  const [parsed, setParsed] = React.useState<any>(null);
  const [error, setError] = React.useState<string>('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = JSON.parse(String(code || '').trim());
        if (!cancelled) setParsed(json);
      } catch (e: any) {
        if (!cancelled) setError('Некорректный JSON для plotly');
      }
      try {
        const Comp = await loadPlotly();
        if (!cancelled) setPlot(() => Comp);
      } catch {
        if (!cancelled) setError('Не удалось загрузить Plotly');
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <pre className="overflow-auto rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-200">
        {`${error}\n${code}`}
      </pre>
    );
  }
  if (!Plot || !parsed) {
    return <div className="text-sm text-[var(--muted)] py-2">Загрузка графика…</div>;
  }

  const data = Array.isArray(parsed.data) ? parsed.data : [];
  const layout = parsed.layout && typeof parsed.layout === 'object' ? parsed.layout : {};
  const config = parsed.config && typeof parsed.config === 'object' ? parsed.config : { responsive: true };

  return (
    <div className="not-prose my-2">
      <Plot
        data={data}
        layout={{ ...layout }}
        config={{ displaylogo: false, ...config }}
        useResizeHandler
        style={{ width: '100%', height: layout?.height ? undefined : '420px' }}
      />
    </div>
  );
};

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // Нормализуем математику: одиночные строки с \( ... \) → $$ ... $$, а также
  // случаи вида ": \( ... \)." в конце строки переносим в блочную запись ниже
  const normalized = React.useMemo(() => {
    try {
      let t = String(content || '');
      // 0) Распаковка обёрток и нормализация экранирования от моделей
      try {
        const trimmed = t.trim();
        if (/^"?content"?\s*:/i.test(trimmed)) {
          try {
            const fixed = `{"content":${trimmed.replace(/^"?content"?\s*:/i, '')}}`;
            const obj = JSON.parse(fixed);
            if (typeof obj?.content === 'string') t = String(obj.content);
          } catch {}
        }
        const s = t.trim();
        if ((s.startsWith('"""') && s.endsWith('"""')) || (s.startsWith("'''") && s.endsWith("'''"))) t = s.slice(3, -3);
        else if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\'') && s.endsWith('\''))) t = s.slice(1, -1);
        // Преобразуем \\(...), \\[...] → \(...), \[...]
        t = t
          .replace(/\\\\\(/g, '\\(')
          .replace(/\\\\\)/g, '\\)')
          .replace(/\\\\\[/g, '\\[')
          .replace(/\\\\\]/g, '\\]');
      } catch {}
      // 1) Блочные кейсы для \\( ... \\)
      t = t.replace(/^\s*\\\(([\s\S]+?)\\\)\s*$/gm, (_m, expr) => `$$${String(expr).trim()}$$`);
      // После двоеточия в конце строки стоит inline-формула → переносим в блочную
      t = t.replace(/:\s*\\\(([\s\S]+?)\\\)\s*(?:[.!?])?\s*$/gm, (_m, expr) => `:\n\n$$${String(expr).trim()}$$`);

      // 2) Глобально конвертируем \[...\] → $$...$$ и \(...\) → $...$ вне код-блоков
      const parts = t.split(/(```[\s\S]*?```)/g);
      for (let i = 0; i < parts.length; i += 1) {
        const seg = parts[i];
        if (!seg) continue;
        const isCode = seg.startsWith('```');
        if (isCode) continue;
        parts[i] = seg
          .replace(/\\\[([\s\S]+?)\\\]/g, (_m, expr) => `$$${String(expr).trim()}$$`)
          .replace(/\\\(([\s\S]+?)\\\)/g, (_m, expr) => `$${String(expr).trim()}$`);
      }
      t = parts.join('');
      return t;
    } catch {
      return content;
    }
  }, [content]);
  return (
    <ReactMarkdown
      className={className}
      // Безопасно: не допускаем сырый HTML в Markdown
      skipHtml
      // Поддержка списков/таблиц и формул
      remarkPlugins={[remarkGfm as any, remarkMath as any]}
      // Рендер KaTeX и подсветка кода
      rehypePlugins={[[rehypeKatex as any, { strict: false }], rehypeHighlight as any]}
      components={{
        // Рендерим mermaid/plotly, если язык блока соответствующий
        code(props: any) {
          const { inline, className: cls, children, ...rest } = props || {};
          const txt = String(children || '');
          const match = /language-(\w+)/.exec(cls || '');
          const lang = match ? match[1].toLowerCase() : '';
          if (!inline && lang === 'mermaid') {
            return <MermaidBlock code={txt} />;
          }
          if (!inline && lang === 'plotly') {
            return <PlotlyBlock code={txt} />;
          }
          // Авто-детект: если lang === 'json' и внутри объект с ключами data/layout — считаем это Plotly
          if (!inline && (lang === 'json' || lang === '')) {
            try {
              const obj = JSON.parse(txt);
              if (obj && (Array.isArray(obj.data) || obj.layout)) {
                return <PlotlyBlock code={txt} />;
              }
            } catch {}
          }
          return (
            <code className={cls} {...rest}>
              {children}
            </code>
          );
        },
        // Оборачиваем pre для горизонтального скролла
        pre(props: any) {
          const { children, ...rest } = props || {};
          return (
            <pre className="overflow-auto rounded-xl border border-white/10 bg-white/5" {...rest}>
              {children}
            </pre>
          );
        },
      }}
    >
      {normalized}
    </ReactMarkdown>
  );
}


