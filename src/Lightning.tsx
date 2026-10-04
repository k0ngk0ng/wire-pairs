import { useEffect, useRef } from 'react';
import type { Game } from './game';
import type { Point } from './engine';
import { assetUrl } from './assets';

type Bolt = { path: Point[]; birth: number; hint: boolean };
export default function Lightning({ game, reduced }: { game: Game; reduced: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bolts = useRef<Bolt[]>([]);
  const frames = useRef<HTMLImageElement[]>([]);
  const eventId = useRef(-1);
  useEffect(() => { frames.current = Array.from({ length: 5 }, (_, i) => { const img = new Image(); img.src = assetUrl(`effects/lightning-${i + 1}.png`); return img; }); }, []);
  useEffect(() => {
    if (eventId.current === game.event.id) return;
    eventId.current = game.event.id;
    if (game.event.path) bolts.current.push({ path: game.event.path, birth: performance.now(), hint: game.event.type === 'hint' });
  }, [game.event]);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    const render = (now: number) => {
      const width = canvas.clientWidth, height = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const gap = parseFloat(getComputedStyle(canvas.parentElement!).gap) || 0;
      const cw = (width - gap * (game.level.board.cols + 1)) / (game.level.board.cols + 2);
      const ch = (height - gap * (game.level.board.rows + 1)) / (game.level.board.rows + 2);
      const position = (p: Point) => ({ x: (p.x + 1) * (cw + gap) + cw / 2, y: (p.y + 1) * (ch + gap) + ch / 2 });
      bolts.current = bolts.current.filter(b => now - b.birth < (b.hint ? 1300 : reduced ? 180 : 360));
      for (const bolt of bolts.current) {
        const age = now - bolt.birth, duration = bolt.hint ? 1300 : reduced ? 180 : 360;
        const points = bolt.path.map(position);
        ctx.globalAlpha = Math.min(1, (1 - age / duration) * 2);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.shadowColor = bolt.hint ? '#f2d68b' : '#b9d8ff'; ctx.shadowBlur = reduced ? 0 : 16;
        ctx.strokeStyle = bolt.hint ? '#f2d68b' : '#60a5ff'; ctx.lineWidth = reduced ? 3 : 7;
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        if (!bolt.hint && !reduced) {
          const texture = frames.current[Math.floor(age / 45) % 5];
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
            ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
            if (texture?.complete && texture.naturalWidth) for (let x = 0; x < length; x += 35) ctx.drawImage(texture, x, -10, Math.min(35, length - x), 20);
            ctx.restore();
          }
          for (const p of [points[0], points[points.length - 1]]) {
            const radius = 7 + age * .05;
            ctx.strokeStyle = '#d5edff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke();
            for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; ctx.fillStyle = j % 2 ? '#eebd67' : '#fff'; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * radius * 1.6, p.y + Math.sin(a) * radius * 1.6, 2, 0, Math.PI * 2); ctx.fill(); }
          }
        }
      }
      ctx.globalAlpha = 1;
      if (bolts.current.length) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [game.event, game.level.board.rows, game.level.board.cols, reduced]);
  return <canvas ref={canvasRef} className="lightning-layer" aria-hidden="true" />;
}
