import React from 'react';

function Progress({ value = 0, max = 1 }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="h-3 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full bg-white/20" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Quests() {
  return (
    <div className="safe-top safe-bottom main-scroll">
      {/* Фиолетовый хиро-блок */}
      <div className="px-4 pt-4 pb-6" style={{ background: '#7c3aed' }}>
        <div className="max-w-xl mx-auto">
          <div className="text-white/90 text-sm tracking-wide uppercase">Missionen</div>
          <div className="text-white text-2xl font-extrabold mt-1">Erfülle Missionen, um Prämien zu verdienen!</div>
        </div>
      </div>

      {/* Тело */}
      <div className="max-w-xl mx-auto px-4 py-5 grid gap-6">
        {/* Блок: друзья */}
        <div>
          <div className="text-xs tracking-wide text-muted uppercase mb-3">FREUNDESMISSION</div>
          <div className="card grid gap-3">
            <div className="font-semibold">Folge deinem ersten Freund</div>
            <Progress value={0} max={1} />
            <button type="button" className="btn-outline w-full flex items-center justify-center gap-2">
              <span>👤+</span> <span>Finde einen Freund</span>
            </button>
          </div>
        </div>

        {/* Линия-разделитель как на скрине */}
        <div className="h-px bg-white/10" />

        {/* Блок: Tagesmissionen */}
        <div>
          <div className="text-xs tracking-wide text-muted uppercase mb-3">TAGESMISSIONEN</div>
          <div className="grid gap-4">
            {[{t:'Starte einen Streak', max:1},
              {t:'Erreiche in 2 Lektionen 5 in Folge', max:2},
              {t:'Lerne 5 Minuten lang', max:5}].map((m,i)=>(
              <div key={i} className="card">
                <div className="font-semibold">{m.t}</div>
                <div className="mt-3"><Progress value={0} max={m.max} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
