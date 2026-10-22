export default function Ring({ size = 36, r = 14, width = 4.5, pct = 0, color = '#3DDC97', track = 'rgba(255,255,255,0.12)', full = false, dashed = false, label, box: boxIn, delay = 0, burst = false, children }) {
  const c = 2 * Math.PI * r;
  const p = full ? 1 : Math.max(0, Math.min(pct, 1));
  const box = boxIn || (r + width) * 2 + 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        <g transform={`rotate(-90 ${box / 2} ${box / 2})`}>
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={track} strokeWidth={width} strokeDasharray={dashed ? '3 4' : undefined} />
          {p > 0 && (
            <circle className="ringfill" style={{ animationDelay: delay + 's' }} cx={box / 2} cy={box / 2} r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap={p >= 1 ? 'butt' : 'round'} strokeDasharray={`${(c * p).toFixed(2)} ${c.toFixed(2)}`} />
          )}
        </g>
        {burst && <circle className="ringburst" cx={box / 2} cy={box / 2} r={r + width / 2 + 2} fill="none" stroke={color} strokeWidth="3" />}
      </svg>
      {children && <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{children}</div>}
    </div>
  );
}
