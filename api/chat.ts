// Minimal Vercel Serverless Function to proxy chat requests to OpenAI
// Uses Node runtime to access environment variables securely

export default async function handler(req: any, res: any) {
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
		const messages = parsed?.messages;
		if (!Array.isArray(messages)) {
			res.status(400).json({ error: 'Invalid payload: messages must be an array' });
			return;
		}

		// Prepend a system prompt to shape the assistant persona
		const systemPrompt =
			'Ты — самый умный и доброжелательный учитель. Объясняй простыми словами, шаг за шагом, '
			+ 'приводи понятные примеры, проверяй понимание, предлагай наводящие вопросы и краткие выводы.';

		const openAiResponse = await fetch('https://api.deepseek.com/chat/completions', {
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
				// temperature slightly lower for educational clarity
				temperature: 0.7
			})
		});

		if (!openAiResponse.ok) {
			const errorText = await openAiResponse.text();
			res.status(openAiResponse.status).json({ error: 'DeepSeek error', detail: errorText });
			return;
		}

		const data = await openAiResponse.json();
		const content = data?.choices?.[0]?.message?.content ?? '';
		res.status(200).json({ content });
	} catch (error: any) {
		console.error('[api/chat] Unhandled error:', error);
		res.status(500).json({ error: 'Internal error', detail: String(error?.message || error) });
	}
}

async function safeReadBody(req: any): Promise<any> {
	if (req && typeof req.body === 'object' && req.body !== null) {
		return req.body;
	}
	try {
		return await readJsonBody(req);
	} catch {
		return {};
	}
}

async function readJsonBody(req: any): Promise<any> {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk: string) => {
			body += chunk;
		});
		req.on('end', () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch (e) {
				reject(e);
			}
		});
		req.on('error', (err: any) => reject(err));
	});
}


