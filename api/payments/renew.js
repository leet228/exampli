// Disabled after migration to Telegram Stars (no card auto-renew)
export default async function handler(req, res) {
    try {
        if (req.method === 'OPTIONS') {
            res.setHeader('Allow', 'GET, OPTIONS');
            res.status(204).end();
            return;
        }
        res.status(410).json({ error: 'gone', message: 'Auto-renew is not supported with Telegram Stars' });
    } catch (e) {
        res.status(500).json({ error: 'internal_error' });
    }
}