export default function HeroCard({ name }: { name: string }) {
  return (
    <div className="card fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold mb-0.5">Привет, {name} 👋</div>
          <div className="text-sm text-muted">Готовимся к ОГЭ и ЕГЭ — как в Duolingo, только по-нашему.</div>
        </div>
        <div className="hidden sm:block text-5xl select-none">🧠</div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="badge">🔥 Стрик: 0</span>
        <span className="badge">⭐ XP: 0</span>
      </div>
    </div>
  );
}