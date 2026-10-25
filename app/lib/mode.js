// Moni picks its own mood from the money and the clock. The same answer on the phone and in Moni's prompt.
import { manilaNow, streakUnder, peso } from './money';
import { safeToSpend } from './safe';

export const MODES = {
  chill: { name: 'Chill', face: 'idle', colors: null, color: '#8FA6FF', glow: 'rgba(91,124,255,0.22)', tone: 'Chill: plain, friendly and short.' },
  hyped: { name: 'Hyped', face: 'content', colors: ['#FFD166', '#3DDC97'], color: '#3DDC97', glow: 'rgba(61,220,151,0.22)', tone: 'Hyped: he is doing well. Open with one upbeat, playful line about it, then the answer. Celebrate, never gush.' },
  sideeye: { name: 'Side-eye', face: 'conf', colors: ['#FF8A3D', '#FFD166'], color: '#FF8A3D', glow: 'rgba(255,138,61,0.22)', tone: 'Side-eye: he is over for today. Tease lightly about it in a few words (dry, never mean, never shaming), then be useful: what tomorrow looks like or how to win it back.' },
  sleepy: { name: 'Sleepy', face: 'sleep', colors: ['#2B4BB8', '#5B3FD1'], color: '#8FA6FF', glow: 'rgba(43,75,184,0.3)', tone: 'Sleepy: it is late at night. Keep it very short and calm. For a purchase he is weighing now, gently suggest sleeping on it.' }
};

export function moniMode(data, hour) {
  const h = hour !== undefined ? hour : Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24;
  const pick = (key, status) => ({ key, status, ...MODES[key] });
  if (h >= 23 || h < 6) return pick('sleepy', 'Up late');
  if (!data) return pick('chill', '');
  const now = manilaNow();
  let s = null;
  try { s = safeToSpend(data, now); } catch (e) {}
  if (s && s.safe < 0) return pick('sideeye', peso(-s.safe) + ' over today');
  const funded = data.goalPlan && data.goalPlan.goals.find((g) => g.status === 'funded');
  if (funded) return pick('hyped', funded.name + ' is funded');
  let streak = 0;
  try { streak = streakUnder(data, now); } catch (e) {}
  if (streak >= 3) return pick('hyped', streak + ' days under budget');
  return pick('chill', s ? peso(s.safe) + ' safe today' : '');
}
