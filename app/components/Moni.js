'use client';
// Moni, the chat's face: floats and blinks when idle, wobbles and looks around while thinking, bounces once when done.
export default function Moni({ size = 36, state = 'idle', label }) {
  const eye = { w: Math.max(3, Math.round(size * 0.115)), h: Math.max(5, Math.round(size * 0.185)) };
  return (
    <span className={'moni ' + state} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} style={{ width: size, height: size, flexShrink: 0, display: 'inline-block' }}>
      <span className="moni-body" style={{ width: size, height: size, boxShadow: size > 60 ? '0 18px 50px rgba(122,61,214,0.55)' : '0 4px 14px rgba(122,61,214,0.45)' }}>
        <span className="moni-look" style={{ gap: Math.round(size * 0.18), marginTop: -Math.round(size * 0.05) }}>
          <span className="moni-eye" style={{ width: eye.w, height: eye.h, borderRadius: eye.w / 2 }} />
          <span className="moni-eye" style={{ width: eye.w, height: eye.h, borderRadius: eye.w / 2 }} />
        </span>
      </span>
    </span>
  );
}
