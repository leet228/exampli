import React from 'react';

export default function Battle() {
  return (
    <div className="h-full">
      <img
        src="/battle/battle_soon_pic.svg"
        alt="Battle background"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: 0,
          bottom: 'calc(max(env(safe-area-inset-bottom), 92px))',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          zIndex: 30,
        }}
        draggable={false}
      />
    </div>
  );
}
