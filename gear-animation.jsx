const { useState, useEffect, useRef } = React;

const PATTERN = [4, 2, 3, 3, 3, 3, 3, 3, 4, 2, 4, 2, 3, 3, 2, 2];
const TOTAL = PATTERN.reduce((a, b) => a + b, 0);
const PX_PER_SIXTEENTH = 10;
const R = (TOTAL * PX_PER_SIXTEENTH) / (2 * Math.PI);
const CX = 150;
const CY = 110;
const GROUND_Y = CY + R;
const BPM = 150;
const SPEED = BPM * 4 * PX_PER_SIXTEENTH / 60;

const PX_PER_BEAT = 4 * PX_PER_SIXTEENTH; // 40px

const baseNotchAngles = [];
let acc = 0;
for (const gap of PATTERN) {
  baseNotchAngles.push(Math.PI / 2 - (acc / TOTAL) * 2 * Math.PI);
  acc += gap;
}
const hitPhases = baseNotchAngles.map(a => Math.PI / 2 - a);

// Beat 0=1, 1=2, 2=3, 3=4 → High Low Med Low
// frequency of noise filter per beat
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
  osc.frequency.value = 233.08; // Bb3
  const g = actx.createGain();
  g.gain.setValueAtTime(0.6, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(g); g.connect(actx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

function App() {
  const [playing, setPlaying]   = useState(false);
  const offsetRef               = useRef(0);
  const rotRef                  = useRef(0);
  const playingRef              = useRef(false);
  const lastTsRef               = useRef(null);
  const actxRef                 = useRef(null);
  const prevBeatRef             = useRef(-1);
  const [, forceRender]         = useState(0);

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
            // Notch hits
            for (let i = 0; i < hitPhases.length; i++) {
              const ph = hitPhases[i];
              if (Math.floor((prevRot - ph) / (2 * Math.PI)) !==
                  Math.floor((newRot  - ph) / (2 * Math.PI))) {
                playNotchBeep(actxRef.current);
              }
            }

            // Beat metronome — fires every 4 sixteenth notes
            const prevBeat = Math.floor(prevOffset / PX_PER_BEAT);
            const newBeat  = Math.floor(newOffset  / PX_PER_BEAT);
            if (newBeat !== prevBeat) {
              const beatInBar = ((newBeat % 4) + 4) % 4;
              playMetronome(actxRef.current, beatInBar);
              prevBeatRef.current = newBeat;
            }
          }
        }
        lastTsRef.current = ts;
      } else {
        lastTsRef.current = null;
      }
      forceRender(n => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const toggle = () => {
    if (!actxRef.current)
      actxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    playingRef.current = !playingRef.current;
    setPlaying(p => !p);
  };

  const offset   = offsetRef.current;
  const rotation = rotRef.current;

  // Ground ticks
  const ticks = [];
  const firstTick = Math.floor((offset - CX) / PX_PER_SIXTEENTH);
  const lastTick  = Math.ceil((offset + (300 - CX)) / PX_PER_SIXTEENTH);
  for (let n = firstTick; n <= lastTick; n++) {
    const x = n * PX_PER_SIXTEENTH - offset + CX;
    const isMeasure = ((n % 16) + 16) % 16 === 0;
    const isBeat    = ((n % 4)  + 4)  % 4  === 0;
    const h     = isMeasure ? 18 : isBeat ? 12 : 6;
    const color = isMeasure ? "white" : isBeat ? "#aaa" : "#555";
    ticks.push(
      <line key={n}
        x1={x} y1={GROUND_Y} x2={x} y2={GROUND_Y + h}
        stroke={color} strokeWidth={isMeasure ? 2 : 1}
      />
    );
  }

  const notchAngles = baseNotchAngles.map(a => a + rotation);

  return (
    <div style={{ background: "#111", display: "inline-block", padding: 10 }}>
      <svg width="300" height={Math.ceil(GROUND_Y) + 30} style={{ display: "block" }}>
        {ticks}
        <line x1="0" y1={GROUND_Y} x2="300" y2={GROUND_Y} stroke="#888" strokeWidth="2" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#444" strokeWidth="2" />
        {notchAngles.map((a, i) => (
          <line key={i}
            x1={CX + Math.cos(a) * R}
            y1={CY + Math.sin(a) * R}
            x2={CX + Math.cos(a) * (R + 10)}
            y2={CY + Math.sin(a) * (R + 10)}
            stroke="orange" strokeWidth="2"
          />
        ))}
        <circle cx={CX} cy={GROUND_Y} r="4" fill="red" />
      </svg>
      <button onClick={toggle}
        style={{ marginTop: 8, width: "100%", padding: "6px 0",
                 background: "#222", color: playing ? "#f55" : "#5f5",
                 border: "1px solid #444", cursor: "pointer", fontFamily: "monospace" }}>
        {playing ? "⏸ PAUSE" : "▶ PLAY"}
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));