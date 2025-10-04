// Deprecated endpoint after migration to Telegram Stars
export default async function handler(req, res) {
    try {
        if (req.method === 'OPTIONS') {
            res.setHeader('Allow', 'GET, OPTIONS');
            res.status(204).end();
            return;
        }
        res.status(410).json({ error: 'gone', message: 'Status polling is not used with Telegram Stars' });
    } catch (e) {
        res.status(500).json({ error: 'internal_error' });
    }
}