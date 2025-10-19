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
    plotlyComponentPromise = Promise.all([
      // @ts-ignore — модуль существует, типы задаём через d.ts
      import('react-plotly.js/factory'),
      // @ts-ignore — модуль существует, типы задаём через d.ts
      import('plotly.js-dist-min'),
    ]).then(([factoryMod, plotlyMod]) => {
      const factory = (factoryMod as any).default || (factoryMod as any);
      const Plotly = (plotlyMod as any).default || (plotlyMod as any);
      return factory(Plotly);
    });
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
      {content}
    </ReactMarkdown>
  );
}


