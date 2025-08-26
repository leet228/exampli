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

        const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY on the server' });
            return;
        }

        const parsed = await safeReadBody(req);
        const messages = parsed && Array.isArray(parsed.messages) ? parsed.messages : null;
        if (!messages) {
            res.status(400).json({ error: 'Invalid payload: messages must be an array' });
            return;
        }

        const systemPrompt =
            'Ты — самый умный и доброжелательный учитель. Объясняй простыми словами, шаг за шагом, ' +
            'приводи понятные примеры, проверяй понимание, предлагай наводящие вопросы и краткие выводы.';

        // If there are image data URLs, try to upload them to a public URL (Supabase Storage)
        const withExternalImages = await ensureExternalImageUrls(messages);

        // Choose model: if images present, prefer a vision-capable model if provided
        const hasImages = withExternalImages.some((m) => Array.isArray(m.content) && m.content.some((p) => p && p.type === 'image_url'));
        const model = process.env.DEEPSEEK_MODEL || (hasImages ? 'deepseek-vl' : 'deepseek-chat');

        const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...withExternalImages
                ],
                temperature: 0.7
            })
        });

        if (!dsResponse.ok) {
            const errorText = await safeText(dsResponse);
            res.status(dsResponse.status).json({ error: 'DeepSeek error', detail: errorText });
            return;
        }

        const data = await dsResponse.json();
        const content = data && data.choices && data.choices[0] && data.choices[0].message ?
            data.choices[0].message.content :
            '';
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

async function ensureExternalImageUrls(messages) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    const canUpload = Boolean(supabaseUrl && supabaseKey);
    const supabase = canUpload ? createClient(supabaseUrl, supabaseKey) : null;

    const results = [];
    for (const m of messages) {
        if (typeof m.content === 'string') {
            results.push(m);
            continue;
        }
        if (!Array.isArray(m.content)) {
            results.push({ role: m.role, content: '' });
            continue;
        }
        const parts = [];
        for (const part of m.content) {
            if (part && part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
                const url = part.image_url.url;
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
                                parts.push({ type: 'image_url', image_url: { url: pub.publicUrl } });
                                continue;
                            }
                        }
                    } catch (e) {
                        // fall back below
                    }
                    // fallback to text marker if upload failed
                    parts.push({ type: 'text', text: '[Изображение: недоступно по URL]' });
                } else {
                    parts.push(part);
                }
            } else if (part && part.type === 'text' && typeof part.text === 'string') {
                parts.push(part);
            }
        }
        results.push({ role: m.role, content: parts.length ? parts : '' });
    }
    return results;
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