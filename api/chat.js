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

        // Upload data-URL images to public URLs (Supabase) and FLATTEN content to pure text
        // Also collect per-message image URLs for optional Vision pre-processing
        const { textOnlyMessages, hasAnyImageUrl, imagesByIndex } = await flattenMessagesWithPublicImageUrls(messages);

        // Optional: if images exist and OPENAI_API_KEY present, run a Vision pre-pass to summarize images
        const openAiKey = process.env.OPENAI_API_KEY;
        if (hasAnyImageUrl && openAiKey) {
            try {
                const targetIdx = findLastUserWithImages(imagesByIndex);
                if (targetIdx !== -1) {
                    const visionSummary = await summarizeImagesWithOpenAI({
                        openAiKey,
                        text: extractPlainTextFromMessage(messages[targetIdx]),
                        imageUrls: imagesByIndex[targetIdx] || []
                    });
                    if (visionSummary) {
                        const merged = [extractPlainTextFromMessage(messages[targetIdx]), `Описание изображения: ${visionSummary}`]
                            .filter(Boolean)
                            .join('\n\n');
                        textOnlyMessages[targetIdx] = { role: 'user', content: merged };
                    }
                }
            } catch (e) {
                console.error('[api/chat] Vision pre-pass failed:', e);
            }
        }

        // Use DeepSeek-V3.1 by default; can override via DEEPSEEK_MODEL
        // If you have a specific vision-capable variant, set DEEPSEEK_MODEL accordingly
        const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

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
                    ...textOnlyMessages
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
                if (url) {
                    imageUrls.push(url);
                    hasAnyImageUrl = true;
                }
            }
        }
        const textJoined = textParts.filter(Boolean).join('\n').trim();
        const imageLines = imageUrls.map((u) => `Image: ${u}`).join('\n');
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

function decodeDataUrl(dataUrl) {
    const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    const ext = mime.split('/')[1] || 'png';
    return { mime, buffer, ext };
}