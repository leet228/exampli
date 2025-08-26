// CommonJS serverless function for Vercel to call DeepSeek Chat Completions
// Avoids ESM/CJS interop issues in server environment

/** @type {(req: any, res: any) => Promise<void>} */
module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
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

        const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages
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
};

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