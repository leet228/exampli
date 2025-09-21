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
        // Рендерим mermaid, если язык блока — mermaid
        code(props: any) {
          const { inline, className: cls, children, ...rest } = props || {};
          const txt = String(children || '');
          const match = /language-(\w+)/.exec(cls || '');
          const lang = match ? match[1].toLowerCase() : '';
          if (!inline && lang === 'mermaid') {
            return <MermaidBlock code={txt} />;
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


