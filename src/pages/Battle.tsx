import React from 'react';

export default function Battle() {
  return (
    <div className="safe-top safe-bottom main-scroll">
      {/* Фон в духе CR: плитка + синий */}
      <div className="min-h-[30vh]" style={{
        background: 'linear-gradient(180deg,#0ea5e9 0%, #0b5fa7 60%)'
      }} />

      <div className="max-w-xl mx-auto px-4 -mt-16 pb-6 grid gap-4">
        {/* Большая карточка-баннер */}
        <div className="card h-28 flex items-center justify-center font-bold text-xl">
          Баннер события (заглушка)
        </div>

        {/* Три быстрых action-кнопки */}
        <div className="grid grid-cols-3 gap-3">
          <button className="card h-16 font-semibold">🎁 Подарок</button>
          <button className="card h-16 font-semibold">👤 Профиль</button>
          <button className="card h-16 font-semibold">📜 Задания</button>
        </div>

        {/* Большая кнопка «В бой» */}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn h-14 text-lg">В бой</button>
          <button className="card h-14 font-semibold">Трофеи</button>
        </div>

        {/* Нижняя панель с табами (визуал-элементы) */}
        <div className="card h-16 flex items-center justify-around">
          <div>💰</div>
          <div>🃏</div>
          <div>⚔️</div>
          <div>👥</div>
          <div>🏅</div>
        </div>
      </div>
    </div>
  );
}
