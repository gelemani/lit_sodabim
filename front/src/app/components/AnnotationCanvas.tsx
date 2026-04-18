"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";

interface Point { x: number; y: number }
interface Stroke { points: Point[]; color: string; width: number }

interface Props {
  active: boolean;
  onSave: (svg: string) => void;
  onCancel: () => void;
}

function strokesToSvg(strokes: Stroke[], w: number, h: number): string {
  const paths = strokes.map(({ points, color, width }) => {
    if (points.length < 2) return "";
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${paths}</svg>`;
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];

export default function AnnotationCanvas({ active, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const currentStroke = useRef<Point[]>([]);

  // Redraw all strokes
  const redraw = useCallback((allStrokes: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      stroke.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  }, []);

  // Fit canvas to parent size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const { width, height } = canvas.parentElement!.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      redraw(strokes);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [strokes, redraw]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true);
    currentStroke.current = [getPos(e)];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !active) return;
    const pos = getPos(e);
    currentStroke.current.push(pos);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const pts = currentStroke.current;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  };

  const onPointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.current.length > 1) {
      const newStroke: Stroke = { points: [...currentStroke.current], color, width: strokeWidth };
      setStrokes(prev => {
        const next = [...prev, newStroke];
        redraw(next);
        return next;
      });
    }
    currentStroke.current = [];
  };

  const undo = () => setStrokes(prev => { const next = prev.slice(0, -1); redraw(next); return next; });
  const clear = () => { setStrokes([]); redraw([]); };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) { onCancel(); return; }
    onSave(strokesToSvg(strokes, canvas.width, canvas.height));
  };

  if (!active) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "all" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* Toolbar */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 8,
        background: "#1a1d24cc", backdropFilter: "blur(8px)",
        padding: "8px 16px", borderRadius: 10,
        border: "1px solid #374151", boxShadow: "0 4px 24px rgba(0,0,0,0.5)"
      }}>
        <span style={{ color: "#94a3b8", fontSize: 12, marginRight: 4 }}>Цвет:</span>
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} style={{
            width: 20, height: 20, borderRadius: "50%", background: c, border: color === c ? "2px solid white" : "2px solid transparent",
            cursor: "pointer", padding: 0
          }} />
        ))}
        <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: 8 }}>Толщина:</span>
        <input type="range" min={1} max={12} value={strokeWidth}
          onChange={e => setStrokeWidth(Number(e.target.value))}
          style={{ width: 60, accentColor: color }} />
        <button onClick={undo} disabled={strokes.length === 0} style={{
          background: "#374151", color: "#e2e8f0", border: "none", borderRadius: 6,
          padding: "4px 10px", cursor: "pointer", fontSize: 12, opacity: strokes.length === 0 ? 0.4 : 1
        }}>↩ Отменить</button>
        <button onClick={clear} disabled={strokes.length === 0} style={{
          background: "#374151", color: "#e2e8f0", border: "none", borderRadius: 6,
          padding: "4px 10px", cursor: "pointer", fontSize: 12, opacity: strokes.length === 0 ? 0.4 : 1
        }}>Очистить</button>
        <button onClick={handleSave} style={{
          background: "#22c55e", color: "#fff", border: "none", borderRadius: 6,
          padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600
        }}>Сохранить эскиз</button>
        <button onClick={onCancel} style={{
          background: "#6b7280", color: "#fff", border: "none", borderRadius: 6,
          padding: "4px 10px", cursor: "pointer", fontSize: 12
        }}>Отменить</button>
      </div>
    </div>
  );
}
