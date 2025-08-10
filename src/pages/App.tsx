import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function App() {
  const nav = useNavigate();
  const [tgUser, setTgUser] = useState<any>(null);

  // Читаем Telegram initDataUnsafe
  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    tg?.expand?.();
    tg?.ready?.();

    const user = tg?.initDataUnsafe?.user;
    setTgUser(user);

    // Тема Telegram → CSS vars (минимальная поддержка)
    const p = tg?.themeParams || {};
    if (p) {
      const root = document.documentElement;
      if (p.bg_color) root.style.setProperty('--bg', `#${p.bg_color}`);
      if (p.text_color) root.style.setProperty('--text', `#${p.text_color}`);
      if (p.button_color) root.style.setProperty('--accent', `#${p.button_color}`);
    }
  }, []);

  // Сохраняем пользователя в БД (idempotent)
  useEffect(() => {
    if (!tgUser) return;
    (async () => {
      const { id, username, first_name, last_name } = tgUser;
      // upsert по tg_id
      await supabase.from('users').upsert({
        tg_id: String(id),
        username,
        first_name,
        last_name,
      }, { onConflict: 'tg_id' });
    })();
  }, [tgUser]);

  const displayName = useMemo(() => {
    if (!tgUser) return 'гость';
    return tgUser.first_name || tgUser.username || 'друг';
  }, [tgUser]);

  return (
    <div className="min-h-screen p-5">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">exampli</h1>
        <Link to="/profile" className="btn-outline">Профиль</Link>
      </header>

      <div className="card mb-6">
        <h2 className="text-xl font-semibold mb-1">Привет, {displayName} 👋</h2>
        <p className="text-sm text-[color:var(--muted)]">Готовимся к ОГЭ и ЕГЭ в формате дуолинго.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <motion.button whileTap={{ scale: 0.98 }} className="btn w-full" onClick={() => nav('/onboarding')}>
          Начать курс
        </motion.button>

        <button className="btn-outline w-full">Лидерборд (скоро)</button>
        <button className="btn-outline w-full">Настройки (скоро)</button>
      </div>
    </div>
  );
}