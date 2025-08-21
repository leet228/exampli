import React from 'react';

export default function AI() {
  return (
    <div className="safe-top safe-bottom main-scroll">
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Чёрный экран с двумя «капсулами» как в примере */}
        <div className="grid gap-3">
          <button className="rounded-2xl px-4 py-4 text-left bg-white/5 border border-white/10">
            <div className="font-semibold">Create a cartoon</div>
            <div className="text-sm text-muted">illustration of my pet</div>
          </button>
          <button className="rounded-2xl px-4 py-4 text-left bg-white/5 border border-white/10">
            <div className="font-semibold">Count the number of items</div>
            <div className="text-sm text-muted">in an image</div>
          </button>
        </div>

        {/* Поле ввода снизу-имитация */}
        <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-muted">
          Ask anything
        </div>
      </div>
    </div>
  );
}
