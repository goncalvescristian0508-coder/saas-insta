"use client";

import { useEffect, useRef } from "react";

/**
 * Noite Gotham: poeira/luzes suaves caindo (como neve) + silhuetas de morcego em queda lenta.
 */
export default function GothamAtmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);

    type Mote = {
      x: number;
      y: number;
      r: number;
      speed: number;
      wind: number;
      a: number;
    };

    type Bat = {
      x: number;
      y: number;
      speed: number;
      wind: number;
      size: number;
      phase: number;
      wing: number;
      a: number;
    };

    const motes: Mote[] = [];
    const bats: Bat[] = [];
    const area = width * height;
    const moteCount = Math.min(110, Math.floor(area / 9000));
    const batCount = Math.min(42, Math.floor(area / 28000));

    for (let i = 0; i < moteCount; i++) {
      motes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.8 + 0.4,
        speed: Math.random() * 0.9 + 0.35,
        wind: Math.random() * 0.6 - 0.3,
        a: Math.random() * 0.12 + 0.04,
      });
    }

    for (let i = 0; i < batCount; i++) {
      bats.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: Math.random() * 0.85 + 0.45,
        wind: Math.random() * 0.5 - 0.25,
        size: Math.random() * 10 + 7,
        phase: Math.random() * Math.PI * 2,
        wing: Math.random() * 0.08 + 0.06,
        a: Math.random() * 0.18 + 0.1,
      });
    }

    function drawBat(x: number, y: number, size: number, flap: number, alpha: number) {
      const s = size / 12;
      c.save();
      c.translate(x, y);
      c.scale(1,0.88 + Math.sin(flap) * 0.12);
      c.rotate(Math.sin(flap * 0.5) * 0.15);
      c.fillStyle = `rgba(55, 62, 82, ${alpha})`;
      c.strokeStyle = `rgba(90, 100, 128, ${alpha * 0.35})`;
      c.lineWidth = 0.35;
      c.beginPath();
      c.moveTo(0, -5 * s);
      c.bezierCurveTo(3.5 * s, -5 * s, 7 * s, -1 * s, 9 * s, 4 * s);
      c.lineTo(5.5 * s, 2.5 * s);
      c.lineTo(3.8 * s, 6 * s);
      c.lineTo(0, 3.8 * s);
      c.lineTo(-3.8 * s, 6 * s);
      c.lineTo(-5.5 * s, 2.5 * s);
      c.lineTo(-9 * s, 4 * s);
      c.bezierCurveTo(-7 * s, -1 * s, -3.5 * s, -5 * s, 0, -5 * s);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }

    let frame = 0;
    let raf: number;

    const tick = () => {
      frame++;
      c.clearRect(0, 0, width, height);

      for (const p of motes) {
        c.beginPath();
        c.fillStyle = `rgba(170, 188, 220, ${p.a})`;
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fill();

        p.y += p.speed;
        p.x += p.wind + Math.sin((frame + p.y) * 0.01) * 0.15;

        if (p.y > height + 4) {
          p.y = -4;
          p.x = Math.random() * width;
        }
        if (p.x > width + 4) p.x = -4;
        else if (p.x < -4) p.x = width + 4;
      }

      for (const b of bats) {
        b.phase += b.wing;
        drawBat(b.x, b.y, b.size, b.phase, b.a);

        b.y += b.speed;
        b.x += b.wind + Math.sin(b.phase) * 0.45;

        if (b.y > height +24) {
          b.y = -24;
          b.x = Math.random() * width;
        }
        if (b.x > width + 20) b.x = -20;
        else if (b.x < -20) b.x = width + 20;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="gotham-atmosphere-canvas"
    />
  );
}
