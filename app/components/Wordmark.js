// "moni" in heavy lowercase with a green dot over the i. Size is the cap height in px of the font.
export default function Wordmark({ size = 40, as: Tag = 'span', style }) {
  return (
    <Tag style={{ margin: 0, fontSize: size, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--ink)', ...style }}>
      <span aria-hidden="true">mon<span style={{ display: 'inline-block', marginLeft: '0.05em' }}><span className="wm-dot" style={{ display: 'block', width: '0.17em', height: '0.17em', borderRadius: '50%', background: 'var(--under)', margin: '0 auto 0.06em' }} /><span style={{ display: 'block', width: '0.15em', height: '0.53em', borderRadius: '0.03em', background: 'currentColor' }} /></span></span>
      <span className="sr">Moni</span>
    </Tag>
  );
}
