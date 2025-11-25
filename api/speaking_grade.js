import OpenAI from 'openai';
import { File } from 'undici';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

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

    const apiKey = process.env.SPEAKING_AI || process.env.AI_GATEWAY_API_KEY || '';
    if (!apiKey) {
      res.status(500).json({ error: 'missing_env', detail: 'SPEAKING_AI env variable required' });
      return;
    }
    const baseURL = process.env.SPEAKING_AI_URL || process.env.AI_GATEWAY_URL || process.env.VERCEL_AI_GATEWAY_URL || undefined;
    const payload = await safeJson(req);
    const audioBase64 = String(payload?.audio_base64 || '').trim();
    const mimeType = String(payload?.mime_type || 'audio/webm');
    const durationMs = Number(payload?.duration_ms || 0);
    const taskText = String(payload?.task_text || '');
    if (!audioBase64) {
      res.status(400).json({ error: 'audio_required' });
      return;
    }
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (!audioBuffer || audioBuffer.length === 0) {
      res.status(400).json({ error: 'invalid_audio' });
      return;
    }
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      res.status(413).json({ error: 'audio_too_large', detail: 'Recording is too long' });
      return;
    }

    const fileName = `speaking-${Date.now()}.${mimeType.includes('mp3') ? 'mp3' : 'webm'}`;
    const audioFile = new File([audioBuffer], fileName, { type: mimeType || 'audio/webm' });

    const speechClient = new OpenAI({ apiKey, baseURL });
    const transcribeModel = process.env.SPEAKING_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
    let transcript = '';
    try {
      const transcriptResp = await speechClient.audio.transcriptions.create({
        file: audioFile,
        model: transcribeModel,
        temperature: 0.2,
      });
      transcript = String(transcriptResp?.text || '').trim();
    } catch (err) {
      console.error('[speaking_grade] transcription error', err);
      res.status(500).json({ error: 'transcription_failed' });
      return;
    }

    const evalClient = createOpenAI({ apiKey, baseURL });
    const evalModel = process.env.SPEAKING_MODEL || 'gpt-5-mini';
    const systemPrompt = [
      'Ты экзаменатор устной части ЕГЭ по английскому языку.',
      'Проверяешь запись по критериям: чтение текста без искажений, уложиться в 3 минуты, понятное произношение.',
      'Отвечай в JSON с полями {"passed": boolean, "feedback": "короткая рекомендация"}.',
      'Всегда упоминай конкретные замечания (ошибки произношения, пропуски, превышение времени).',
      'Если запись пуста, failed с объяснением.',
    ].join(' ');
    const durationSec = Math.round(Math.max(0, durationMs) / 100) / 10;
    const prompt = [
      `Текст задания:\n${taskText || '(нет текста)'}`,
      `Расшифровка ответа ученика:\n${transcript || '(пусто)'}`,
      `Время ученик: ${durationSec}s (лимит 180s).`,
      'Верни только JSON без лишнего текста.',
    ].join('\n\n');

    let evalText = '';
    try {
      const { text } = await generateText({
        model: evalClient(evalModel),
        system: systemPrompt,
        prompt,
        temperature: 0.4,
      });
      evalText = String(text || '').trim();
    } catch (err) {
      console.error('[speaking_grade] evaluation error', err);
      res.status(500).json({ error: 'evaluation_failed' });
      return;
    }

    let passed = false;
    let feedback = evalText || '';
    try {
      const parsed = JSON.parse(evalText);
      if (typeof parsed?.passed === 'boolean') passed = parsed.passed;
      if (parsed?.feedback) feedback = String(parsed.feedback);
    } catch {}

    res.status(200).json({
      passed,
      feedback,
      transcript,
    });
  } catch (err) {
    console.error('[speaking_grade] unexpected error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function safeJson(req) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    if (!chunks.length) return null;
    const raw = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

