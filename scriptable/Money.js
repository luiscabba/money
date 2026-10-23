// Money widget for Scriptable (money.arghtools.com).
// Home screen: small or medium. Lock screen: circular, rectangular or inline.
// Uses its own read-only token, separate from the app passcode.

const API = 'https://money.arghtools.com/api/widget?t=__TOKEN__';
const APP = 'https://money.arghtools.com';

const C = { bg1: new Color('#1A1E28'), bg2: new Color('#0B0D10'), ink: new Color('#F2F4F8'), muted: new Color('#B4BAC6'), track: new Color('#262B36'), under: new Color('#3DDC97'), over: new Color('#FF8A3D'), goal: new Color('#C38BFF') };
const peso = (n) => '₱' + Math.round(n || 0).toLocaleString('en-US');
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'money-widget.json');

async function getData() {
  try {
    const d = await new Request(API).loadJSON();
    if (d && d.today) { fm.writeString(cachePath, JSON.stringify(d)); return d; }
  } catch (e) {}
  return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null;
}

async function img(url) { try { return await new Request(url).loadImage(); } catch (e) { return null; } }

// A ring like the app's: track, then the spent arc, with Moni in the middle.
function ring(size, width, pct, color, track, face) {
  const dc = new DrawContext();
  dc.size = new Size(size, size); dc.opaque = false; dc.respectScreenScale = true;
  const r = (size - width) / 2, cx = size / 2, cy = size / 2;
  const arc = (from, to, col) => {
    const p = new Path(); const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (from + (to - from) * i / steps) * 2 * Math.PI;
      const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (i === 0) p.move(pt); else p.addLine(pt);
    }
    dc.addPath(p); dc.setStrokeColor(col); dc.setLineWidth(width); dc.strokePath();
  };
  arc(0, 1, track);
  if (pct > 0) arc(0, Math.min(1, pct), color);
  if (face) { const f = size - width * 2 - 10; dc.drawImageInRect(face, new Rect((size - f) / 2, (size - f) / 2, f, f)); }
  return dc.getImage();
}

function bar(width, height, pct, color) {
  const dc = new DrawContext();
  dc.size = new Size(width, height); dc.opaque = false; dc.respectScreenScale = true;
  const round = (w, col) => { const p = new Path(); p.addRoundedRect(new Rect(0, 0, w, height), height / 2, height / 2); dc.addPath(p); dc.setFillColor(col); dc.fillPath(); };
  round(width, C.track);
  if (pct > 0) round(Math.max(height, width * Math.min(1, pct)), color);
  return dc.getImage();
}

function text(stack, s, size, weight, color) {
  const t = stack.addText(s);
  t.font = weight === 'heavy' ? Font.heavySystemFont(size) : weight === 'bold' ? Font.boldSystemFont(size) : Font.mediumSystemFont(size);
  t.textColor = color || C.ink;
  t.lineLimit = 2;
  return t;
}

async function build(d) {
  const w = new ListWidget();
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const fam = config.widgetFamily || 'medium';
  if (!d) { w.addText('Money is offline'); return w; }
  const over = d.today.spent > d.today.limit;
  const tone = over ? C.over : C.under;

  if (fam === 'accessoryInline') { w.addText(peso(d.today.spent) + ' spent today'); return w; }

  if (fam === 'accessoryCircular') {
    const face = await img(d.moni.mono);
    w.addImage(ring(64, 6, d.today.spent / d.today.limit, Color.white(), new Color('#FFFFFF', 0.3), face));
    return w;
  }

  if (fam === 'accessoryRectangular') {
    const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
    const face = await img(d.moni.mono);
    if (face) { const i = row.addImage(face); i.imageSize = new Size(30, 30); }
    const col = row.addStack(); col.layoutVertically();
    text(col, peso(d.week.spent) + ' this week', 14, 'heavy', Color.white());
    text(col, 'of ' + peso(d.week.limit), 12, 'bold', new Color('#FFFFFF', 0.8));
    return w;
  }

  const g = new LinearGradient(); g.colors = [C.bg1, C.bg2]; g.locations = [0, 1]; g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
  const face = await img(d.moni.image);

  if (fam === 'small') {
    w.setPadding(14, 14, 14, 14);
    w.addImage(ring(74, 8, d.today.spent / d.today.limit, tone, C.track, face));
    w.addSpacer();
    text(w, peso(d.today.spent), 26, 'heavy', over ? C.over : C.ink);
    text(w, 'of ' + peso(d.today.limit) + ' today', 12, 'medium', C.muted);
    return w;
  }

  // Medium (and large falls back to it).
  w.setPadding(14, 16, 14, 16);
  const top = w.addStack(); top.centerAlignContent(); top.spacing = 10;
  if (face) { const i = top.addImage(face); i.imageSize = new Size(34, 34); }
  text(top, d.moni.line, 14, 'bold');
  w.addSpacer();
  const mid = w.addStack(); mid.bottomAlignContent();
  const l = mid.addStack(); l.layoutVertically();
  text(l, peso(d.today.spent), 28, 'heavy', over ? C.over : C.ink);
  text(l, 'of ' + peso(d.today.limit) + ' today', 12, 'medium', C.muted);
  mid.addSpacer();
  const r = mid.addStack(); r.layoutVertically();
  const wk = text(r, peso(d.week.spent), 16, 'heavy'); wk.rightAlignText();
  const wl = text(r, 'this week', 12, 'medium', C.muted); wl.rightAlignText();
  if (d.goal) {
    w.addSpacer(8);
    const gl = w.addStack();
    text(gl, d.goal.name, 11, 'bold');
    gl.addSpacer();
    text(gl, peso(d.goal.saved) + ' of ' + peso(d.goal.price), 11, 'bold', C.muted);
    w.addSpacer(5);
    w.addImage(bar(300, 6, d.goal.pct / 100, C.goal));
  }
  return w;
}

const data = await getData();
const widget = await build(data);
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
