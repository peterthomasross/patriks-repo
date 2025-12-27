"use client";

import { useEffect, useRef, useState } from "react";

type Spike = {
  x: number;
  width: number;
  height: number;
};

type GameState = {
  deerY: number;
  deerVy: number;
  deerReady: boolean;
  spikes: Spike[];
  ceilingBlocks: Spike[];
  score: number;
  best: number;
  spawnTimer: number;
  ceilingBlockSpawnTimer: number;
  lastScoreSent: number;
};

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 480;
const GROUND_Y = CANVAS_HEIGHT - 90;
const DEER_X = 120;
const DEER_WIDTH = 86;
const DEER_HEIGHT = 82;
const GRAVITY = 2100; // px / s^2
const JUMP_VELOCITY = -800; // px / s
const FLIGHT_THRESHOLD = 200;
const FLIGHT_THRUST = -900;
const CEILING_Y = 12;
const CEILING_BLOCK_MIN_WIDTH = 90;
const CEILING_BLOCK_MAX_WIDTH = 200;
const CEILING_BLOCK_MIN_HEIGHT = 28;
const CEILING_BLOCK_MAX_HEIGHT = 44;
const CEILING_BLOCK_SPAWN_MIN = 1.0;
const CEILING_BLOCK_SPAWN_MAX = 1.8;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>({
    deerY: GROUND_Y - DEER_HEIGHT,
    deerVy: 0,
    deerReady: false,
    spikes: [],
    ceilingBlocks: [],
    score: 0,
    best: 0,
    spawnTimer: 1.6,
    ceilingBlockSpawnTimer: 1.2,
    lastScoreSent: 0,
  });
  const [status, setStatus] = useState<"ready" | "playing" | "gameover">(
    "ready"
  );

  const beginGame = () => {
    resetGame();
    setStatus("playing");
  };

  const startOrJump = () => {
    if (status === "ready") {
      beginGame();
      return;
    }
    if (status === "gameover") {
      beginGame();
      return;
    }
    const state = stateRef.current;
    const canFly = state.score >= FLIGHT_THRESHOLD;
    if (canFly) {
      state.deerVy = FLIGHT_THRUST;
      return;
    }
    const deerOnGround = state.deerY >= GROUND_Y - DEER_HEIGHT - 1;
    if (deerOnGround) {
      state.deerVy = JUMP_VELOCITY;
    }
  };

  const resetGame = () => {
    const state = stateRef.current;
    state.deerY = GROUND_Y - DEER_HEIGHT;
    state.deerVy = 0;
    state.spikes = [];
    state.ceilingBlocks = [];
    state.score = 0;
    state.lastScoreSent = 0;
    state.spawnTimer = 1.2;
    state.ceilingBlockSpawnTimer = 1.2;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    let lastTime = performance.now();

    const deerImg = new Image();
    deerImg.src = "/deer.png";
    deerImg.onload = () => {
      stateRef.current.deerReady = true;
    };
    deerImg.onerror = () => {
      // Fallback to simple rectangle if the sprite is missing.
      stateRef.current.deerReady = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        startOrJump();
      }
    };

    const handlePointer = () => startOrJump();

    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("pointerdown", handlePointer);

    const loop = (time: number) => {
      const dtMs = Math.min(32, time - lastTime);
      const dt = dtMs / 1000;
      lastTime = time;
      update(dt);
      draw(ctx, deerImg);
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("pointerdown", handlePointer);
    };
    // We intentionally keep the deps array empty so the loop binds once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const update = (dt: number) => {
    const state = stateRef.current;
    if (status !== "playing") return;

    // Difficulty rises slowly as score grows.
    const speed = 340 + Math.min(state.score * 1.5, 260);

    // Apply gravity and vertical motion.
    state.deerVy += GRAVITY * dt;
    state.deerY += state.deerVy * dt;

    // Spawn new ground spikes.
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const spikeHeight = 55 + Math.random() * 24;
      const spikeWidth = 30 + Math.random() * 25;
      state.spikes.push({
        x: CANVAS_WIDTH + spikeWidth,
        width: spikeWidth,
        height: spikeHeight,
      });
      state.spawnTimer = 0.9 + Math.random() * 0.9;
    }

    // Spawn ceiling spikes after flight unlock.
    if (state.score >= FLIGHT_THRESHOLD) {
      state.ceilingBlockSpawnTimer -= dt;
      if (state.ceilingBlockSpawnTimer <= 0) {
        const blockWidth =
          CEILING_BLOCK_MIN_WIDTH +
          Math.random() * (CEILING_BLOCK_MAX_WIDTH - CEILING_BLOCK_MIN_WIDTH);
        const blockHeight =
          CEILING_BLOCK_MIN_HEIGHT +
          Math.random() * (CEILING_BLOCK_MAX_HEIGHT - CEILING_BLOCK_MIN_HEIGHT);
        state.ceilingBlocks.push({
          x: CANVAS_WIDTH + blockWidth,
          width: blockWidth,
          height: blockHeight,
        });
        state.ceilingBlockSpawnTimer =
          CEILING_BLOCK_SPAWN_MIN +
          Math.random() * (CEILING_BLOCK_SPAWN_MAX - CEILING_BLOCK_SPAWN_MIN);
      }
    } else {
      // Keep timer warm so spawning begins promptly after threshold.
      state.ceilingBlockSpawnTimer = CEILING_BLOCK_SPAWN_MIN;
    }

    // Move spikes and cull off-screen.
    state.spikes = state.spikes
      .map((spike) => ({ ...spike, x: spike.x - speed * dt }))
      .filter((spike) => spike.x + spike.width > -10);

    // Move ceiling spikes and cull off-screen.
    state.ceilingBlocks = state.ceilingBlocks
      .map((block) => ({ ...block, x: block.x - speed * dt }))
      .filter((block) => block.x + block.width > -10);

    // Ceiling clamp to keep the deer on-screen when flying/bouncing.
    if (state.deerY < CEILING_Y) {
      state.deerY = CEILING_Y;
      if (state.deerVy < 0) state.deerVy = 0;
    }

    // Clamp to ground if we fell below it.
    if (state.deerY > GROUND_Y - DEER_HEIGHT) {
      state.deerY = GROUND_Y - DEER_HEIGHT;
      state.deerVy = 0;
    }

    // Score increases with distance.
    state.score += dt * 10;
    const integerScore = Math.floor(state.score);
    if (integerScore !== state.lastScoreSent) {
      state.lastScoreSent = integerScore;
      if (integerScore > state.best) {
        state.best = integerScore;
      }
    }

    // Collision detection (simple AABB).
    const deerTop = state.deerY;
    const deerBottom = state.deerY + DEER_HEIGHT;
    const deerCollisionLeft = DEER_X;
    const deerCollisionRight = DEER_X + DEER_WIDTH;

    for (const spike of state.spikes) {
      const spikeTop = GROUND_Y - spike.height;
      const spikeBottom = GROUND_Y;
      const spikeLeft = spike.x;
      const spikeRight = spike.x + spike.width;
      const overlapX =
        deerCollisionRight > spikeLeft && deerCollisionLeft < spikeRight;
      const overlapY = deerBottom > spikeTop && deerTop < spikeBottom;
      if (overlapX && overlapY) {
        setStatus("gameover");
        if (state.score > state.best) {
          state.best = state.score;
        }
        break;
      }
    }

    // Collision with ceiling blocks (rectangles from the top).
    for (const block of state.ceilingBlocks) {
      const spikeTop = 0;
      const spikeBottom = block.height;
      const spikeLeft = block.x;
      const spikeRight = block.x + block.width;
      const overlapX =
        deerCollisionRight > spikeLeft && deerCollisionLeft < spikeRight;
      const overlapY = deerTop < spikeBottom && deerBottom > spikeTop;
      if (overlapX && overlapY) {
        setStatus("gameover");
        if (state.score > state.best) {
          state.best = state.score;
        }
        break;
      }
    }
  };

  const drawGround = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#d6b07e";
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
    ctx.strokeStyle = "#c28d4c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 1.5);
    ctx.lineTo(CANVAS_WIDTH, GROUND_Y + 1.5);
    ctx.stroke();
  };

  const drawDeer = (
    ctx: CanvasRenderingContext2D,
    deerImg: HTMLImageElement
  ) => {
    const state = stateRef.current;
    if (state.deerReady) {
      ctx.drawImage(deerImg, DEER_X, state.deerY, DEER_WIDTH, DEER_HEIGHT);
    } else {
      // Simple placeholder block if image missing.
      ctx.fillStyle = "#f27c2d";
      ctx.fillRect(DEER_X, state.deerY, DEER_WIDTH, DEER_HEIGHT);
      ctx.fillStyle = "#fff3e0";
      ctx.fillRect(DEER_X + 12, state.deerY + 14, 24, 24);
    }
  };

  const drawSpikes = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#8a3b1d";
    ctx.strokeStyle = "#5d2410";
    ctx.lineWidth = 2;
    for (const spike of stateRef.current.spikes) {
      const baseY = GROUND_Y;
      ctx.beginPath();
      ctx.moveTo(spike.x, baseY);
      ctx.lineTo(spike.x + spike.width / 2, baseY - spike.height);
      ctx.lineTo(spike.x + spike.width, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  const drawCeilingBlocks = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#f59e0b";
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 2;
    for (const block of stateRef.current.ceilingBlocks) {
      ctx.fillRect(block.x, 0, block.width, block.height);
      ctx.strokeRect(block.x, 0, block.width, block.height);
    }
  };

  const drawOverlay = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "28px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    if (status === "ready") {
      ctx.fillText("Press space (or click) to start", CANVAS_WIDTH / 2, 110);
    } else if (status === "gameover") {
      ctx.fillText("Ouch! Press space to try again", CANVAS_WIDTH / 2, 110);
    }
  };

  const draw = (ctx: CanvasRenderingContext2D, deerImg: HTMLImageElement) => {
    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#f9e4cf");
    gradient.addColorStop(1, "#f5c387");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawGround(ctx);
    drawCeilingBlocks(ctx);
    drawSpikes(ctx);
    drawDeer(ctx, deerImg);
    drawOverlay(ctx);

    // HUD
    ctx.fillStyle = "#4b2d12";
    ctx.font = "20px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    // Read the live values from the ref so the HUD updates every frame without
    // needing a React re-render.
    const { score: stateScore, best: stateBest } = stateRef.current;
    ctx.fillText(`Score: ${Math.floor(stateScore)}`, 20, 36);
    ctx.fillText(`Best: ${Math.floor(stateBest)}`, 20, 62);
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-gradient-to-b from-amber-50 to-amber-200 px-0 py-6 text-zinc-900">
      <div className="flex w-full flex-col items-center gap-3 bg-white/60 p-4 shadow-2xl backdrop-blur">
        <div className="flex w-full flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Patric{"'s"} game
          </h1>
          <p className="text-sm text-zinc-600">
            poti zbura la scorul 200 doar trebuie sa sari de doua ori casa zbori
            ai grija si de blocurile de sus si spike ca osa te omoare
          </p>
        </div>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full rounded-none border border-amber-200 bg-amber-50 shadow-inner sm:rounded-lg"
          aria-label="Tiny deer jump game"
        />
      </div>
    </div>
  );
}
