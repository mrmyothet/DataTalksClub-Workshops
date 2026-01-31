import React, { useEffect, useMemo, useRef, useState } from "react";

// Snake Game (React, single-file)
// - Keyboard: Arrow keys / WASD
// - Pause: Space
// - Restart: R
// Notes: Uses a fixed-timestep loop for consistent speed.

const GRID = 24; // cells per row/col
const BASE_TICK_MS = 120; // lower = faster
const SPEEDUP_PER_FOOD = 0.98;
const MIN_TICK_MS = 55;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function same(a, b) {
  return a.x === b.x && a.y === b.y;
}

function opposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function formatSpeed(mult) {
  return `${mult.toFixed(2)}×`;
}

function makeInitialSnake() {
  const start = { x: Math.floor(GRID / 2), y: Math.floor(GRID / 2) };
  return [
    { x: start.x, y: start.y },
    { x: start.x - 1, y: start.y },
    { x: start.x - 2, y: start.y },
  ];
}

function placeFood(snake) {
  // Simple retry placement. With GRID=24 this is safe.
  while (true) {
    const f = { x: randInt(0, GRID - 1), y: randInt(0, GRID - 1) };
    if (!snake.some((s) => same(s, f))) return f;
  }
}

export default function SnakeGame() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const accRef = useRef(0);

  const [snake, setSnake] = useState(() => makeInitialSnake());
  const [dir, setDir] = useState({ x: 1, y: 0 });
  const [nextDir, setNextDir] = useState({ x: 1, y: 0 });
  const [food, setFood] = useState(() => placeFood(makeInitialSnake()));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    const v = Number(localStorage.getItem("snake_best_react") || 0);
    return Number.isFinite(v) ? v : 0;
  });
  const [tickMs, setTickMs] = useState(BASE_TICK_MS);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const cellSize = useMemo(() => 480 / GRID, []);

  const dirs = useMemo(
    () => ({
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 },
      s: { x: 0, y: 1 },
      a: { x: -1, y: 0 },
      d: { x: 1, y: 0 },
      W: { x: 0, y: -1 },
      S: { x: 0, y: 1 },
      A: { x: -1, y: 0 },
      D: { x: 1, y: 0 },
    }),
    [],
  );

  const speedMult = useMemo(() => BASE_TICK_MS / tickMs, [tickMs]);

  function reset() {
    const s = makeInitialSnake();
    setSnake(s);
    setDir({ x: 1, y: 0 });
    setNextDir({ x: 1, y: 0 });
    setFood(placeFood(s));
    setScore(0);
    setTickMs(BASE_TICK_MS);
    setPaused(false);
    setGameOver(false);
    accRef.current = 0;
  }

  function endGame(finalScore) {
    setGameOver(true);
    setPaused(false);
    setBest((prev) => {
      const b = Math.max(prev, finalScore);
      localStorage.setItem("snake_best_react", String(b));
      return b;
    });
  }

  // Fixed-timestep game step. Uses functional state updates so it can run inside RAF.
  const step = () => {
    if (gameOver || paused) return;

    setSnake((prevSnake) => {
      // Apply buffered direction (prevents multi-turn per tick)
      let appliedDir = dir;
      if (!opposite(nextDir, dir)) appliedDir = nextDir;
      if (appliedDir !== dir) setDir(appliedDir);

      const head = prevSnake[0];
      const nx = head.x + appliedDir.x;
      const ny = head.y + appliedDir.y;

      // Wall collision
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
        endGame(score);
        return prevSnake;
      }

      const nextHead = { x: nx, y: ny };
      const willEat = same(nextHead, food);

      // Self collision: tail moves unless eating
      const bodyToCheck = willEat ? prevSnake : prevSnake.slice(0, -1);
      if (bodyToCheck.some((s) => same(s, nextHead))) {
        endGame(score);
        return prevSnake;
      }

      const nextSnake = [nextHead, ...prevSnake];

      if (willEat) {
        const nextScore = score + 1;
        setScore(nextScore);

        setTickMs((t) => {
          const nt = Math.max(MIN_TICK_MS, Math.floor(t * SPEEDUP_PER_FOOD));
          return nt;
        });

        // Place new food based on next snake (with growth)
        const newFood = placeFood(nextSnake);
        setFood(newFood);
        return nextSnake;
      }

      nextSnake.pop();
      return nextSnake;
    });
  };

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!gameOver) setPaused((p) => !p);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        reset();
        return;
      }
      const d = dirs[e.key];
      if (d) {
        // Buffer direction change; prevent immediate opposite turns
        if (!opposite(d, dir)) setNextDir(d);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirs, dir, gameOver]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const W = canvas.width;
    const H = canvas.height;
    const CELL = cellSize;

    const roundRect = (x, y, w, h, r) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    };

    const drawOverlay = (title, subtitle) => {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e6edf3";
      ctx.textAlign = "center";
      ctx.font = "700 40px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText(title, W / 2, H / 2 - 10);
      ctx.globalAlpha = 0.85;
      ctx.font = "500 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText(subtitle, W / 2, H / 2 + 24);
      ctx.restore();
    };

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0c1118";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#2b3a4e";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      const p = i * CELL;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(W, p);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Food glow
    const fx = food.x * CELL + CELL / 2;
    const fy = food.y * CELL + CELL / 2;
    const r = CELL * 0.32;
    const grad = ctx.createRadialGradient(fx, fy, r * 0.2, fx, fy, r * 1.6);
    grad.addColorStop(0, "rgba(255,220,120,0.95)");
    grad.addColorStop(1, "rgba(255,220,120,0.00)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,220,120,0.95)";
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();

    // Snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const x = s.x * CELL;
      const y = s.y * CELL;
      const pad = 2.2;
      const w = CELL - pad * 2;

      const t = i === 0 ? 1 : 0.65;
      ctx.fillStyle = `rgba(${Math.floor(120 * t + 40)}, ${Math.floor(
        210 * t + 30,
      )}, ${Math.floor(150 * t + 40)}, 0.95)`;
      roundRect(x + pad, y + pad, w, w, 8);
      ctx.fill();

      // Eyes for head
      if (i === 0) {
        ctx.fillStyle = "rgba(10,15,20,0.9)";
        const exShift =
          dir.x === 1 ? CELL * 0.08 : dir.x === -1 ? -CELL * 0.08 : 0;
        const eyShift =
          dir.y === 1 ? CELL * 0.1 : dir.y === -1 ? -CELL * 0.1 : 0;
        const ex1 = x + CELL * 0.35 + exShift;
        const ex2 = x + CELL * 0.65 + exShift;
        const ey = y + CELL * 0.42 + eyShift;
        ctx.beginPath();
        ctx.arc(ex1, ey, CELL * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex2, ey, CELL * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (paused && !gameOver) drawOverlay("Paused", "Press Space to resume");
    if (gameOver) drawOverlay("Game Over", "Press R to restart");
  }, [snake, food, paused, gameOver, cellSize, dir]);

  // RAF loop (fixed timestep)
  useEffect(() => {
    const loop = (ts) => {
      if (!lastRef.current) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;

      if (!paused && !gameOver) {
        accRef.current += dt;
        // Prevent spiral of death if tab was inactive
        accRef.current = clamp(accRef.current, 0, 1000);

        while (accRef.current >= tickMs) {
          step();
          accRef.current -= tickMs;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      lastRef.current = 0;
      accRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickMs, paused, gameOver, dir, nextDir, food, score]);

  return (
    <div className="min-h-screen grid place-items-center bg-[#0b0f14] text-[#e6edf3] p-4">
      <div className="w-full max-w-[520px] grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-[#202b3a] bg-white/5">
          <div className="flex flex-wrap items-baseline gap-4">
            <div>
              Score: <span className="text-xl font-bold">{score}</span>
            </div>
            <div>
              Best: <span className="text-xl font-bold">{best}</span>
            </div>
            <div>
              Speed:{" "}
              <span className="text-xl font-bold">
                {formatSpeed(speedMult)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => !gameOver && setPaused((p) => !p)}
              className="px-3 py-2 rounded-xl border border-[#2b3a4e] bg-[#111826] hover:bg-[#151f30] font-semibold"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={reset}
              className="px-3 py-2 rounded-xl border border-[#2b3a4e] bg-[#111826] hover:bg-[#151f30] font-semibold"
            >
              Restart
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#202b3a] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          <canvas
            ref={canvasRef}
            width={480}
            height={480}
            className="block w-full h-auto aspect-square bg-[#0c1118]"
          />
        </div>

        <div className="text-sm opacity-85 leading-snug px-1">
          Controls:{" "}
          <span className="px-1.5 py-0.5 rounded-lg border border-[#2b3a4e] bg-white/5 font-mono text-xs">
            Arrows
          </span>
          /{" "}
          <span className="px-1.5 py-0.5 rounded-lg border border-[#2b3a4e] bg-white/5 font-mono text-xs">
            WASD
          </span>
          , Pause{" "}
          <span className="px-1.5 py-0.5 rounded-lg border border-[#2b3a4e] bg-white/5 font-mono text-xs">
            Space
          </span>
          , Restart{" "}
          <span className="px-1.5 py-0.5 rounded-lg border border-[#2b3a4e] bg-white/5 font-mono text-xs">
            R
          </span>
          .
        </div>
      </div>
    </div>
  );
}
