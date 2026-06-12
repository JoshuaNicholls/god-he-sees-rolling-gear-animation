const { useState, useEffect, useRef } = React;

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const W = 1280, H = 720;
const PATTERN = [4, 2, 3, 3, 3, 3, 3, 3, 4, 2, 4, 2, 3, 3, 2, 2];
const TOTAL = PATTERN.reduce((a,b) => a+b, 0); // 46
const PX16 = 14;
const R = (TOTAL * PX16) / (2 * Math.PI); // ~102px
const CX = W / 2;      // 640
const CY_LAND = 240;   // gear centre Y when landed
const GROUND_Y = CY_LAND + R;

const BPM    = 150;
const SPEED  = BPM * 4 * PX16 / 60;  // px/s
const PX_BEAT = 4  * PX16;
const PX_BAR  = 16 * PX16;

// Gear tooth dims
const HIT_H=15, HIT_W=8,  HIT_FLAT=4;
const STUB_H=7,  STUB_W=5, STUB_FLAT=2;

// Ground dims
const HOLE_W=7, HOLE_D=30;
const SOLID_Y       = GROUND_Y + HOLE_D;
const TRUNC_Y       = GROUND_Y + HOLE_D / 2;
const GROUND_BASE_H = 22;

// Drop physics — drop starts half a beat before bar 1, lands on beat 1
const FLOAT_HEIGHT  = 42;
const LANDED_OFFSET = 13;
const GRAVITY       = 2750;
const DROP_TRIGGER  = -PX_BEAT / 2;

// Initial state
const INITIAL_ROT    = -0.001;
const INITIAL_OFFSET = -PX_BAR - 0.5;

// Label layout (Y positions below SOLID_Y)
const TICK_Y      = SOLID_Y + GROUND_BASE_H + 6;
const BAR_NUM_Y   = TICK_Y  + 26;
const NAMEPLATE_Y = TICK_Y  + 52;
const SECT_BAR_Y  = TICK_Y  + 88;

// Lighting direction (from upper-left)
const LX = 0.4, LY = 0.6;  // light vector pointing into scene

// ═══════════════════════════════════════════════════════════════
// SONG STRUCTURE
// ═══════════════════════════════════════════════════════════════
const SONG_SECTIONS = [
  { name: "Intro",        bars: 16 },
  { name: "Break 1",      bars: 2  },
  { name: "Verse 1",      bars: 8  },
  { name: "Break 2",      bars: 2  },
  { name: "Verse 2",      bars: 8  },
  { name: "Chorus 1",     bars: 8  },
  { name: "Post Chorus",  bars: 4  },
  { name: "Pre Verse 1",  bars: 8  },
  { name: "Verse 3",      bars: 16 },
  { name: "Bridge 1",     bars: 8  },
  { name: "Pre Verse 2",  bars: 13 },
  { name: "Verse 4",      bars: 16 },
  { name: "Solo",         bars: 32 },
  { name: "Post Solo",    bars: 2  },
  { name: "Bridge 2",     bars: 13 },
  { name: "Break 3",      bars: 2  },
  { name: "Verse 5",      bars: 8  },
  { name: "Break 4",      bars: 2  },
  { name: "Verse 6",      bars: 8  },
  { name: "Chorus 2",     bars: 8  },
];
let _cb = 0;
const sectionData = SONG_SECTIONS.map(s => {
  const startBar = _cb; _cb += s.bars;
  return { ...s, startBar, endBar: _cb };
});
function getSectionAt(barIdx) {
  return sectionData.find(s => barIdx >= s.startBar && barIdx < s.endBar) || null;
}
function isBreakSection(barIdx) {
  const s = getSectionAt(barIdx);
  return s ? s.name.toLowerCase().startsWith('break') : false;
}
function suppressHoles(barIdx) { return barIdx < 0 || isBreakSection(barIdx); }

// ═══════════════════════════════════════════════════════════════
// CRASH POSITIONS  (1-indexed bar.sixteenth, formula: (b-1)*16+(s-1))
// ═══════════════════════════════════════════════════════════════
function crashNote(secName, bar, s) {
  const sec = sectionData.find(d => d.name === secName);
  return sec ? (sec.startBar + bar - 1) * 16 + (s - 1) : -1;
}
const ALL_CRASH_NOTES = [
  crashNote('Intro',    1,1),  crashNote('Intro',   3,15), crashNote('Intro',  5,1),
  crashNote('Intro',    7,15), crashNote('Intro',   9,1),  crashNote('Intro', 13,2),
  crashNote('Intro',   16,15),
  crashNote('Verse 1',  1,1),  crashNote('Verse 1', 3,14), crashNote('Verse 1',8,14),
  crashNote('Verse 2',  1,3),  crashNote('Verse 2', 4,1),  crashNote('Verse 2',5,1),
  crashNote('Chorus 1', 1,1),  crashNote('Chorus 1',5,1),
];
const CRASH_OFFSETS = ALL_CRASH_NOTES.filter(n => n >= 0).map(n => n * PX16);

// ═══════════════════════════════════════════════════════════════
// MOOD SYSTEM
// ═══════════════════════════════════════════════════════════════
const MOODS = {
  orange:      {bgR:22, bgG:11, bgB:5,  acR:220,acG:88, acB:20, grR:72, grG:55, grB:38},
  blueGrey:    {bgR:8,  bgG:12, bgB:22, acR:70, acG:110,acB:200,grR:48, grG:58, grB:82},
  purpleGreen: {bgR:10, bgG:6,  bgB:18, acR:130,acG:50, acB:190,grR:52, grG:38, grB:68},
  yellow:      {bgR:16, bgG:12, bgB:3,  acR:200,acG:142,acB:28, grR:68, grG:58, grB:24},
  red:         {bgR:18, bgG:3,  bgB:3,  acR:210,acG:18, acB:18, grR:68, grG:28, grB:28},
};
function getSectionMoodName(name) {
  if (!name) return 'orange';
  const n = name.toLowerCase();
  if (n.startsWith('break')) return 'blueGrey';
  if (n.includes('chorus'))  return 'purpleGreen';
  if (n.includes('bridge'))  return 'yellow';
  if (n === 'solo')          return 'red';
  return 'orange';
}
function lerpMood(m, t, dt) {
  const s = Math.min(1, dt * 0.9);
  const l = (a,b) => a + (b-a)*s;
  return {
    bgR:l(m.bgR,t.bgR), bgG:l(m.bgG,t.bgG), bgB:l(m.bgB,t.bgB),
    acR:l(m.acR,t.acR), acG:l(m.acG,t.acG), acB:l(m.acB,t.acB),
    grR:l(m.grR,t.grR), grG:l(m.grG,t.grG), grB:l(m.grB,t.grB),
  };
}

// ═══════════════════════════════════════════════════════════════
// GEAR GEOMETRY
// ═══════════════════════════════════════════════════════════════
const hitSet = new Set();
let _ha = 0; for (const g of PATTERN) { hitSet.add(_ha); _ha += g; }

const allToothAngles = Array.from({length:TOTAL}, (_,i) => Math.PI/2 - (i/TOTAL)*2*Math.PI);
const baseNotchAngles = [];
let _na = 0;
for (const g of PATTERN) { baseNotchAngles.push(Math.PI/2 - (_na/TOTAL)*2*Math.PI); _na += g; }
const hitPhases = baseNotchAngles.map(a => Math.PI/2 - a);

// ═══════════════════════════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════════════════════════
const BEAT_FREQ=[5000,800,2500,800], BEAT_GAIN=[2.5,1.5,2.0,1.5];
function playMetronome(actx, bi) {
  const now=actx.currentTime, sr=actx.sampleRate, len=Math.floor(sr*0.05);
  const buf=actx.createBuffer(1,len,sr), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(sr*0.007));
  const src=actx.createBufferSource(); src.buffer=buf;
  const bpf=actx.createBiquadFilter(); bpf.type='bandpass';
  bpf.frequency.value=BEAT_FREQ[bi%4]; bpf.Q.value=1.5;
  const g=actx.createGain();
  g.gain.setValueAtTime(BEAT_GAIN[bi%4],now);
  g.gain.exponentialRampToValueAtTime(0.001,now+0.05);
  src.connect(bpf); bpf.connect(g); g.connect(actx.destination); src.start(now);
}
function playNotchBeep(actx) {
  const now=actx.currentTime;
  const osc=actx.createOscillator(); osc.type='sine'; osc.frequency.value=233.08;
  const g=actx.createGain();
  g.gain.setValueAtTime(0.6,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.08);
  osc.connect(g); g.connect(actx.destination); osc.start(now); osc.stop(now+0.08);
}

// ═══════════════════════════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════════════════════════
let _pid = 0;
function spawnSparks(particles, x, y, count, isCrash) {
  for (let i=0; i<count; i++) {
    const spread = isCrash ? 1.6 : 0.9;
    const a = Math.PI + (Math.random()-0.5)*spread;
    const spd = isCrash ? 3+Math.random()*7 : 1.5+Math.random()*3.5;
    particles.push({
      id:_pid++, type:'spark', x, y,
      vx:Math.cos(a)*spd, vy:Math.sin(a)*spd - (isCrash?2.5:1),
      life:1, decay: isCrash ? 0.025+Math.random()*0.025 : 0.05+Math.random()*0.04,
      len: isCrash ? 8+Math.random()*16 : 3+Math.random()*7,
    });
  }
}
function spawnEmbers(particles, x, y, count) {
  for (let i=0; i<count; i++) {
    particles.push({
      id:_pid++, type:'ember', x:x+(Math.random()-0.5)*16, y,
      vx:-(0.6+Math.random()*1.4), vy:-(0.8+Math.random()*2.5),
      life:1, decay:0.007+Math.random()*0.007, size:4+Math.random()*6,
    });
  }
}
function tickParticles(particles) {
  for (const p of particles) {
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.1; p.life-=p.decay;
  }
  return particles.filter(p => p.life>0).slice(-280);
}

// ═══════════════════════════════════════════════════════════════
// DRAW HELPERS
// ═══════════════════════════════════════════════════════════════
const ri = v => Math.round(v);
const rgb  = (r,g,b)   => `rgb(${ri(r)},${ri(g)},${ri(b)})`;
const rgba = (r,g,b,a) => `rgba(${ri(r)},${ri(g)},${ri(b)},${+a.toFixed(3)})`;
const lerp = (a,b,t)   => a+(b-a)*t;

function roundRect(ctx, x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

// ═══════════════════════════════════════════════════════════════
// SCENE DRAW FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function drawBackground(ctx, mood, noisePat, wheelCY) {
  ctx.fillStyle = rgb(mood.bgR, mood.bgG, mood.bgB);
  ctx.fillRect(0,0,W,H);

  // Ambient glow behind gear
  const gg = ctx.createRadialGradient(CX, wheelCY, R*0.2, CX, wheelCY, R*2.4);
  gg.addColorStop(0, rgba(mood.acR,mood.acG,mood.acB,0.09));
  gg.addColorStop(1, rgba(mood.acR,mood.acG,mood.acB,0));
  ctx.fillStyle=gg; ctx.fillRect(0,0,W,H);

  // Vignette
  const vg = ctx.createRadialGradient(CX,H*0.42,H*0.12,CX,H*0.42,H*0.82);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.72)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

  // Noise grain
  if (noisePat) {
    ctx.save(); ctx.globalAlpha=0.032;
    ctx.fillStyle=noisePat; ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
}

function drawGround(ctx, offset, mood) {
  // Base plate gradient
  const pg = ctx.createLinearGradient(0,SOLID_Y-3,0,SOLID_Y+GROUND_BASE_H);
  pg.addColorStop(0,   rgb(mood.grR+30,mood.grG+30,mood.grB+30));
  pg.addColorStop(0.1, rgb(mood.grR,   mood.grG,   mood.grB));
  pg.addColorStop(1,   rgb(Math.max(0,mood.grR-16),Math.max(0,mood.grG-16),Math.max(0,mood.grB-16)));
  ctx.fillStyle=pg; ctx.fillRect(0,SOLID_Y,W,GROUND_BASE_H);

  // Brushed-metal lines
  ctx.save(); ctx.globalAlpha=0.05;
  ctx.strokeStyle='#fff'; ctx.lineWidth=0.5;
  for (let y=SOLID_Y+2; y<SOLID_Y+GROUND_BASE_H; y+=3.5) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }
  ctx.restore();

  const firstN = Math.floor((offset-CX)/PX16)-1;
  const lastN  = Math.ceil((offset+(W-CX))/PX16)+1;

  // Spikes
  for (let n=firstN; n<=lastN; n++) {
    const x = n*PX16 - offset + CX;
    if (suppressHoles(Math.floor(n/16))) continue;
    const sx=x+PX16/2, hw=HOLE_W/2, tw=HOLE_W/4;
    const sg = ctx.createLinearGradient(sx,TRUNC_Y,sx,SOLID_Y);
    sg.addColorStop(0, rgb(mood.grR+52,mood.grG+52,mood.grB+52));
    sg.addColorStop(0.5, rgb(mood.grR+18,mood.grG+18,mood.grB+18));
    sg.addColorStop(1, rgb(Math.max(0,mood.grR-10),Math.max(0,mood.grG-10),Math.max(0,mood.grB-10)));
    ctx.beginPath();
    ctx.moveTo(sx-tw,TRUNC_Y); ctx.lineTo(sx+tw,TRUNC_Y);
    ctx.lineTo(sx+hw,SOLID_Y); ctx.lineTo(sx-hw,SOLID_Y);
    ctx.closePath(); ctx.fillStyle=sg; ctx.fill();
    // Lit top edge
    ctx.beginPath(); ctx.moveTo(sx-tw,TRUNC_Y); ctx.lineTo(sx+tw,TRUNC_Y);
    ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=1; ctx.stroke();
  }

  // Crash marker lines
  for (const co of CRASH_OFFSETS) {
    const x=co-offset+CX;
    if (x<-4||x>W+4) continue;
    ctx.strokeStyle='#cc2208'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(x,SOLID_Y); ctx.lineTo(x,SOLID_Y+20); ctx.stroke();
  }

  // Ticks + labels
  const mono = '"SF Mono","Fira Code",monospace';
  for (let n=firstN; n<=lastN; n++) {
    const x = n*PX16 - offset + CX;
    const isMeasure = n>=-16 && n%16===0;
    const isBeat    = n>=-16 && n%4===0 && !isMeasure;

    if (isBeat) {
      ctx.strokeStyle=rgba(mood.grR+22,mood.grG+22,mood.grB+22,0.65);
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,TICK_Y); ctx.lineTo(x,TICK_Y+10); ctx.stroke();
    }
    if (!isMeasure) continue;

    const gIdx = n/16, gBar = gIdx+1;
    ctx.strokeStyle='rgba(200,200,200,0.65)'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.moveTo(x,TICK_Y); ctx.lineTo(x,TICK_Y+20); ctx.stroke();

    // Global bar number
    ctx.save(); ctx.font=`12px ${mono}`;
    ctx.fillStyle=rgba(90,110,112,0.85); ctx.textAlign='left';
    ctx.fillText(String(gBar), x+2, BAR_NUM_Y); ctx.restore();

    if (gIdx<0) {
      ctx.save(); ctx.font=`12px ${mono}`;
      ctx.fillStyle=rgba(100,80,50,0.7); ctx.textAlign='left';
      ctx.fillText('0', x+2, SECT_BAR_Y); ctx.restore();
    } else {
      const sec = getSectionAt(gIdx);
      if (!sec) continue;
      const secBar = gIdx - sec.startBar + 1;

      if (sec.startBar===gIdx) {
        // Nameplate
        ctx.save();
        ctx.font=`bold 15px ${mono}`;
        const tw2 = ctx.measureText(sec.name).width;
        const px=10, npH=26;
        ctx.fillStyle='rgba(0,0,0,0.52)';
        roundRect(ctx, x+1, NAMEPLATE_Y-20, tw2+px*2, npH, 3);
        ctx.fill();
        ctx.strokeStyle=rgba(mood.acR,mood.acG,mood.acB,0.38);
        ctx.lineWidth=1;
        roundRect(ctx, x+1, NAMEPLATE_Y-20, tw2+px*2, npH, 3);
        ctx.stroke();
        ctx.fillStyle=rgba(mood.acR,mood.acG,mood.acB,0.92);
        ctx.textAlign='left';
        ctx.fillText(sec.name, x+1+px, NAMEPLATE_Y);
        ctx.restore();
      }

      ctx.save(); ctx.font=`12px ${mono}`;
      ctx.fillStyle=rgba(120,82,40,0.78); ctx.textAlign='left';
      ctx.fillText(String(secBar), x+2, SECT_BAR_Y); ctx.restore();
    }
  }
}

function drawGear(ctx, wheelCY, rotation, mood, contactFlash) {
  // ─── body gradient (light from upper-left) ───
  const bg = ctx.createLinearGradient(CX-R*0.6,wheelCY-R*0.6, CX+R*0.5,wheelCY+R*0.55);
  bg.addColorStop(0,'#4a2210'); bg.addColorStop(0.4,'#2a1308'); bg.addColorStop(1,'#0d0704');
  ctx.beginPath(); ctx.arc(CX,wheelCY,R,0,Math.PI*2);
  ctx.fillStyle=bg; ctx.fill();

  // ─── machined grooves ───
  for (const fr of [0.60,0.52]) {
    ctx.beginPath(); ctx.arc(CX,wheelCY,R*fr,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=5; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX,wheelCY,R*fr,0,Math.PI*2);
    ctx.strokeStyle=rgba(mood.acR,mood.acG,mood.acB,0.28); ctx.lineWidth=2; ctx.stroke();
  }

  // ─── outer rim ───
  ctx.beginPath(); ctx.arc(CX,wheelCY,R,0,Math.PI*2);
  ctx.strokeStyle=rgba(mood.acR*0.55,mood.acG*0.28,mood.acB*0.1,0.88); ctx.lineWidth=5; ctx.stroke();
  // Rim highlight arc (lit quadrant)
  ctx.beginPath(); ctx.arc(CX,wheelCY,R-2,Math.PI*1.1,Math.PI*1.9);
  ctx.strokeStyle=rgba(mood.acR,mood.acG,mood.acB,0.32); ctx.lineWidth=2.5; ctx.stroke();

  // ─── black centre hole ───
  const ch = ctx.createRadialGradient(CX-R*0.07,wheelCY-R*0.07,0,CX,wheelCY,R*0.52);
  ch.addColorStop(0,'#141414'); ch.addColorStop(0.75,'#0a0a0a'); ch.addColorStop(1,'#170e07');
  ctx.beginPath(); ctx.arc(CX,wheelCY,R*0.50,0,Math.PI*2); ctx.fillStyle=ch; ctx.fill();

  // ─── teeth with lighting ───
  const AMBIENT = 0.18;
  for (let i=0; i<TOTAL; i++) {
    const angle = allToothAngles[i] + rotation;
    const isHit  = hitSet.has(i);
    const h=isHit?HIT_H:STUB_H, w=isHit?HIT_W:STUB_W, fl=isHit?HIT_FLAT:STUB_FLAT;

    // Lighting: dot product of outward normal vs light direction
    const nx=Math.cos(angle), ny=Math.sin(angle);
    const raw = Math.max(0, -(nx*LX + ny*LY));
    const lit  = AMBIENT + (1-AMBIENT)*raw;

    const hw=w/2, fw=fl/2;
    const a1=angle-Math.atan2(hw,R),  a2=angle+Math.atan2(hw,R);
    const ta1=angle-Math.atan2(fw,R+h),ta2=angle+Math.atan2(fw,R+h);
    const b1x=CX+R*Math.cos(a1),   b1y=wheelCY+R*Math.sin(a1);
    const b2x=CX+R*Math.cos(a2),   b2y=wheelCY+R*Math.sin(a2);
    const t1x=CX+(R+h)*Math.cos(ta1),t1y=wheelCY+(R+h)*Math.sin(ta1);
    const t2x=CX+(R+h)*Math.cos(ta2),t2y=wheelCY+(R+h)*Math.sin(ta2);

    const dk = isHit?[78,26,6]:[52,18,5];
    const lt = isHit?[208,82,22]:[138,60,18];
    const cr=lerp(dk[0],lt[0],lit),cg=lerp(dk[1],lt[1],lit),cb=lerp(dk[2],lt[2],lit);

    ctx.beginPath();
    ctx.moveTo(b1x,b1y); ctx.lineTo(t1x,t1y);
    ctx.lineTo(t2x,t2y); ctx.lineTo(b2x,b2y); ctx.closePath();
    ctx.fillStyle=rgb(cr,cg,cb); ctx.fill();
    if (isHit && raw>0.5) {
      ctx.strokeStyle=rgba(255,180,90,(raw-0.5)*0.9); ctx.lineWidth=1; ctx.stroke();
    }
  }

  // ─── contact glow + ball ───
  const contactY = wheelCY + R;
  if (contactFlash > 0.02) {
    const cg = ctx.createRadialGradient(CX,contactY,0,CX,contactY,90);
    cg.addColorStop(0,rgba(255,210,80,contactFlash*0.88));
    cg.addColorStop(0.45,rgba(255,100,20,contactFlash*0.38));
    cg.addColorStop(1,'rgba(255,40,0,0)');
    ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(CX,contactY,90,0,Math.PI*2); ctx.fill();
  }
  const ballG = ctx.createRadialGradient(CX-2,contactY-2,0,CX,contactY,7);
  const bf = Math.max(0.4, contactFlash);
  ballG.addColorStop(0,rgba(255,220,150,bf)); ballG.addColorStop(1,rgba(200,55,0,bf*0.75));
  ctx.beginPath(); ctx.arc(CX,contactY,6,0,Math.PI*2); ctx.fillStyle=ballG; ctx.fill();
}

function drawGearShadow(ctx) {
  const sg = ctx.createRadialGradient(CX,SOLID_Y+4,8,CX,SOLID_Y+4,R*1.05);
  sg.addColorStop(0,'rgba(0,0,0,0.42)'); sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg; ctx.beginPath();
  ctx.ellipse(CX,SOLID_Y+6,R*0.95,18,0,0,Math.PI*2); ctx.fill();
}

function drawParticles(ctx, particles) {
  for (const p of particles) {
    if (p.type==='spark') {
      const a=p.life;
      const gr=Math.round(p.life*195), gb=Math.round(p.life*55);
      ctx.save(); ctx.strokeStyle=rgba(255,gr,gb,a);
      ctx.lineWidth=1.6; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x-p.vx*p.len*0.22, p.y-p.vy*p.len*0.22);
      ctx.stroke(); ctx.restore();
    } else if (p.type==='ember') {
      const a=p.life*0.82, sz=p.size*(0.5+p.life*0.5);
      const eg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,sz*2.4);
      eg.addColorStop(0,rgba(255,225,120,a)); eg.addColorStop(0.5,rgba(255,75,10,a*0.45));
      eg.addColorStop(1,'rgba(255,20,0,0)');
      ctx.fillStyle=eg; ctx.beginPath();
      ctx.arc(p.x,p.y,sz*2.4,0,Math.PI*2); ctx.fill();
    }
  }
}

function drawTitle(ctx, mood, titleAlpha) {
  if (titleAlpha<=0) return;
  ctx.save(); ctx.globalAlpha=titleAlpha; ctx.textAlign='center';
  // Subtle title glow
  const tg=ctx.createRadialGradient(CX,55,10,CX,55,240);
  tg.addColorStop(0,rgba(mood.acR,mood.acG,mood.acB,0.14)); tg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=tg; ctx.fillRect(0,0,W,200);
  ctx.shadowColor=rgba(mood.acR,mood.acG,mood.acB,0.7); ctx.shadowBlur=16;
  ctx.font='bold 26px Georgia,serif'; ctx.fillStyle='#ffffff';
  ctx.fillText('God He Sees In Mirrors', CX, 44);
  ctx.font='17px Georgia,serif'; ctx.shadowBlur=8;
  ctx.fillStyle=rgba(mood.acR+30,mood.acG+30,mood.acB+30,0.9);
  ctx.fillText('Meshuggah', CX, 66);
  ctx.font='12px "SF Mono",monospace'; ctx.shadowBlur=0;
  ctx.fillStyle='rgba(165,165,165,0.72)';
  ctx.fillText('46/16 Polyrhythm Visualisation', CX, 84);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════
function App() {
  const canvasRef    = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [recMode,  setRecMode]  = useState(false);
  const playRef    = useRef(false);
  const recRef     = useRef(false);
  const offsetRef  = useRef(INITIAL_OFFSET);
  const rotRef     = useRef(INITIAL_ROT);
  const lastTsRef  = useRef(null);
  const actxRef    = useRef(null);
  const partRef    = useRef([]);
  const wobRef     = useRef({x:0,y:0,i:0});
  const dropRef    = useRef({t:0,active:false,landed:false});
  const flashRef   = useRef(0);
  const moodRef    = useRef({...MOODS.orange});
  const noiseRef   = useRef(null);

  const togglePlay = () => {
    if (!actxRef.current) actxRef.current = new (window.AudioContext||window.webkitAudioContext)();
    actxRef.current.resume().then(()=>{ playRef.current=!playRef.current; setPlaying(p=>!p); });
  };
  const doReset = () => {
    playRef.current=false; offsetRef.current=INITIAL_OFFSET; rotRef.current=INITIAL_ROT;
    partRef.current=[]; lastTsRef.current=null; wobRef.current={x:0,y:0,i:0};
    dropRef.current={t:0,active:false,landed:false}; flashRef.current=0;
    moodRef.current={...MOODS.orange}; setPlaying(false);
  };
  const toggleRec = () => { recRef.current=!recRef.current; setRecMode(r=>!r); };

  useEffect(()=>{
    // Build noise texture once
    const nc=document.createElement('canvas'); nc.width=512; nc.height=512;
    const nx=nc.getContext('2d'); const id=nx.createImageData(512,512);
    for(let i=0;i<id.data.length;i+=4){
      const v=Math.floor(Math.random()*255);
      id.data[i]=id.data[i+1]=id.data[i+2]=v;
      id.data[i+3]=Math.floor(Math.random()*18+3);
    }
    nx.putImageData(id,0,0);

    const canvas=canvasRef.current;
    const ctx=canvas.getContext('2d');
    noiseRef.current=ctx.createPattern(nc,'repeat');

    let rafId;
    const loop=(ts)=>{
      // ── physics ──
      if (playRef.current) {
        if (lastTsRef.current!==null) {
          const dt=Math.min((ts-lastTsRef.current)/1000,0.05);
          const prevOff=offsetRef.current, prevRot=rotRef.current;
          offsetRef.current+=SPEED*dt;
          const newOff=offsetRef.current;

          // Drop trigger
          if (prevOff<DROP_TRIGGER && newOff>=DROP_TRIGGER && !dropRef.current.landed)
            dropRef.current={t:0,active:true,landed:false};
          if (dropRef.current.active) {
            dropRef.current.t+=dt;
            if (0.5*GRAVITY*dropRef.current.t**2 >= FLOAT_HEIGHT+LANDED_OFFSET) {
              dropRef.current={t:dropRef.current.t,active:false,landed:true};
              wobRef.current.i=Math.max(wobRef.current.i,14);
            }
          }

          rotRef.current = newOff>=0 ? newOff/R : INITIAL_ROT;
          const newRot=rotRef.current;

          // Current contact Y for particles
          const drop=dropRef.current;
          const fh = drop.landed ? -LANDED_OFFSET
            : drop.active ? Math.max(-LANDED_OFFSET,FLOAT_HEIGHT-0.5*GRAVITY*drop.t**2)
            : FLOAT_HEIGHT;
          const contactY=(CY_LAND-fh)+R;

          if (actxRef.current) {
            const barIdx=Math.floor(newOff/PX_BAR);
            const inBreak=newOff<0||isBreakSection(barIdx);
            for (let i=0;i<hitPhases.length;i++) {
              const ph=hitPhases[i];
              if (Math.floor((prevRot-ph)/(2*Math.PI))!==Math.floor((newRot-ph)/(2*Math.PI))) {
                if (!inBreak) {
                  playNotchBeep(actxRef.current);
                  flashRef.current=1;
                  spawnSparks(partRef.current,CX,contactY,9,false);
                  spawnEmbers(partRef.current,CX,contactY,2);
                  wobRef.current.i=Math.max(wobRef.current.i,4);
                }
              }
            }
            const pb=Math.floor(prevOff/PX_BEAT), nb=Math.floor(newOff/PX_BEAT);
            if (nb!==pb) playMetronome(actxRef.current,((nb%4)+4)%4);
            for (const co of CRASH_OFFSETS) {
              if (prevOff<co && newOff>=co) {
                wobRef.current.i=Math.max(wobRef.current.i,18);
                spawnSparks(partRef.current,CX,contactY,30,true);
                spawnEmbers(partRef.current,CX,contactY,8);
              }
            }
          }
        }
        lastTsRef.current=ts;
      } else { lastTsRef.current=null; }

      // ── update ──
      partRef.current=tickParticles(partRef.current);
      flashRef.current*=0.80;
      const wb=wobRef.current;
      if (wb.i>0.08){ wb.x=(Math.random()-0.5)*wb.i; wb.y=(Math.random()-0.5)*wb.i; wb.i*=0.75; }
      else { wb.x=0; wb.y=0; wb.i=0; }

      // ── mood ──
      const off=offsetRef.current;
      const barIdx=Math.floor(Math.max(0,off)/PX_BAR);
      const sec=getSectionAt(barIdx);
      const tMood=MOODS[getSectionMoodName(sec?.name)];
      moodRef.current=lerpMood(moodRef.current,tMood,0.014);
      const mood=moodRef.current;

      // ── float height & wheelCY ──
      const drop=dropRef.current;
      const floatH=drop.landed ? -LANDED_OFFSET
        : drop.active ? Math.max(-LANDED_OFFSET,FLOAT_HEIGHT-0.5*GRAVITY*drop.t**2)
        : FLOAT_HEIGHT;
      const wheelCY=CY_LAND-floatH;

      // Title alpha
      const titleAlpha=Math.max(0,Math.min(1,-off/PX_BAR));

      // ── render ──
      ctx.save(); ctx.translate(wb.x,wb.y);
      drawBackground(ctx,mood,noiseRef.current,wheelCY);
      drawGearShadow(ctx);
      drawGround(ctx,off,mood);
      drawGear(ctx,wheelCY,rotRef.current,mood,flashRef.current);
      drawParticles(ctx,partRef.current);
      ctx.restore();

      drawTitle(ctx,mood,titleAlpha);

      // REC indicator when active
      if (recRef.current) {
        ctx.save(); ctx.font='bold 11px monospace';
        ctx.fillStyle='rgba(220,30,30,0.85)'; ctx.textAlign='right';
        ctx.fillText('● REC',W-10,18); ctx.restore();
      }

      rafId=requestAnimationFrame(loop);
    };
    rafId=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(rafId);
  },[]);

  const btn={border:'1px solid',cursor:'pointer',fontFamily:'monospace',
    letterSpacing:'0.1em',padding:'7px 0',fontSize:13};

  return (
    <div style={{background:'#050202',position:'relative',userSelect:'none'}}>
      <canvas ref={canvasRef} width={W} height={H}
        style={{display:'block',width:'100%',height:'auto'}}/>
      {!recMode && (
        <div style={{position:'absolute',bottom:12,left:'50%',
          transform:'translateX(-50%)',display:'flex',gap:7,width:'55%'}}>
          <button onClick={togglePlay} style={{...btn,flex:3,
            background:'#0e0804',color:playing?'#ff6622':'#88cc44',
            borderColor:playing?'#662200':'#336611'}}>
            {playing?'⏸  PAUSE':'▶  PLAY'}
          </button>
          <button onClick={doReset} style={{...btn,flex:1,
            background:'#0a0a0a',color:'#555',borderColor:'#222'}}>
            ↺ RESET
          </button>
          <button onClick={toggleRec} style={{...btn,flex:1,
            background:'#100',color:'#833',borderColor:'#300'}}>
            ⏺ REC
          </button>
        </div>
      )}
      {recMode && (
        <button onClick={toggleRec} style={{
          position:'absolute',top:6,right:6,
          background:'rgba(40,0,0,0.7)',color:'#f44',
          border:'1px solid #500',padding:'4px 8px',
          cursor:'pointer',fontFamily:'monospace',fontSize:11}}>
          ■ EXIT REC
        </button>
      )}
    </div>
  );
}

export default App;
export default App;