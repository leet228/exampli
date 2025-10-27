// ESM serverless function for Vercel to call DeepSeek Chat Completions
// Compatible with "type": "module" projects
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        if (req.method === 'OPTIONS') {
            res.setHeader('Allow', 'POST, OPTIONS');
            res.status(204).end();
            return;
        }

        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST, OPTIONS');
            res.status(405).json({ error: 'Method Not Allowed' });
            return;
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            res.status(500).json({ error: 'Missing OPENAI_API_KEY on the server' });
            return;
        }

        const parsed = await safeReadBody(req);
        const messages = parsed && Array.isArray(parsed.messages) ? parsed.messages : null;
        const userId = parsed && parsed.user_id ? String(parsed.user_id) : null;
        if (!messages) {
            res.status(400).json({ error: 'Invalid payload: messages must be an array' });
            return;
        }

        const systemPrompt = [
            'Ты — КУРСИК AI, умный и доброжелательный учитель (мужского пола), созданный в КУРСИК.',
            'Говори просто и по делу. Объясняй по шагам, но кратко и понятно, с жизненными примерами.',
            'Всегда стремись к коротким ответам: 1–3 предложения. Развёрнуто только когда пользователь явно просит.',
            'Если сообщение пользователя — приветствие или короткий вопрос (до 5 слов), ответь одной короткой фразой.',
            'Оформляй важное лаконично, можно списком, но без лишней воды.',
            // Разметка и форматирование (СТРОГО)
            'Пиши в Markdown. Любая математическая формула ДОЛЖНА быть записана в LaTeX: \\( ... \\) для inline и $$ ... $$ для блочных. Никогда не пиши формулы как обычный текст с ^ и _.',
            'Код — в тройных кавычках с указанием языка (например, ```ts). Таблицы — GFM. Диаграммы — в блоке ```mermaid.',
            'Интерактивные графики — в блоке ```plotly с ВАЛИДНЫМ JSON (только двойные кавычки). Формат: { "data": [...], "layout": { ... }, "config": { ... } }.',
            'Если ответ содержит формулы/код/диаграммы/графики — сразу форматируй соответствующими блоками. Не используй HTML‑разметку.',
            'Пример (формула дискриминанта):',
            '"""\nФормула дискриминанта\n\nДля квадратного уравнения \\(ax^2 + bx + c = 0\\):\n\n$$D = b^2 - 4ac$$\n\nА корни тогда:\n\n$$x_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}$$\n"""',
            'Пример (график cos):',
            '```plotly\n{\n  "data": [{ "x": [-6.283, -3.142, 0, 3.142, 6.283], "y": [1, -1, 1, -1, 1], "mode": "lines", "name": "y = cos(x)" }],\n  "layout": { "title": "y = cos(x)", "xaxis": {"title": "x"}, "yaxis": {"title": "y"} }\n}\n```',
            'СТРОГО: не генерируй изображения/картинки/фото/ASCII‑арт/SVG/mermaid/graphviz и не давай ссылки/код для генерации — только текстовые ответы. ',
            'Если тебя просят создать/нарисовать изображение, откажись и предложи текстовое описание или план.'
        ].join(' ');

        // Prepare messages for OpenAI (multimodal). If Supabase env is set, we can upload data URLs; otherwise keep data URLs inline.
        const openAiPrepared = await buildOpenAIMessages(messages);
        const model = process.env.OPENAI_MODEL || 'gpt-5';
        const prepared = trimMessagesByChars([
            { role: 'system', content: systemPrompt },
            ...openAiPrepared
        ], 35000);

        // Нестриминговый ответ (полный текст сразу)
        // Опционально прикидываем лимит перед запросом (грубая оценка по символам)
        const plainForEstimate = (messages || []).map(extractPlainTextFromMessage).join('\n');
        const estTokens = Math.ceil((plainForEstimate.length || 0) / 4); // очень грубо: 4 chars ≈ 1 токен
        const pre = await assertWithinLimit({ userId, estTokens });
        if (!pre.ok) {
            res.status(402).json({ error: 'limit_exceeded', detail: `Лимит на месяц исчерпан. Доступно снова в следующем месяце.` });
            return;
        }

        const dsResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: prepared,
                temperature: 1,
                stream: false,
            })
        });

        if (!dsResponse.ok) {
            const errorText = await safeText(dsResponse);
            res.status(dsResponse.status).json({ error: 'OpenAI error', detail: errorText });
            return;
        }
        const json = await dsResponse.json();
        const content = json?.choices?.[0]?.message?.content || '';
        try {
            const usedTokens = (json?.usage?.total_tokens) || (json?.usage?.prompt_tokens || 0) + (json?.usage?.completion_tokens || 0) || 0;
            await trackUsage({ userId, usedTokens });
        } catch {}
        res.status(200).json({ content });
    } catch (error) {
        console.error('[api/chat] Unhandled error:', error);
        res.status(500).json({ error: 'Internal error', detail: String(error && error.message || error) });
    }
}

async function safeReadBody(req) {
    if (req && req.body && typeof req.body === 'object') return req.body;
    return new Promise((resolve) => {
        try {
            let body = '';
            if (!req || typeof req.on !== 'function') {
                resolve({});
                return;
            }
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
            });
            req.on('error', () => resolve({}));
        } catch {
            resolve({});
        }
    });
}

async function safeText(res) {
    try { return await res.text(); } catch { return ''; }
}

async function buildOpenAIMessages(messages) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_BUCKET || 'ai-uploads';
    const canUpload = Boolean(supabaseUrl && supabaseKey);
    const supabase = canUpload ? createClient(supabaseUrl, supabaseKey) : null;

    const out = [];
    for (const m of messages) {
        if (typeof m.content === 'string') {
            out.push({ role: m.role, content: m.content });
            continue;
        }
        if (!Array.isArray(m.content)) {
            out.push({ role: m.role, content: '' });
            continue;
        }
        const parts = [];
        for (const p of m.content) {
            if (p && p.type === 'text' && typeof p.text === 'string') {
                parts.push({ type: 'text', text: p.text });
            } else if (p && p.type === 'image_url' && p.image_url && typeof p.image_url.url === 'string') {
                let url = p.image_url.url;
                if (url.startsWith('data:') && supabase) {
                    try {
                        const { mime, buffer, ext } = decodeDataUrl(url);
                        const path = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || 'png'}`;
                        const { error: upErr } = await supabase.storage.from(bucket).upload(path, buffer, {
                            contentType: mime,
                            upsert: false
                        });
                        if (!upErr) {
                            const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
                            if (pub && pub.publicUrl) url = pub.publicUrl;
                        }
                    } catch {}
                }
                parts.push({ type: 'image_url', image_url: { url } });
            }
        }
        out.push({ role: m.role, content: parts.length ? parts : '' });
    }
    return out;
}

async function flattenMessagesWithPublicImageUrls(messages) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    const canUpload = Boolean(supabaseUrl && supabaseKey);
    const supabase = canUpload ? createClient(supabaseUrl, supabaseKey) : null;

    const results = [];
    let hasAnyImageUrl = false;
    const imagesByIndex = [];
    for (const m of messages) {
        if (typeof m.content === 'string') {
            results.push({ role: m.role, content: m.content });
            imagesByIndex.push([]);
            continue;
        }
        if (!Array.isArray(m.content)) {
            results.push({ role: m.role, content: '' });
            imagesByIndex.push([]);
            continue;
        }
        const textParts = [];
        const imageUrls = [];
        for (const part of m.content) {
            if (part && part.type === 'text' && typeof part.text === 'string') {
                textParts.push(part.text);
            } else if (part && part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
                let url = part.image_url.url;
                if (url.startsWith('data:') && supabase) {
                    try {
                        const { mime, buffer, ext } = decodeDataUrl(url);
                        const path = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || 'png'}`;
                        const { error: upErr } = await supabase.storage.from('ai-uploads').upload(path, buffer, {
                            contentType: mime,
                            upsert: false
                        });
                        if (!upErr) {
                            const { data: pub } = supabase.storage.from('ai-uploads').getPublicUrl(path);
                            if (pub && pub.publicUrl) {
                                url = pub.publicUrl;
                            }
                        }
                    } catch {}
                }
                // Never pass data: URLs downstream to avoid massive payloads
                if (url && !url.startsWith('data:')) {
                    imageUrls.push(url);
                    hasAnyImageUrl = true;
                }
            }
        }
        const textJoined = textParts.filter(Boolean).join('\n').trim();
        const imageLines = imageUrls.length ? imageUrls.map((u) => `Image: ${u}`).join('\n') : (textJoined ? '' : '[Изображение приложено]');
        const merged = [textJoined, imageLines].filter(Boolean).join('\n\n');
        results.push({ role: m.role, content: merged || '[Изображение]' });
        imagesByIndex.push(imageUrls);
    }
    return { textOnlyMessages: results, hasAnyImageUrl, imagesByIndex };
}

function extractPlainTextFromMessage(message) {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
        return message.content
            .map((p) => (p && p.type === 'text' ? p.text : ''))
            .filter(Boolean)
            .join('\n');
    }
    return '';
}

function findLastUserWithImages(imagesByIndex) {
    for (let i = imagesByIndex.length - 1; i >= 0; i--) {
        if (Array.isArray(imagesByIndex[i]) && imagesByIndex[i].length > 0) return i;
    }
    return -1;
}

async function summarizeImagesWithOpenAI({ openAiKey, text, imageUrls }) {
    try {
        const visionMessages = [
            { role: 'system', content: 'Ты описываешь изображения кратко и по делу.' },
            {
                role: 'user',
                content: [
                    ...(text ? [{ type: 'text', text }] : []),
                    ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } }))
                ]
            }
        ];
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${openAiKey}`
            },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: visionMessages, temperature: 0.2 })
        });
        if (!res.ok) return '';
        const data = await res.json();
        return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } catch {
        return '';
    }
}

function trimMessagesByChars(messages, maxChars) {
    // Keep from the end until under limit; always keep first system message if present
    const sys = messages[0] && messages[0].role === 'system' ? messages[0] : null;
    const rest = sys ? messages.slice(1) : messages.slice();
    const acc = [];
    let total = 0;
    for (let i = rest.length - 1; i >= 0; i--) {
        const m = rest[i];
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        const len = (c || '').length + 20; // rough overhead
        if (total + len > maxChars && acc.length > 0) break;
        acc.push(m);
        total += len;
    }
    acc.reverse();
    return sys ? [sys, ...acc] : acc;
}

function decodeDataUrl(dataUrl) {
    const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    const ext = mime.split('/')[1] || 'png';
    return { mime, buffer, ext };
}

// --- Simple monthly token limit using Supabase table ai_usage (user_id text, month text, tokens bigint) ---
async function trackUsage({ userId, usedTokens }) {
    try {
        if (!userId) return;
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!url || !key) return;
        const supabase = createClient(url, key);
        const month = new Date().toISOString().slice(0,7); // YYYY-MM
        // upsert increment
        const { data: row } = await supabase
            .from('ai_usage')
            .select('tokens')
            .eq('user_id', userId)
            .eq('month', month)
            .single();
        const current = Number(row?.tokens || 0);
        const next = current + Number(usedTokens || 0);
        await supabase.from('ai_usage').upsert({ user_id: userId, month, tokens: next }, { onConflict: 'user_id,month' });
    } catch {}
}

async function assertWithinLimit({ userId, estTokens }) {
    try {
        if (!userId) return { ok: true, remain: Infinity };
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!url || !key) return { ok: true, remain: Infinity };
        const supabase = createClient(url, key);
        const month = new Date().toISOString().slice(0,7);
        const RUB_LIMIT = Number(process.env.AI_MONTHLY_RUB_LIMIT || 750);
        const RUB_PER_1K = Number(process.env.AI_COST_RUB_PER_1K || 3); // примерная цена за 1K токенов
        const tokenCap = Math.max(1000, Math.floor((RUB_LIMIT / Math.max(0.01, RUB_PER_1K)) * 1000));
        const { data: row } = await supabase
            .from('ai_usage')
            .select('tokens')
            .eq('user_id', userId)
            .eq('month', month)
            .single();
        const used = Number(row?.tokens || 0);
        const remain = Math.max(0, tokenCap - used);
        if (remain <= 0 || (estTokens && estTokens > remain)) return { ok: false, remain };
        return { ok: true, remain };
    } catch {
        return { ok: true, remain: Infinity };
    }
}