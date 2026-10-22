'use client';
// Segmented control with a sliding thumb.
export default function Seg({ options, value, onChange, label, minWidth = 64, stretch = false }) {
  const i = Math.max(0, options.findIndex(([k]) => k === value));
  const n = options.length;
  return (
    <div role="group" aria-label={label} className="glass" style={{ position: 'relative', display: 'flex', padding: 3, borderRadius: 22, flex: stretch ? 1 : undefined }}>
      <span className="thumb" aria-hidden="true" style={{ width: `calc((100% - 6px) / ${n})`, transform: `translateX(${i * 100}%)` }} />
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={k === value}
          style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 38, minWidth, border: 0, borderRadius: 19, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: k === value ? 'var(--bg)' : 'var(--ink)', transition: 'color 0.25s ease' }}>{l}</button>
      ))}
    </div>
  );
}
