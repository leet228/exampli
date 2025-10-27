import React from 'react';

export default function Battle() {
  return (
    <div
      className="h-full"
      style={{
        display: 'grid',
        alignItems: 'start',
        justifyItems: 'center',
        paddingTop: 'calc(env(safe-area-inset-top) + 12px)'
      }}
    >
      <img
        src="/battle/battle_soon_pic.svg"
        alt="Battle soon"
        style={{
          width: '100vw',
          height: 'calc(100vh - max(env(safe-area-inset-bottom), 92px) - 12px)',
          objectFit: 'contain',
          pointerEvents: 'none'
        }}
        draggable={false}
      />
    </div>
  );
}
