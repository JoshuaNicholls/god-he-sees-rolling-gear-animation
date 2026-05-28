const { useState, useEffect, useRef } = React;

const PATTERN = [4, 2, 3, 3, 3, 3, 3, 3, 4, 2, 4, 2, 3, 3, 2, 2];
const TOTAL = PATTERN.reduce((a, b) => a + b, 0);
const PX_PER_SIXTEENTH = 10;
const R = (TOTAL * PX_PER_SIXTEENTH) / (2 * Math.PI);
const W = 600;
const CX = W / 2;
const CY = 120;
const GROUND_Y = CY + R;
const BPM = 150;
const SPEED = BPM * 4 * PX_PER_SIXTEENTH / 60;
const PX_PER_BEAT = 4 * PX_PER_SIXTEENTH;
const SVG_H = Math.ceil(GROUND_Y) + 80;

const HIT_H = 11, HIT_W = 8;
const STUB_H = 5,  STUB_W = 5;
const HOLE_W = 14, HOLE_D = 13;
const SOLID_Y = GROUND_Y + HOLE_D;
const TICK_Y  = SOLID_Y + 4;

const hitSet = new Set();
let _a = 0;
for (const gap of PATTERN) { hitSet.add(_a); _a += gap; }

const allToothBaseAngles = Array.from({ length: TOTAL }, (_, i) =>
  Math.PI / 2 - (i / TOTAL) * 2 * Math.PI
);

const baseNotchAngles = [];
let acc = 0;
for (const gap of PATTERN) {
  baseNotchAngles.push(Math.PI / 2 - (acc / TOTAL) * 2 * Math.PI);
  acc += gap;
}
const hitPhases = baseNotchAngles.map(a => Math.PI / 2 - a);

const BEAT_FREQ = [5000, 800, 2500, 800];
const BEAT_GAIN = [2.5, 1.5, 2.0, 1.5];

function playMetronome(actx, beatIndex) {
  const now = actx.currentTime;
  const sr = actx.sampleRate;
  const len = Math.floor(sr * 0.05);
  const buf = actx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++)
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.007));
  const src = actx.createBufferSource();
  src.buffer = buf;
  const bpf = actx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = BEAT_FREQ[beatIndex % 4];
  bpf.Q.value = 1.5;
  const g = actx.createGain();
  g.gain.setValueAtTime(BEAT_GAIN[beatIndex % 4], now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  src.connect(bpf); bpf.connect(g); g.connect(actx.destination);
  src.start(now);
}

function playNotchBeep(actx) {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 233.08;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.6, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(g); g.connect(actx.destination);
  osc.start(now); osc.stop(now + 0.08);
}

let dustId = 0;
function spawnDust(dustRef) {
  const count = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    dustRef.current.push({
      id: dustId++,
      x: CX, y: GROUND_Y,
      vx: -(1.5 + Math.random() * 3.5),
      vy: -(Math.random() * 2),
      life: 1.0,
      decay: 0.04 + Math.random() * 0.03,
      r: 1.5 + Math.random() * 2,
    });
  }
}

function toothPoints(cx, cy, angle, r, h, w) {
  const tx = cx + (r + h) * Math.cos(angle);
  const ty = cy + (r + h) * Math.sin(angle);
  const hw = w / 2;
  const a1 = angle - Math.atan2(hw, r);
  const a2 = angle + Math.atan2(hw, r);
  return [
    cx + r * Math.cos(a1), cy + r * Math.sin(a1),
    tx, ty,
    cx + r * Math.cos(a2), cy + r * Math.sin(a2),
  ].join(",");
}

const RINGS = [
  { r: R * 0.52, stroke: "#c4622a", width: 2,  opacity: 0.9 },
  { r: R * 0.60, stroke: "#7a3a18", width: 1,  opacity: 0.7 },
];

function App() {
  const [playing, setPlaying] = useState(false);
  const offsetRef  = useRef(0);
  const rotRef     = useRef(0);
  const playingRef = useRef(false);
  const lastTsRef  = useRef(null);
  const actxRef    = useRef(null);
  const dustRef    = useRef([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    let rafId;
    const tick = (ts) => {
      if (playingRef.current) {
        if (lastTsRef.current !== null) {
          const dt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
          const prevRot    = rotRef.current;
          const prevOffset = offsetRef.current;
          offsetRef.current += SPEED * dt;
          rotRef.current     = offsetRef.current / R;
          const newRot    = rotRef.current;
          const newOffset = offsetRef.current;

          if (actxRef.current) {
            for (let i = 0; i < hitPhases.length; i++) {
              const ph = hitPhases[i];
              if (Math.floor((prevRot - ph) / (2 * Math.PI)) !==
                  Math.floor((newRot  - ph) / (2 * Math.PI))) {
                playNotchBeep(actxRef.current);
                spawnDust(dustRef);
              }
            }
            const prevBeat = Math.floor(prevOffset / PX_PER_BEAT);
            const newBeat  = Math.floor(newOffset  / PX_PER_BEAT);
            if (newBeat !== prevBeat)
              playMetronome(actxRef.current, ((newBeat % 4) + 4) % 4);
          }
        }
        lastTsRef.current = ts;
      } else {
        lastTsRef.current = null;
      }

      dustRef.current = dustRef.current
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.08, life: p.life - p.decay }))
        .filter(p => p.life > 0);

      forceRender(n => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const toggle = () => {
    if (!actxRef.current)
      actxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    actxRef.current.resume().then(() => {
      playingRef.current = !playingRef.current;
      setPlaying(p => !p);
    });
  };

  const offset   = offsetRef.current;
  const rotation = rotRef.current;

  const holes = [];
  const ticks = [];
  const firstN = Math.floor((offset - CX) / PX_PER_SIXTEENTH) - 1;
  const lastN  = Math.ceil((offset + (W - CX)) / PX_PER_SIXTEENTH) + 1;

  for (let n = firstN; n <= lastN; n++) {
    const x = n * PX_PER_SIXTEENTH - offset + CX;
    const isMeasure = ((n % 16) + 16) % 16 === 0;
    const isBeat    = ((n % 4)  + 4)  % 4  === 0;

    holes.push(
      <polygon key={`h${n}`}
        points={`${x - HOLE_W/2},${GROUND_Y} ${x},${GROUND_Y + HOLE_D} ${x + HOLE_W/2},${GROUND_Y}`}
        fill="#1a1210"
      />
    );

    if (isMeasure || isBeat) {
      const h     = isMeasure ? 16 : 9;
      const color = isMeasure ? "#c8c8c8" : "#7a8a8a";
      ticks.push(
        <line key={`t${n}`}
          x1={x} y1={TICK_Y} x2={x} y2={TICK_Y + h}
          stroke={color} strokeWidth={isMeasure ? 2 : 1}
        />
      );
    }
  }

  const teeth = allToothBaseAngles.map((baseAngle, i) => {
    const angle = baseAngle + rotation;
    const isHit = hitSet.has(i);
    return (
      <polygon key={i}
        points={toothPoints(CX, CY, angle, R, isHit ? HIT_H : STUB_H, isHit ? HIT_W : STUB_W)}
        fill={isHit ? "#d4581a" : "#8b4a1a"}
        stroke={isHit ? "#ff9955" : "#c4622a"}
        strokeWidth={isHit ? 1 : 0.5}
      />
    );
  });

  return (
    <div style={{ background: "#1a1210", display: "inline-block", padding: 10 }}>
      <svg width={W} height={SVG_H} style={{ display: "block" }}>

        {/* ── 1. GROUND (bottom layer) ── */}
        <rect x={0} y={GROUND_Y} width={W} height={HOLE_D} fill="#4a5560" />
        {holes}
        <rect x={0} y={SOLID_Y} width={W} height={16} fill="#4a5560" />
        <rect x={0} y={SOLID_Y} width={W} height={2.5} fill="#8a9aa0" />
        {ticks}

        {/* ── 2. WHEEL (rendered after ground so it sits on top) ── */}
        <circle cx={CX} cy={CY} r={R} fill="#2a1a0e" />
        {RINGS.map((ring, i) => (
          <circle key={i} cx={CX} cy={CY} r={ring.r}
            fill="none" stroke={ring.stroke}
            strokeWidth={ring.width} opacity={ring.opacity} />
        ))}
        <circle cx={CX} cy={CY} r={R * 0.5} fill="#1a1210" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#8b4a1a" strokeWidth="3" />
        <circle cx={CX} cy={CY} r={R - 1.5} fill="none" stroke="#c4622a" strokeWidth="1" opacity="0.4" />

        {/* ── 3. TEETH (on top of everything) ── */}
        {teeth}

        {/* ── 4. CONTACT DOT + DUST ── */}
        <circle cx={CX} cy={GROUND_Y} r="4" fill="#ff6a1a" />
        <circle cx={CX} cy={GROUND_Y} r="4" fill="none" stroke="#ff9955" strokeWidth="1" />
        {dustRef.current.map(p => (
          <circle key={p.id} cx={p.x} cy={p.y} r={p.r}
            fill={`rgba(190,120,40,${p.life.toFixed(2)})`} />
        ))}

      </svg>

      <button onClick={toggle}
        style={{ marginTop: 8, width: "100%", padding: "6px 0",
                 background: "#1e0e06", color: playing ? "#ff6622" : "#88cc44",
                 border: `1px solid ${playing ? "#662200" : "#336611"}`,
                 cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.1em" }}>
        {playing ? "⏸ PAUSE" : "▶ PLAY"}
      </button>
    </div>
  );
}

export default App;