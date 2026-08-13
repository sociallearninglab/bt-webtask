/*
  ==========================================================================
  BT_v2 — Web (jsPsych) port of the VR ball-throwing task.
  Social Learning Lab @ Stanford.

  FIDELITY NOTES (analogue vs. identity) — read before running participants:
  1. INPUT DIFFERS. VR = a real physical throw; web = a single-button catapult
     (hold = power/depth, release position on the sweep = lateral aim). Both give
     a direction + power, but the motor skill differs. This matters most for the
     U (unmanipulated) condition, whose ABSOLUTE distances will not equal VR's.
  2. DIFFICULTY IS A FREE PARAMETER. The U spread is governed by THROW_TUNING
     constants that have no VR-derived value — calibrate them in piloting.
  3. 2D TOP-DOWN vs VR FIRST-PERSON 3D. Distances/logic are identical; the felt
     perceptual experience is not.
  4. WEAKER EMBODIMENT. The paradigm depends on outcomes feeling attributable to
     one's own ability; a button press affords less agency than a VR throw, which
     could dampen the effect. This is the main theoretical risk to comparability.

  What IS faithful: the manipulation engine (zone sizes, graded successes,
  failure shift-toward-center, failure side by throw direction, distance-from-
  center measure, trial strings) is a direct port of NEW_ball_improvement.py.
  Best-comparable contrast is improvement vs stochastic (S/F); U is an analogue
  requiring calibration.
  ==========================================================================
*/

/* ===================== COERCION ENGINE (port of TrialManager) ===================== */
const SUCCESS_ZONE_SIZES = [1.2, 0.9, 0.6, 0.3];
const FAILURE_ZONE_RIGHT_X_RANGE = [-5, -4];
const FAILURE_ZONE_LEFT_X_RANGE  = [ 4,  5];
const FAILURE_ZONE_Y_RANGE = [-1.5, 1.5];
const SHIFT_PER_FAILURE = 0.5;
function uniform(a,b){return a + Math.random()*(b-a);}

class TrialManager{
  constructor(structure,condition){
    this.structure=structure; this.condition=condition;
    this.currentTrial=0; this.trialCount=0;
    this.successZoneSizes=SUCCESS_ZONE_SIZES;
    this.initR=FAILURE_ZONE_RIGHT_X_RANGE.slice();
    this.initL=FAILURE_ZONE_LEFT_X_RANGE.slice();
    this.failY=FAILURE_ZONE_Y_RANGE.slice();
  }
  getCurrentTrialType(){return this.currentTrial>=this.structure.length?null:this.structure[this.currentTrial];}
  _count(ch){let n=0;for(let i=0;i<=this.currentTrial&&i<this.structure.length;i++)if(this.structure[i]===ch)n++;return n;}
  getSuccessZoneSize(){const c=this._count('S');return this.successZoneSizes[Math.min(c-1,this.successZoneSizes.length-1)];}
  getFailureZoneRanges(){
    const fc=this._count('F');
    const maxShift=Math.min(Math.abs(this.initR[1])-1.0, Math.abs(this.initL[0])-1.0);
    const shift=Math.min(fc*SHIFT_PER_FAILURE,maxShift);
    let rMin=Math.max(this.initR[0]+shift,-5.0), rMax=Math.min(this.initR[1]+shift,-1.0);
    let lMin=Math.max(this.initL[0]-shift, 1.0), lMax=Math.min(this.initL[1]-shift, 5.0);
    return {right:[rMin,rMax], left:[lMin,lMax]};
  }
  generateTargetPoint(throwDirX){
    const t=this.getCurrentTrialType();
    if(t==='S'){
      const angle=uniform(0,2*Math.PI); let radius;
      if(this.condition==='improvement'){
        const c=this._count('S');
        if(c<this.successZoneSizes.length) radius=uniform(this.successZoneSizes[c],this.successZoneSizes[c-1]);
        else radius=uniform(0,this.successZoneSizes[this.successZoneSizes.length-1]);
      }else{ radius=uniform(0,this.getSuccessZoneSize()); }
      return {x:radius*Math.cos(angle), y:radius*Math.sin(angle), z:0};
    }else{
      const {right,left}=this.getFailureZoneRanges();
      const x = throwDirX<0 ? uniform(right[0],right[1]) : uniform(left[0],left[1]);
      const y = uniform(this.failY[0],this.failY[1]);
      return {x,y,z:0};
    }
  }
  advanceTrial(){this.currentTrial++;this.trialCount++;}
}
function euclideanFromCenter(p){return Math.sqrt(p.x*p.x+p.y*p.y);}

/* ===================== CONFIG ===================== */
/* PILOTING (remote): condition is assigned automatically (balanced via DataPipe
   when configured, else random per device). No picker. Data uploads to DataPipe/
   OSF at the end. Set DATAPIPE_ID to your DataPipe experiment ID to enable both
   balanced assignment and server upload. */
// TODO(prolific): replace with your study's actual completion URL (Prolific
// gives you this per-study, e.g. https://app.prolific.com/submissions/complete?cc=XXXXXXXX)
const PROLIFIC_REDIRECT_URL = "https://app.prolific.com/submissions/complete?cc=REPLACE_ME";

const BT_CONFIG = {
  practiceThrows: 2,
  TESTING: false,                // false = pilot (no picker/replay). true = testing picker.
  DATAPIPE_ID: "l4vuPmnrCh5F",   // DataPipe experiment ID (OSF project j8fxt)
  NUM_CONDITIONS: 3
};
// auto participant id: clean local timestamp so files sort in play order and
// never collide. Format: BT_WEB_YYYYMMDD_HHMMSS_<rand> (e.g. BT_WEB_20260724_1532_ab3)
BT_CONFIG.participant = (function(){
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  const stamp=`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand=Math.random().toString(36).slice(2,5);
  return `BT_WEB_${stamp}_${rand}`;
})();
// Prolific recruitment params (present only when launched from a Prolific study URL).
// Filename/participant id stay stamp-based (for sort order); these are recorded
// separately and used only to redirect back to Prolific on completion.
const PROLIFIC_PARAMS = (function(){
  const p = new URLSearchParams(window.location.search);
  return {
    prolific_pid: p.get('PROLIFIC_PID') || '',
    study_id: p.get('STUDY_ID') || '',
    session_id: p.get('SESSION_ID') || ''
  };
})();
// Proof of Human bot-detection (tracker script tag lives in index.html). Tag the
// session with the same ID used elsewhere (Prolific PID if present, else our
// stamp-based participant id) so a flagged session on the PoH dashboard can be
// cross-referenced back to this participant's data. setRoundtableUserId must be
// called after the tracker signals it's ready (roundtable:ready).
window.addEventListener('roundtable:ready', function(){
  if(typeof window.setRoundtableUserId==='function'){
    window.setRoundtableUserId(PROLIFIC_PARAMS.prolific_pid || BT_CONFIG.participant);
  }
});

const CONDITIONS = ["improvement","stochastic","unmanipulated"];
const STRUCTURES = { improvement:"FFFSSSS", stochastic:"SSFFSFS", unmanipulated:"UUUUUUU" };


/* -------------------------------------------------------------------------
   SLINGSHOT / CATAPULT THROW (Angry Birds style) — same across ALL conditions:
     • DRAG the ball back from the catapult (mouse/touch). The drag vector sets
       BOTH power and aim: pull length -> power (bigger arc, further), pull
       side-to-side -> aim (left/right). Release to launch; the ball flies a big
       arc down the lane.
     • The catapult BASE SWAYS/ROTATES while you aim, so your effective launch
       direction drifts — you must time the release. This adds the "unknown".
   For U trials the released power+aim (plus the sway at release) compute the REAL
   landing (genuine skill). For S/F trials the same drag is performed but the
   landing is COERCED by the engine; power still drives the visible arc height and
   the aim (plus sway) still picks the failure side, so it feels identical.

   Constants are TUNABLE for piloting. They only affect U (real skill);
   S/F outcomes come from the coercion engine regardless.
   ------------------------------------------------------------------------- */
const THROW_TUNING = {
  // pull-back -> power/aim
  MAX_PULL_PX: 95,         // drag length (px) that = full power (fits in-frame)
  PERFECT_PULL: 0.62,      // fraction of full pull that yields zero depth error
  DEPTH_PER_POWER: 16.0,   // world-units depth error per unit of power off perfect
  AIM_MAX: 1.4,            // max |aim| at full sideways pull (wider = no "wall")
  LATERAL_MAX: 5.0,        // world-units lateral error at aim extremes
  // realism / hiding coercion
  RELEASE_NOISE: 0.55,     // per-throw release imprecision (world units), ALL conditions
  SKILL_NOISE: 0.22,       // extra motor noise on real (U/practice) throws
  // catapult wobble (LARGE). Affects aim on real (U/practice) throws via the sway
  // value at the moment of release. On coerced S/F it is visual only (can't move
  // a predetermined landing).
  SWAY_MS: 1500,           // handle (bottom) wobble period
  SWAY_VISUAL: 0.9,        // how far the handle visually rocks (big)
  SWAY_AIM: 0.6,           // how much release-moment wobble perturbs real-throw aim
  // prongs (top) wobble independently at the joint — different period & amount,
  // so the top and bottom lean in different ways (floppy/whipping look)
  PRONG_MS: 950,           // prong wobble period (different from handle)
  PRONG_VISUAL: 0.7,       // how far the prongs flex relative to the handle
  // flight / roll
  FLIGHT_MS: 1050,         // time in the air
  ROLL_MS: 650,            // time rolling after landing
  ROLL_DIST: 1.4           // world-units the ball rolls forward past landing
};

/* ===================== FIELD RENDER + CATAPULT THROW ===================== */
const FIELD = { w:900, h:620 };
/* ---- 3D perspective renderer (first-person lane, matches the VR image) ----
   World ground coords: x = lateral (left/right, target center line = 0),
   d = depth away from camera (larger = farther). project() maps a ground point
   to screen with perspective foreshortening. The target ring lies flat on the
   ground at RING_D; a landing's error (x lateral, y depth) places the ball on
   the ground near/in the ring. Depth (short/long) reads as near/past the ring. */
const VIEW = {
  horizon: FIELD.h*0.30,     // ground meets far wall here
  lateralScale: 95,          // px-per-world-unit near camera (converges with depth)
  camK: 6.0,                 // perspective falloff constant
  worldHalfX: 7.0,           // walls at +-7 (as in VR)
  dNear: 0.5, dFar: 26,
  wallColorL:'#b07a42', wallColorD:'#9c6a38', // wood planks
  grassL:'#4a9e3f', grassD:'#3c8a34'
};
const RING_D = 9.0;          // depth of the target ring center
const THROWER_D = 1.8;       // where the ball starts (near camera; higher = more pull room)

function project(x, d){
  const dd = Math.max(d, 0.05);
  const scale = VIEW.camK/(dd+VIEW.camK);
  const sy = FIELD.h - (FIELD.h - VIEW.horizon)*(dd/(dd+VIEW.camK));
  const sx = FIELD.w/2 + x*VIEW.lateralScale*scale;
  return {sx, sy, scale};
}

function drawScene(ctx){
  const W=FIELD.w, H=FIELD.h;
  const lane=VIEW.worldHalfX, wallTopWorld=3.2; // wall height in world units
  // black void (top)
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);

  // ground plane as receding grass depth-bands (near = wide, far = narrow)
  const bands=30;
  for(let i=0;i<bands;i++){
    const d0=VIEW.dNear + (VIEW.dFar-VIEW.dNear)*(i/bands);
    const d1=VIEW.dNear + (VIEW.dFar-VIEW.dNear)*((i+1)/bands);
    const a=project(-lane,d0), b=project(lane,d0), c=project(lane,d1), e=project(-lane,d1);
    ctx.fillStyle = i%2 ? VIEW.grassD : VIEW.grassL;
    ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.lineTo(c.sx,c.sy); ctx.lineTo(e.sx,e.sy); ctx.closePath(); ctx.fill();
  }
  // lengthwise mowing stripes (subtle lighter columns)
  const cols=6;
  for(let cI=0;cI<cols;cI++){
    if(cI%2) continue;
    const xL=-lane + (2*lane)*(cI/cols), xR=-lane + (2*lane)*((cI+1)/cols);
    const n0=project(xL,VIEW.dNear), n1=project(xR,VIEW.dNear);
    const f0=project(xL,VIEW.dFar), f1=project(xR,VIEW.dFar);
    ctx.fillStyle='rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.moveTo(n0.sx,n0.sy); ctx.lineTo(n1.sx,n1.sy); ctx.lineTo(f1.sx,f1.sy); ctx.lineTo(f0.sx,f0.sy); ctx.closePath(); ctx.fill();
  }

  // side walls: quads rising from the ground edge to wall-top, near->far
  function sideWall(sign, color){
    const nb=project(sign*lane,VIEW.dNear), fb=project(sign*lane,VIEW.dFar);
    const nTop = nb.sy - wallTopWorld*VIEW.lateralScale*nb.scale;
    const fTop = fb.sy - wallTopWorld*VIEW.lateralScale*fb.scale;
    ctx.fillStyle=color;
    ctx.beginPath(); ctx.moveTo(nb.sx,nb.sy); ctx.lineTo(fb.sx,fb.sy);
    ctx.lineTo(fb.sx,fTop); ctx.lineTo(nb.sx,nTop); ctx.closePath(); ctx.fill();
    // plank seams (vertical-ish, receding)
    ctx.strokeStyle='rgba(0,0,0,0.13)'; ctx.lineWidth=1;
    for(let k=1;k<6;k++){ const t=k/6;
      const bx=nb.sx+(fb.sx-nb.sx)*t, by=nb.sy+(fb.sy-nb.sy)*t;
      const ty=nTop+(fTop-nTop)*t;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,ty); ctx.stroke(); }
  }
  sideWall(-1, VIEW.wallColorL);
  sideWall(1, VIEW.wallColorD);

  // far (back) wall: spans the lane at dFar, sitting on the ground
  const fL=project(-lane,VIEW.dFar), fR=project(lane,VIEW.dFar);
  const backTop = fL.sy - wallTopWorld*VIEW.lateralScale*fL.scale;
  ctx.fillStyle=VIEW.wallColorD;
  ctx.beginPath(); ctx.moveTo(fL.sx,fL.sy); ctx.lineTo(fR.sx,fR.sy);
  ctx.lineTo(fR.sx,backTop); ctx.lineTo(fL.sx,backTop); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.13)'; ctx.lineWidth=1;
  for(let k=1;k<5;k++){ const x=fL.sx+(fR.sx-fL.sx)*(k/5);
    ctx.beginPath(); ctx.moveTo(x,fL.sy); ctx.lineTo(x,backTop); ctx.stroke(); }

  // center line (solid white), thrower -> far wall
  const cl0=project(0,VIEW.dNear), cl1=project(0,VIEW.dFar);
  ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(2, 5*cl0.scale);
  ctx.beginPath(); ctx.moveTo(cl0.sx,cl0.sy); ctx.lineTo(cl1.sx,cl1.sy); ctx.stroke();

  // dashed white target ring, flat on the ground at RING_D (radius 1.2)
  drawGroundRing(ctx, 0, RING_D, 1.2, true);
}

/* Void scene for PRACTICE throws: empty neutral space, no field/walls/target.
   The ball flies off into the distance and disappears. */
function drawVoid(ctx){
  const W=FIELD.w, H=FIELD.h;
  // soft vertical gradient (light space), so it reads as "nowhere" not the field
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#dfe6ea'); g.addColorStop(1,'#c2ccd2');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // faint ground shadow under the thrower so the catapult sits on something
  const base=project(0,THROWER_D);
  ctx.fillStyle='rgba(0,0,0,0.06)';
  ctx.beginPath(); ctx.ellipse(base.sx, base.sy+22, 60, 14, 0,0,2*Math.PI); ctx.fill();
}

/* draw an ellipse on the ground plane by projecting points around a world circle */
function drawGroundRing(ctx, cx, cd, r, dashed){
  ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; if(dashed) ctx.setLineDash([8,7]);
  ctx.beginPath();
  for(let a=0;a<=Math.PI*2+0.01;a+=Math.PI/40){
    const wx=cx+Math.cos(a)*r, wd=cd+Math.sin(a)*r;
    const p=project(wx,wd);
    a===0?ctx.moveTo(p.sx,p.sy):ctx.lineTo(p.sx,p.sy);
  }
  ctx.stroke(); ctx.setLineDash([]);
}

/* ball drawn at ground position (x lateral, d depth) with perspective size */
function drawBall3D(ctx, x, d, airH){
  const p=project(x,d);
  const r=Math.max(4, 26*p.scale);
  const lift=(airH||0)*p.scale*140; // arc height lifts ball on screen
  const cy=p.sy - r*0.4 - lift;
  // soft shadow on ground
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(p.sx, p.sy, r*0.9, r*0.4, 0,0,2*Math.PI); ctx.fill();
  // red ball with a light seam like the VR ball
  ctx.beginPath(); ctx.arc(p.sx, cy, r, 0,2*Math.PI); ctx.fillStyle='#e12d28'; ctx.fill();
  ctx.strokeStyle='#8e1b18'; ctx.lineWidth=Math.max(1,2*p.scale); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=Math.max(1,1.5*p.scale);
  ctx.beginPath(); ctx.ellipse(p.sx, cy, r*0.55, r, 0,0,2*Math.PI); ctx.stroke();
}

/* convert an engine/real landing {x,y} into ground coords for rendering.
   x = lateral (unchanged). y = depth error: +y overshoot (past ring, larger d),
   -y undershoot (short, smaller d). Ring sits at RING_D. */
function landingToGround(l){
  return _l2g_clamped(l);
}
// unclamped version: exact ground position, no field bounds (used for practice void)
function landingToGroundRaw(l){
  return { x: l.x, d: Math.max(THROWER_D+0.3, RING_D + l.y) };
}
function _l2g_clamped(l){
  const gx = l.x;
  const gd = RING_D + l.y;          // +y => beyond ring; -y => short of ring
  // Only clamp to keep it drawable on the field; allow big over/undershoots and
  // wide misses so there is no obvious invisible "wall".
  return { x: Math.max(-VIEW.worldHalfX+0.3, Math.min(VIEW.worldHalfX-0.3, gx)),
           d: Math.max(THROWER_D+0.3, Math.min(VIEW.dFar-1, gd)) };
}

// approx-normal noise via summed uniforms, mean 0, ~unit-ish scale
function noise(){ return (uniform(-1,1)+uniform(-1,1)+uniform(-1,1))/1.5; }

/* Release imprecision applied to EVERY throw (all conditions) so no throw ever
   looks laser-exact. On U it adds to real skill noise; on S/F it scatters the
   coerced landing slightly and shapes the flight, hiding the manipulation. */
function applyReleaseNoise(landing){
  const T=THROW_TUNING;
  return { x: landing.x + noise()*T.RELEASE_NOISE,
           y: landing.y + noise()*T.RELEASE_NOISE };
}

/* Compute the REAL (unmanipulated) landing from the participant's control.
     power  in [0,1]  (pull length / MAX_PULL_PX, clamped)
     aim    in [-AIM_MAX, AIM_MAX]  (sideways pull + base sway at release; 0 = straight)
   Returns {x, y} in world units, errors relative to target center.
   depth error: power below PERFECT_PULL = short (undershoot),
                power above = long (overshoot). */
function realLandingFromControl(power, aim){
  const T = THROW_TUNING;
  const depthErr   = (power - T.PERFECT_PULL)*T.DEPTH_PER_POWER + noise()*T.SKILL_NOISE;
  const lateralErr = aim*T.LATERAL_MAX + noise()*T.SKILL_NOISE;
  return { x: lateralErr, y: depthErr };
}

/* runThrow(ctx, opts)
   opts.getOutcome(aim, power) -> {x,y}   // decides landing at release
   opts.onDone(result)
   Angry-Birds slingshot: press on/near the ball, DRAG BACK (down/opposite the
   throw), release to launch. Pull length -> power; sideways pull -> aim. The
   catapult BASE SWAYS while aiming, and the sway at release is added to aim, so
   the effective direction drifts and the player must time the release.
   Faithful order: release -> read pull (power) + aim (pull + sway) -> outcome. */
function runThrow(ctx, opts){
  const sub=document.getElementById('bt-sub');
  const T=THROW_TUNING;
  let raf=null, phase='ready', t0=0, flyStart=0, rollStart=0;
  let dragging=false, dragDX=0, dragDY=0;         // drag delta from anchor (px)
  let swayNow=0;
  // The catapult holds perfectly still until the participant starts pulling the
  // ball back; wobble begins at that moment. swayStart is stamped in startDrag.
  // swayPhase/prongPhase (radians) and the +-1 signs are re-randomized on every
  // throw at that moment too, so the wobble doesn't always start moving the same
  // way — it can begin leaning either direction, at any point in its cycle.
  let swayStart=null;
  let swayPhase=0, prongPhase0=0, swaySign=1, prongSign=1;
  let scoredLanding=null, visualLanding=null, resultAim=0, resultPower=0, resultHoldMs=null;
  // trajectory (computed once at release, so flight is a single smooth curve)
  let flightStart=null, landPoint=null, finalPoint=null, apexH=0, finalWorld=null;
  let releaseScreen=null, lastCat=null, dragOrigin=null, holdStart=null;   // ball screen pos at release; last fork pos; drag origin; pull start time
  const anchor=project(0,THROWER_D);              // ball rest position (screen px)

  function baseSway(now){
    if(swayStart===null) return 0;                 // still until the pull begins
    return swaySign*Math.sin(((now-swayStart)%T.SWAY_MS)/T.SWAY_MS*2*Math.PI + swayPhase);
  }

  // clamped pull vector (never exceeds MAX_PULL_PX), so the ball never leaves the frame
  function clampedPull(){
    const len=Math.sqrt(dragDX*dragDX+dragDY*dragDY);
    if(len<=T.MAX_PULL_PX) return {dx:dragDX, dy:dragDY, len};
    const s=T.MAX_PULL_PX/len;
    return {dx:dragDX*s, dy:dragDY*s, len:T.MAX_PULL_PX};
  }

  // Draw the slingshot FRAME (fixed part): a handle rising from the ground that
  // splits into two prongs forming a V opening toward the field. The whole frame
  // rocks with the sway. Returns the two prong TIPS (where the bands anchor) and
  // the rest position of the pouch (between the prongs).
  function drawCatapult(ctx, swayShift){
    const cxp=anchor.sx, groundY=anchor.sy+24;
    const handleTilt=swayShift*T.SWAY_VISUAL;  // BOTTOM: handle rocks (drives aim too)
    // TOP: prongs flex at the joint on their OWN oscillator (different period/phase),
    // so the top and bottom lean independently — a floppy, whipping wobble. Held
    // still until the participant starts pulling back (swayStart set in startDrag).
    const prongPhase = swayStart===null ? 0
      : prongSign*Math.sin(((performance.now()-swayStart)%T.PRONG_MS)/T.PRONG_MS*2*Math.PI + prongPhase0);
    const prongTilt=handleTilt + prongPhase*T.PRONG_VISUAL;  // relative to the handle
    const handleH=40;                          // handle from ground to the split
    // split/joint point (end of the handle) — governed by the handle tilt
    const sxp = cxp + Math.sin(handleTilt)*handleH;
    const syp = groundY - Math.cos(handleTilt)*handleH;
    // handle
    ctx.strokeStyle='#4a3115'; ctx.lineWidth=11; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(cxp, groundY); ctx.lineTo(sxp, syp); ctx.stroke();
    // two prongs forming a V, hinged at the joint, using the PRONG tilt
    const prongLen=40, spread=0.5;             // spread = half-angle of the V (radians)
    const laTip={ x: sxp + Math.sin(prongTilt-spread)*prongLen, y: syp - Math.cos(prongTilt-spread)*prongLen };
    const raTip={ x: sxp + Math.sin(prongTilt+spread)*prongLen, y: syp - Math.cos(prongTilt+spread)*prongLen };
    ctx.strokeStyle='#5a3a1a'; ctx.lineWidth=9; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(sxp,syp); ctx.lineTo(laTip.x,laTip.y);
    ctx.moveTo(sxp,syp); ctx.lineTo(raTip.x,raTip.y); ctx.stroke();
    // prong tips (little caps)
    ctx.fillStyle='#5a3a1a';
    ctx.beginPath(); ctx.arc(laTip.x,laTip.y,5,0,2*Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(raTip.x,raTip.y,5,0,2*Math.PI); ctx.fill();
    // base feet
    ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(cxp-16,groundY+6); ctx.lineTo(cxp+16,groundY+6); ctx.stroke();
    // pouch rest position: midpoint between the prong tips (ball sits here at rest)
    const pouchRest={ x:(laTip.x+raTip.x)/2, y:(laTip.y+raTip.y)/2 };
    return { forkL:laTip, forkR:raTip, cx:pouchRest.x, cy:pouchRest.y, split:{x:sxp,y:syp} };
  }

  // Draw the pouch cradling the ball at screen position (bx,by), with the ball
  // radius r. The pouch is a small curved cradle under/around the ball.
  function drawPouch(ctx, bx, by, r){
    ctx.strokeStyle='#6b4a26'; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(bx, by, r+2, 0.15*Math.PI, 0.85*Math.PI, false); ctx.stroke();
  }

  function loop(now){
    ctx.clearRect(0,0,FIELD.w,FIELD.h);
    if(opts.voidMode){ drawVoid(ctx); } else { drawScene(ctx); }
    swayNow = baseSway(now);

    if(phase==='aiming'){
      const cat=drawCatapult(ctx, swayNow);
      lastCat=cat;
      if(dragging){
        const pull=clampedPull();
        const bx=cat.cx+pull.dx, by=Math.min(cat.cy+pull.dy, FIELD.h-24);
        // elastic bands from each prong tip to the pouch — they visibly stretch
        // taut as you pull the pouch back. Width thins slightly as they stretch.
        const stretch=Math.min(pull.len/T.MAX_PULL_PX,1);
        ctx.strokeStyle='#8a5a2c'; ctx.lineWidth=Math.max(2.5, 5-stretch*2); ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(cat.forkL.x,cat.forkL.y); ctx.lineTo(bx-6,by);
        ctx.moveTo(cat.forkR.x,cat.forkR.y); ctx.lineTo(bx+6,by); ctx.stroke();
        // pouch cradling the ball, then the ball on top
        drawPouch(ctx, bx, by, 15);
        const grd=ctx.createRadialGradient(bx-4,by-4,2,bx,by,15);
        grd.addColorStop(0,'#ff5b52'); grd.addColorStop(1,'#c21f1a');
        ctx.beginPath(); ctx.arc(bx,by,15,0,2*Math.PI); ctx.fillStyle=grd; ctx.fill();
        ctx.strokeStyle='#8e1b18'; ctx.lineWidth=2; ctx.stroke();
        sub.textContent='Drag back to aim and power up — release to launch.';
      } else {
        // ball resting in the pouch between the prongs, bands slack
        ctx.strokeStyle='#8a5a2c'; ctx.lineWidth=5; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(cat.forkL.x,cat.forkL.y); ctx.lineTo(cat.cx-6,cat.cy);
        ctx.moveTo(cat.forkR.x,cat.forkR.y); ctx.lineTo(cat.cx+6,cat.cy); ctx.stroke();
        drawPouch(ctx, cat.cx, cat.cy, 15);
        drawBallScreen(cat.cx, cat.cy, 15);
        sub.textContent='Press on the ball and drag back to launch.';
      }
    } else if(phase==='fly'){
      if(opts.voidMode){ drawVoid(ctx); drawCatapult(ctx, swayNow); }
      else drawCatapult(ctx, swayNow);
      const p=Math.min((now-flyStart)/T.FLIGHT_MS,1);
      const travel=1-Math.pow(1-p,1.7);
      const cx=flightStart.x+(landPoint.x-flightStart.x)*travel;
      const cd=flightStart.d+(landPoint.d-flightStart.d)*travel;
      const airH=apexH*(4*p*(1-p));
      // projected screen position on the trajectory
      const pr=project(cx,cd);
      const r=Math.max(4,26*pr.scale);
      let sx=pr.sx, sy=pr.sy - r*0.4 - airH*pr.scale*140;
      // blend from the actual release (sling) screen point onto the trajectory over
      // the first part of flight, so launch is continuous (no teleport to the fork).
      // VERTICAL ONLY: the trajectory's lateral origin now matches the release
      // position (flightStart.x), so sx needs no blend — blending it caused the
      // sideways "wall"/snap on hard left/right pulls. We still ease sy from the
      // pulled-down sling height onto the arc so the launch reads continuously.
      if(releaseScreen && p<0.18){
        const b=p/0.18;                 // 0..1
        sy = releaseScreen.y + (sy-releaseScreen.y)*b;
      }
      const alpha = (opts.voidMode && p>0.35) ? Math.max(0,1-(p-0.35)/0.3) : 1;
      drawBallAtScreen(sx, sy, r, alpha);
      if(p>=1){
        if(opts.voidMode){ phase='done'; cleanup();
          opts.onDone({landing:scoredLanding, dist:euclideanFromCenter(scoredLanding),
                       aim:resultAim, power:resultPower, holdMs:resultHoldMs,
                       landingPoint:visualLanding, finalPoint:visualLanding});
          return;
        }
        phase='roll'; rollStart=now;
      }
    } else if(phase==='roll'){
      drawCatapult(ctx, swayNow);
      const p=Math.min((now-rollStart)/T.ROLL_MS,1);
      const ease=1-Math.pow(1-p,2);           // decelerating roll
      const cx=landPoint.x+(finalPoint.x-landPoint.x)*ease;
      const cd=landPoint.d+(finalPoint.d-landPoint.d)*ease;
      drawBall3D(ctx, cx, cd, 0);             // on the ground, no arc height
      if(p>=1){ phase='done'; cleanup();
        opts.onDone({landing:scoredLanding, dist:euclideanFromCenter(scoredLanding),
                     aim:resultAim, power:resultPower, holdMs:resultHoldMs,
                     landingPoint:visualLanding, finalPoint:finalWorld});
        return; }
    }
    raf=requestAnimationFrame(loop);
  }

  // draw the ball at an explicit screen position (used during flight, with the
  // launch blend) — same look as drawBall3D but without re-projecting.
  function drawBallAtScreen(sx, sy, r, alpha){
    ctx.globalAlpha = alpha==null?1:alpha;
    // shadow roughly under it
    ctx.fillStyle='rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(sx, sy+r*0.9, r*0.9, r*0.4, 0,0,2*Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, r, 0,2*Math.PI); ctx.fillStyle='#e12d28'; ctx.fill();
    ctx.strokeStyle='#8e1b18'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(sx, sy, r*0.55, r, 0,0,2*Math.PI); ctx.stroke();
    ctx.globalAlpha=1;
  }

  // simple flat screen-space ball (used at rest / in the sling)
  function drawBallScreen(x,y,r){
    const grd=ctx.createRadialGradient(x-4,y-4,2,x,y,r);
    grd.addColorStop(0,'#ff5b52'); grd.addColorStop(1,'#c21f1a');
    ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI); ctx.fillStyle=grd; ctx.fill();
    ctx.strokeStyle='#8e1b18'; ctx.lineWidth=2; ctx.stroke();
  }

  // pull length (px) -> power fraction; pull is "back", so power ~ how far dragged
  function currentPower(){
    const len=Math.min(Math.sqrt(dragDX*dragDX+dragDY*dragDY), T.MAX_PULL_PX);
    return len / T.MAX_PULL_PX;                       // 0..1
  }
  // aim = sideways launch direction. Slingshot: pulling the ball LEFT launches it
  // RIGHT, so launch aim is opposite the horizontal drag. The catapult wobble at
  // the MOMENT OF RELEASE perturbs the aim (big wobble = harder to aim straight).
  function currentAim(){
    const lateralPull = -dragDX / T.MAX_PULL_PX;      // drag left (dragDX<0) => aim right (+)
    let aim = Math.max(-1.4, Math.min(1.4, lateralPull)) * T.AIM_MAX/1.4;
    aim += swayNow * T.SWAY_AIM;                       // wobble-at-release drift
    return Math.max(-T.AIM_MAX, Math.min(T.AIM_MAX, aim));
  }

  function startDrag(px,py){
    if(phase!=='aiming') return;
    // start if the press is near the resting ball (which sits in the pouch, up in
    // the prongs) — use the last drawn pouch position, fall back to anchor.
    const rest = lastCat ? {x:lastCat.cx, y:lastCat.cy} : {x:anchor.sx, y:anchor.sy};
    const d=Math.sqrt((px-rest.x)**2+(py-rest.y)**2);
    if(d>110) return;
    dragOrigin={x:rest.x, y:rest.y};        // fixed origin for this drag (no sway jitter)
    dragging=true; dragDX=px-dragOrigin.x; dragDY=py-dragOrigin.y;
    holdStart=performance.now();            // start of this hold, for hold-duration logging
    if(swayStart===null){
      swayStart=performance.now();   // begin wobble on first pull
      // randomize phase/direction each throw so the wobble doesn't always start
      // the same way (e.g. always leaning right first)
      swayPhase=Math.random()*2*Math.PI;
      prongPhase0=Math.random()*2*Math.PI;
      swaySign=Math.random()<0.5 ? -1 : 1;
      prongSign=Math.random()<0.5 ? -1 : 1;
    }
  }
  function moveDrag(px,py){ if(!dragging||!dragOrigin) return;
    dragDX=px-dragOrigin.x; dragDY=py-dragOrigin.y;
    // only allow pulling BACK (downward on screen) and sideways; ignore forward push
    if(dragDY<0) dragDY=0; }
  function endDrag(){
    if(!dragging) return; dragging=false;
    if(currentPower()<0.06){ return; }   // trivial pull: ignore, let them try again
    resultAim=currentAim(); resultPower=currentPower();
    resultHoldMs = holdStart!=null ? Math.round(performance.now()-holdStart) : null;
    const out=opts.getOutcome(resultAim, resultPower);  // {scored, visual}
    scoredLanding=out.scored; visualLanding=out.visual;
    // capture the ball's ACTUAL screen position in the sling at release, so the
    // flight starts exactly there (no teleport/jump to the fork center).
    const cat=lastCat || {cx:anchor.sx, cy:anchor.sy};
    const pull=clampedPull();
    releaseScreen={ x:cat.cx+pull.dx, y:Math.min(cat.cy+pull.dy, FIELD.h-24) };
    // Compute the WHOLE trajectory now, once, so the flight is one smooth curve
    // (no mid-flight correction/jump). Fly from the fork to the landing, then roll.
    // Start the curve at the ball's ACTUAL lateral release position (not screen
    // center). Previously flightStart.x was hardcoded to 0, so on a hard sideways
    // pull the launch-blend had to yank the ball from the sling back to a
    // center-origin curve — that lateral snap is the "wall". Invert project()'s
    // lateral term at the thrower depth to recover the release world-x.
    const _relScale = VIEW.camK/(THROWER_D+VIEW.camK);
    const _relWorldX = releaseScreen ? (releaseScreen.x - FIELD.w/2)/(VIEW.lateralScale*_relScale) : 0;
    flightStart={ x:_relWorldX, d:THROWER_D };
    if(opts.voidMode){
      // PRACTICE = identical to an unmanipulated (U) throw: real skill decides the
      // landing (visualLanding already came from realLandingFromControl). Use the
      // UNCLAMPED ground position so a hard sideways throw flies straight off — no
      // field bounds, no "wall". Then it keeps going and fades out.
      const g=landingToGroundRaw(visualLanding);
      landPoint={ x:g.x, d:g.d };
      apexH=1.1 + resultPower*1.6;                       // same arc as U
      // fly a bit past the landing so it sails off into the void
      finalWorld={ x:visualLanding.x*1.6, y:visualLanding.y + 6 };
      finalPoint=landingToGroundRaw(finalWorld);
    } else {
      landPoint=landingToGround(visualLanding);
      apexH=1.1 + resultPower*1.6;                       // arc height by power
      // roll: continue forward (away from thrower) a bit, scaled by power
      finalWorld={ x:visualLanding.x, y:visualLanding.y + T.ROLL_DIST*(0.5+resultPower*0.7) };
      finalPoint=landingToGround(finalWorld);
    }
    phase='fly'; flyStart=performance.now();
  }

  function canvasXY(e){
    const rect=ctx.canvas.getBoundingClientRect();
    const scaleX=ctx.canvas.width/rect.width, scaleY=ctx.canvas.height/rect.height;
    const cx=(e.touches?e.touches[0].clientX:e.clientX)-rect.left;
    const cy=(e.touches?e.touches[0].clientY:e.clientY)-rect.top;
    return [cx*scaleX, cy*scaleY];
  }
  function pDown(e){ e.preventDefault(); const [x,y]=canvasXY(e); startDrag(x,y); }
  function pMove(e){ if(!dragging) return; e.preventDefault(); const [x,y]=canvasXY(e); moveDrag(x,y); }
  function pUp(e){ e.preventDefault(); endDrag(); }
  function cleanup(){ cancelAnimationFrame(raf);
    ctx.canvas.removeEventListener('pointerdown',pDown);
    window.removeEventListener('pointermove',pMove);
    window.removeEventListener('pointerup',pUp); }

  ctx.canvas.addEventListener('pointerdown',pDown);
  window.addEventListener('pointermove',pMove);
  window.addEventListener('pointerup',pUp);
  phase='aiming'; t0=performance.now(); raf=requestAnimationFrame(loop);
}

/* ===================== TIMELINE ===================== */
/* Build a VR-style .txt from the collected throw trials, matching the format of
   the VR study's BT_Prereg_*.txt files (CRLF line endings, per-trial blocks).
   Practice (warmup) throws are included as UNMANIPULATED, as in VR. Coordinates
   use the scored landing: point = [lateral_x, depth_y, 0]; distance from origin
   = hypot. Web has no separate roll-up physics, so LANDING POINT == TARGET POINT
   == ACTUAL FINAL POSITION (the scored landing). */
function buildVRText(){
  const CRLF='\r\n';
  const rows=jsPsych.data.get().filter({trial_kind:'throw'}).values();
  const cond=(SESSION.condition||"").toUpperCase();
  const struct=SESSION.structure||"";
  let out=`PARTICIPANT: ${BT_CONFIG.participant}${CRLF}`;
  if(PROLIFIC_PARAMS.prolific_pid){
    out+=`PROLIFIC_PID: ${PROLIFIC_PARAMS.prolific_pid}${CRLF}STUDY_ID: ${PROLIFIC_PARAMS.study_id}${CRLF}SESSION_ID: ${PROLIFIC_PARAMS.session_id}${CRLF}`;
  }
  out+=`CONDITION: ${cond}${CRLF}TEMPORAL PATTERN: ${struct}${CRLF}${CRLF}`;
  // warmup block first (labeled as warmup practice), then recorded trials
  let warmN=0, recN=0;
  rows.forEach(r=>{
    const scoredPt=`[${r.landing_x}, ${r.landing_y}, 0]`;          // scored (TARGET)
    const landPt=`[${r.vland_x!=null?r.vland_x:r.landing_x}, ${r.vland_y!=null?r.vland_y:r.landing_y}, 0]`;   // first touch
    const finalPt=`[${r.vfinal_x!=null?r.vfinal_x:r.landing_x}, ${r.vfinal_y!=null?r.vfinal_y:r.landing_y}, 0]`; // after roll
    const dist=r.dist_from_center;
    if(!r.recorded){
      warmN++;
      out+=`WARMUP ${warmN}: UNMANIPULATED${CRLF}`;
      out+=`NATURAL LANDING POINT: ${landPt}${CRLF}`;
      out+=`DECELERATION POINT: ${landPt}${CRLF}`;
      out+=`ACTUAL FINAL POSITION: ${finalPt}${CRLF}`;
      out+=`EUCLIDEAN DISTANCE FROM ORIGIN: ${dist}${CRLF}${CRLF}`;
    } else {
      recN++;
      if(r.throw_type==='S'){
        out+=`TRIAL ${recN}: SUCCESS${CRLF}`;
        out+=`ZONE SIZE: ${r.zone_size}${CRLF}`;
        out+=`LANDING POINT: ${landPt}${CRLF}`;
        out+=`TARGET POINT: ${scoredPt}${CRLF}`;
        out+=`ACTUAL FINAL POSITION: ${finalPt}${CRLF}`;
        out+=`EUCLIDEAN DISTANCE FROM ORIGIN: ${dist}${CRLF}${CRLF}`;
      } else if(r.throw_type==='F'){
        out+=`TRIAL ${recN}: FAILURE${CRLF}`;
        out+=`FAILURE ZONE: ${r.fail_side}${CRLF}`;
        out+=`LANDING POINT: ${landPt}${CRLF}`;
        out+=`TARGET POINT: ${scoredPt}${CRLF}`;
        out+=`ACTUAL FINAL POSITION: ${finalPt}${CRLF}`;
        out+=`EUCLIDEAN DISTANCE FROM ORIGIN: ${dist}${CRLF}${CRLF}`;
      } else { // U
        out+=`TRIAL ${recN}: UNMANIPULATED${CRLF}`;
        out+=`NATURAL LANDING POINT: ${landPt}${CRLF}`;
        out+=`DECELERATION POINT: ${landPt}${CRLF}`;
        out+=`ACTUAL FINAL POSITION: ${finalPt}${CRLF}`;
        out+=`EUCLIDEAN DISTANCE FROM ORIGIN: ${dist}${CRLF}${CRLF}`;
      }
    }
  });
  // append the post-task questionnaire answers as a trailing block
  const q=(m)=>{const v=jsPsych.data.get().filter({measure:m}).last(1).values()[0];return v;};
  const rel=q('relative_skill_direction'), mag=q('relative_skill_magnitude');
  const purpose=q('study_purpose');
  out+=`--- RESPONSES ---${CRLF}`;
  out+=`Q1 ABILITY CHANGE (better/worse/same): ${rel?rel.relative_skill:''}${CRLF}`;
  out+=`Q2 MAGNITUDE (1-10, if better/worse): ${(mag&&mag.magnitude!=null)?mag.magnitude:''}${CRLF}`;
  out+=`Q3 PERCEIVED STUDY PURPOSE: ${(purpose&&purpose.purpose_text!=null)?purpose.purpose_text:''}${CRLF}`;
  return out;
}

function downloadVRText(){
  try{
    const text=buildVRText();
    const blob=new Blob([text],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`${BT_CONFIG.participant}.txt`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(url); a.remove();},1000);
  }catch(e){ console.error('export failed',e); }
}

// Balanced condition assignment via DataPipe (server-coordinated). Falls back to
// random-per-device if no DataPipe ID or the request fails.
async function assignCondition(){
  if(BT_CONFIG.DATAPIPE_ID){
    try{
      const res=await fetch("https://pipe.jspsych.org/api/condition/",{
        method:"POST",
        headers:{ "Content-Type":"application/json", "Accept":"*/*" },
        body: JSON.stringify({ experimentID: BT_CONFIG.DATAPIPE_ID })
      });
      const j=await res.json();
      // DataPipe returns the assigned index; accept common shapes defensively.
      let idx = (typeof j.condition==='number') ? j.condition
              : (typeof j.data==='number') ? j.data
              : (j.data && typeof j.data.condition==='number') ? j.data.condition : null;
      if(idx!=null && idx>=0 && idx<CONDITIONS.length){ return CONDITIONS[idx]; }
    }catch(e){ console.error('DataPipe condition assign failed, using random',e); }
  }
  // fallback: random per device
  return CONDITIONS[Math.floor(Math.random()*CONDITIONS.length)];
}

// Build the DataPipe save trial (official plugin). Uploads the VR-format text as
// the file contents to the OSF component. Runs as the final timeline trial.
function makeSaveTrial(){
  return {
    type: jsPsychPipe,
    action: "save",
    experiment_id: BT_CONFIG.DATAPIPE_ID,
    filename: ()=>`${BT_CONFIG.participant}.txt`,
    data_string: ()=>buildVRText(),
    on_finish: (d)=>{ SESSION.uploadOK = !(d && d.success===false); }
  };
}

// Backup save on tab close/reload: fires a best-effort sendBeacon POST straight
// to DataPipe (bypasses jsPsych/the pipe plugin, since beforeunload can't await
// a fetch) so a closed tab or crash mid-session doesn't lose all data. Uses the
// same filename as the final save trial, so it's simply overwritten by the real
// save if the participant finishes normally.
if(!BT_CONFIG.TESTING && BT_CONFIG.DATAPIPE_ID){
  window.addEventListener('beforeunload', function(){
    try{
      const blob = new Blob([JSON.stringify({
        experimentID: BT_CONFIG.DATAPIPE_ID,
        filename: `${BT_CONFIG.participant}.txt`,
        data: buildVRText()
      })], { type: 'application/json' });
      navigator.sendBeacon('https://pipe.jspsych.org/api/data/', blob);
    }catch(e){ /* best-effort only */ }
  });
}

// Fullscreen enforcement + anti-cheat (disabled in TESTING mode). Shows a
// blocking overlay whenever the participant exits fullscreen mid-session, and
// disables right-click/copy/cut/paste so the target/answers can't be inspected
// or lifted out of the page.
if(!BT_CONFIG.TESTING){
  const fsOverlay = document.createElement('div');
  fsOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(255,255,255,0.97); z-index:99999; flex-direction:column; align-items:center; justify-content:center; text-align:center;';
  fsOverlay.innerHTML = `
    <p style="font-size:1.2em; max-width:500px; margin-bottom:24px; color:#12240f;">Please return to fullscreen to continue the experiment.</p>
    <button id="fs-return-btn" style="font-size:15px; font-weight:600; padding:10px 30px; border:none; border-radius:6px; background:#12240f; color:#fff; cursor:pointer;">Return to Fullscreen</button>
  `;
  document.body.appendChild(fsOverlay);
  document.getElementById('fs-return-btn').onclick = () => document.documentElement.requestFullscreen().catch(() => {});
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('copy',  e => e.preventDefault());
  document.addEventListener('cut',   e => e.preventDefault());
  document.addEventListener('paste', e => e.preventDefault());
  document.addEventListener('fullscreenchange', () => {
    fsOverlay.style.display = document.fullscreenElement ? 'none' : 'flex';
  });
}

const jsPsych = initJsPsych({
  on_finish: ()=>{
    if(BT_CONFIG.TESTING){ jsPsych.data.displayData(); return; }
    // If the DataPipe save trial failed, fall back to a local download so no data is lost.
    if(SESSION.uploadOK===false || !BT_CONFIG.DATAPIPE_ID){ downloadVRText(); }
    // Prolific participants: redirect to the study's completion URL. Everyone
    // else (direct/pilot links): show the plain thank-you screen.
    if(PROLIFIC_PARAMS.prolific_pid){
      window.location.href = PROLIFIC_REDIRECT_URL;
      return;
    }
    document.body.innerHTML='<div style="max-width:600px;margin:80px auto;font-family:sans-serif;'+
      'text-align:center;color:#12240f;"><h2>All done — thank you!</h2>'+
      '<p style="color:#4a5a46;">Your responses have been recorded. You can close this window.</p></div>';
  }
});

// Session state. condition/structure/trialManager are resolved before the throws.
const SESSION = { condition: null, structure:null, trialManager:null, blind:false, uploadOK:null };

function initSession(condition, blind){
  SESSION.condition = condition;
  SESSION.structure = STRUCTURES[condition];
  SESSION.trialManager = new TrialManager(SESSION.structure, condition);
  SESSION.blind = !!blind;
}

function panel(html){ return `<div class="bt-panel bt-instructions">${html}</div>`; }

/* Read-gate: disable an instruction page's Continue button(s) for READ_GATE_MS so
   participants can't skip past without reading. Shows a live countdown on the
   button, then restores the real label and re-enables. Returned object is spread
   into a jsPsychHtmlButtonResponse trial (adds on_load; leaves everything else). */
const READ_GATE_MS = 5000;
function readGate(){
  return {
    on_load: function(){
      if(BT_CONFIG.TESTING) return;   // no forced wait while testing
      const btns = Array.from(document.querySelectorAll('.jspsych-btn'));
      if(!btns.length) return;
      const labels = btns.map(b=>b.innerHTML);
      const started = Date.now();
      btns.forEach(b=>{ b.disabled = true; b.style.opacity = 0.5; b.style.cursor = 'not-allowed'; });
      const tick = ()=>{
        const remain = Math.ceil((READ_GATE_MS - (Date.now()-started))/1000);
        if(remain > 0){
          btns.forEach((b,i)=>{ b.innerHTML = `${labels[i]} (${remain})`; });
          setTimeout(tick, 250);
        } else {
          btns.forEach((b,i)=>{ b.disabled=false; b.style.opacity=''; b.style.cursor=''; b.innerHTML=labels[i]; });
        }
      };
      tick();
    }
  };
}

// Testing-only condition picker. Random secretly selects one and does not reveal
// it; the true condition is still logged in the data (on each throw via SESSION).
const conditionPicker={type:jsPsychHtmlButtonResponse,
  stimulus:panel(`<h2>Testing — choose condition</h2>
    <p>For piloting only. "Random (blind)" secretly picks one of the three so you
    can test without knowing which. The true condition is still recorded in the data.</p>`),
  choices:['Improvement','Stochastic','Unmanipulated','Random (blind)'],
  data:{ screen:'picker' },
  on_finish:(d)=>{
    const map=['improvement','stochastic','unmanipulated'];
    const idx = Number(d.response);
    let condition, blind;
    if(idx>=0 && idx<3){ condition=map[idx]; blind=false; }
    else { condition=map[Math.floor(Math.random()*3)]; blind=true; }
    initSession(condition, blind);
    d.picked_condition = condition;   // logged so you can verify what Random chose
    d.picked_blind = blind;
  }};

const consentTrial={type:jsPsychHtmlButtonResponse,
  stimulus:`
    <div class="bt-consent">
      <p>By agreeing to take part in this research, you agree to play a slingshot game. This experiment will take approximately 10 minutes to complete.</p>
      <p>By answering the following questions, you are participating in a study being performed by cognitive scientists in the Stanford Department of Psychology. If you have questions about this research, please contact us at <a href="mailto:sociallearninglab@stanford.edu">sociallearninglab@stanford.edu</a>.</p>
      <p>You must be at least 18 years old to participate. Your participation in this research is voluntary. You may decline to answer any or all of the following questions. You may decline further participation, at any time, without adverse consequences. Your anonymity is assured; the researchers who have requested your participation will not receive any personal information about you.</p>
    </div>
  `,
  choices:['I AGREE'],
  data:{ screen:'consent' },
  on_load:function(){
    if(BT_CONFIG.TESTING) return;
    // Attach directly to the click (rather than trial on_finish, which fires
    // after jsPsych's internal promise chain — that microtask gap is enough
    // for some browsers to silently refuse requestFullscreen() as no longer
    // being "in response to a user gesture"). This runs synchronously inside
    // the actual click event, so it's never rejected for that reason.
    const btn=document.querySelector('.jspsych-btn');
    if(btn) btn.addEventListener('click', function(){
      document.documentElement.requestFullscreen().catch(e=>console.warn('Fullscreen request failed:', e));
    });
  }};

// ==========================================================================
// TODO(mic-test): ported from diff_time_sliders_adult_replication for parity.
// Two-prong has NO verbal/audio task downstream — nothing reads mic_access,
// peak_volume, or blocks_audio. This trial exists only to gate entry on a
// working microphone and captures a short "blocks" recording as base64 in
// the trial data, matching the source study exactly. Remove this trial (and
// its timeline entry below) if you don't actually need a mic check/recording.
// ==========================================================================
const micTestTrial = {
  type: jsPsychHtmlButtonResponse,
  stimulus: panel(`
    <h2>Microphone Test</h2>
    <p>Before we begin, we want to check that you have an active microphone.</p>
    <p>When prompted, please <b>allow</b> microphone access, then say the word <b>"slingshot"</b> out loud.</p>
    <div id="mic-test-area" style="margin:30px auto;text-align:center;">
      <svg id="mic-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" style="transition:all 0.3s;">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="#ccc" id="mic-body"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" id="mic-arc"/>
        <line x1="12" y1="19" x2="12" y2="23" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" id="mic-stem"/>
        <line x1="8" y1="23" x2="16" y2="23" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" id="mic-base"/>
      </svg>
      <div id="mic-status" style="font-size:15px;margin-top:16px;color:#4a5a46;">
        Waiting for microphone access...
      </div>
    </div>
  `),
  choices: ['Continue'],
  data: { screen: 'mic_test' },
  on_load: function(){
    const micBody = document.getElementById('mic-body');
    const micArc = document.getElementById('mic-arc');
    const micStem = document.getElementById('mic-stem');
    const micBase = document.getElementById('mic-base');
    const status = document.getElementById('mic-status');
    const btn = document.querySelector('.jspsych-btn');
    const micData = { mic_access:false, peak_volume:0, time_to_pass_ms:null, blocks_audio:null };
    const THRESHOLD = 0.3;
    let passed = false, stream = null, audioReady = false;

    if(btn){ btn.disabled = true; btn.style.opacity = 0.5; btn.style.cursor = 'not-allowed'; }
    // The mic permission prompt can kick some browsers out of fullscreen (entered
    // right after consent). Re-request it on this Continue click — a fresh, direct
    // user gesture — as a second layer on top of the "Return to Fullscreen" overlay
    // that already appears automatically (via the global fullscreenchange listener)
    // if a participant exits fullscreen at any other point in the task.
    if(!BT_CONFIG.TESTING && btn){
      btn.addEventListener('click', function(){
        document.documentElement.requestFullscreen().catch(e=>console.warn('Fullscreen request failed:', e));
      });
    }

    function setMicColor(color){
      micBody.setAttribute('fill', color);
      micArc.setAttribute('stroke', color);
      micStem.setAttribute('stroke', color);
      micBase.setAttribute('stroke', color);
    }
    function enableIfReady(){
      if(passed && audioReady && btn){ btn.disabled=false; btn.style.opacity=''; btn.style.cursor=''; }
    }

    navigator.mediaDevices.getUserMedia({ audio:true }).then(function(s){
      stream = s;
      micData.mic_access = true;
      const startTime = performance.now();
      status.textContent = 'Listening — say "slingshot"';
      status.style.color = '#12240f';

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];
      mediaRecorder.ondataavailable = (e)=>audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          micData.blocks_audio = reader.result.split(',')[1];
          audioReady = true;
          enableIfReady();
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();

      function updateMeter(){
        if(passed) return;
        analyser.getByteTimeDomainData(dataArray);
        let maxVal = 0;
        for(let i=0;i<dataArray.length;i++){
          const v = Math.abs(dataArray[i]-128)/128;
          if(v>maxVal) maxVal=v;
        }
        if(maxVal>micData.peak_volume) micData.peak_volume = maxVal;
        if(maxVal>=THRESHOLD){
          passed = true;
          micData.time_to_pass_ms = Math.round(performance.now()-startTime);
          setMicColor('#2e7d32');
          status.style.display = 'none';
          setTimeout(()=>{
            mediaRecorder.stop();
            stream.getTracks().forEach(t=>t.stop());
            audioCtx.close();
          }, 1000);
        } else {
          requestAnimationFrame(updateMeter);
        }
      }
      requestAnimationFrame(updateMeter);
    }).catch(function(err){
      micData.mic_access = false;
      micData.mic_error = err.message;
      status.textContent = 'Microphone access denied. Please allow microphone access and reload the page.';
      status.style.color = '#b22222';
    });

    const origFinish = jsPsych.getCurrentTrial().on_finish;
    jsPsych.getCurrentTrial().on_finish = function(data){
      data.mic_access = micData.mic_access;
      data.peak_volume = Math.round(micData.peak_volume*1000)/1000;
      data.time_to_pass_ms = micData.time_to_pass_ms;
      if(micData.blocks_audio) data.blocks_audio = micData.blocks_audio;
      if(micData.mic_error) data.mic_error = micData.mic_error;
      if(origFinish) origFinish(data);
    };
  }
};

const intro={type:jsPsychHtmlButtonResponse,stimulus:panel(`
  <p>In this task, you will be asked to use a slingshot to throw a ball towards a target on the ground.
  <b>Your goal is to land the ball as close to the center of the target as possible</b>.</p>`),
  choices:['Continue'], ...readGate()};

// Static preview of the field/target — a snapshot from the same drawScene()
// renderer used in live throws, so it always matches the real game exactly
// (no separate image asset to keep in sync).
const fieldPreview={type:jsPsychHtmlButtonResponse,
  stimulus:`<div class="bt-stage-wrap">
      <canvas class="bt-field" id="bt-field-preview" width="${FIELD.w}" height="${FIELD.h}"></canvas>
      <div class="bt-sub">This is the field. The dashed circle is the target — You will try to land the ball as close to its center as you can.</div>
    </div>`,
  choices:['Continue'],
  data:{ screen:'field_preview' },
  on_load:function(){
    const canvas=document.getElementById('bt-field-preview');
    drawScene(canvas.getContext('2d'));
    readGate().on_load();
  }};

const practiceExplainer={type:jsPsychHtmlButtonResponse,stimulus:panel(
  `<p>First, you will have two practice throws without the field in order to
  understand the controls.</p>`),
  choices:['Continue'], ...readGate()};

const mechExplain1={type:jsPsychHtmlButtonResponse,stimulus:panel(
  `<p>Throw the ball like a slingshot. <b>Press on the ball and drag backward</b>
   (down and to the side), then <b>release to launch</b> it in an arc toward the
   target.</p>`),
  choices:['Continue'], ...readGate()};

const mechExplain2={type:jsPsychHtmlButtonResponse,stimulus:panel(
  `<p>You will notice that when you pull back, the slingshot will begin to wobble.
   Part of the task is to learn how to shoot with this wobble.</p>`),
  choices:['Continue'], ...readGate()};

const mechExplain3={type:jsPsychHtmlButtonResponse,stimulus:panel(
  `<p><b>How far you pull</b> sets the power — pull more to throw further, less to
   fall short. <b>Which way you pull</b> sets your aim left or right.</p>
   <p>Like a real throw, it won't be perfectly precise every time — give it a few
   tries to get a feel for it.</p>`),
  choices:['Continue'], ...readGate()};

function makeThrowTrial({isPractice, label}){
  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: "NO_KEYS",
    stimulus: `<div class="bt-stage-wrap">
        <div class="bt-status" id="bt-status"></div>
        <canvas class="bt-field" id="bt-field" width="${FIELD.w}" height="${FIELD.h}"></canvas>
        <div class="bt-sub" id="bt-sub"></div></div>`,
    on_load: function(){
      const canvas=document.getElementById('bt-field'), ctx=canvas.getContext('2d');
      document.getElementById('bt-status').textContent = isPractice ? 'Practice throw' : 'Throw as close to the center as you can';
      const type = isPractice ? 'PRACTICE' : SESSION.trialManager.getCurrentTrialType();

      // Decide the landing at release, from the participant's control.
      //   aim   (pull sideways; 0 = straight) -> sets failure side for F
      //   power in [0,1] (pull length) -> depth
      // Returns {scored, visual}. `scored` is the true outcome (exact VR zone for
      // S/F; real skill for U) — this is what gets logged, keeping data VR-faithful.
      // `visual` is where the ball is SEEN to fly: it stays directionally consistent
      // with how the player actually pulled, so a coerced miss reads as *their own*
      // slightly-off throw rather than the game yanking the ball somewhere.
      function getOutcome(aim, power){
        let scored;
        if(isPractice || type==='U'){
          scored = realLandingFromControl(power, aim);        // real skill
        } else {
          scored = SESSION.trialManager.generateTargetPoint(aim); // exact VR zone
        }
        const T = THROW_TUNING;
        // Build the visual landing:
        //  - lateral (x): bias toward where the player AIMED, plus small human wobble,
        //    so it never contradicts the pull direction. Keep the scored MAGNITUDE of
        //    the miss (distance from center) but point it consistent with intent.
        const intendedX = aim * T.LATERAL_MAX;                 // where their pull pointed
        const scoredDist = Math.hypot(scored.x, scored.y);
        let vx, vy;
        if(isPractice || type==='U'){
          vx = scored.x; vy = scored.y;                        // real throw: show as-is
        } else if(type==='F'){
          // failure: keep it a miss, on the SAME side the player aimed, with the
          // coerced distance. The lateral component is always at least a fixed share
          // of the miss in the aimed direction, and the wobble is bounded so it can
          // NEVER flip the ball to the opposite side of the aim.
          const sideSign = intendedX>=0 ? 1 : -1;
          const lateralShare = Math.min(Math.abs(intendedX)/T.LATERAL_MAX, 1);
          const baseLat = scoredDist * (0.4 + 0.45*lateralShare);   // magnitude on aimed side
          // wobble capped to a fraction of baseLat so the sign can't flip
          const wob = Math.max(-0.6*baseLat, Math.min(0.6*baseLat, noise()*T.RELEASE_NOISE));
          vx = sideSign * (baseLat + Math.abs(wob)*Math.sign(noise()||1));
          // keep vx strictly on the aimed side
          if(sideSign>0) vx=Math.max(vx, 0.15*scoredDist);
          else vx=Math.min(vx, -0.15*scoredDist);
          vy = (scored.y>=0?1:-1) * Math.sqrt(Math.max(0, scoredDist*scoredDist - vx*vx));
        } else { // success: lands near center; nudge toward their aim a touch
          vx = scored.x*0.6 + intendedX*0.15 + noise()*T.RELEASE_NOISE*0.6;
          vy = scored.y + noise()*T.RELEASE_NOISE*0.6;
        }
        return { scored, visual:{x:vx, y:vy} };
      }

      runThrow(ctx, {
        voidMode: isPractice,
        getOutcome,
        onDone: (res)=>{
          // Match the VR data scheme (record_trial_data + the experiment_started
          // logic). In VR, warmup throws run the SAME unmanipulated path and are
          // typed 'U'; recorded trials are logged by true type: 'S'/'F'/'U'.
          // We distinguish warmup from the recorded block with `recorded`, not a
          // separate type label (VR distinguishes by timing, before/after start).
          const loggedType = isPractice ? 'U' : type;   // warmup = U, as in VR
          // failure side (VR logs LEFT/RIGHT): VR uses throw_direction[0]<0 => RIGHT.
          // Our aim<0 => RIGHT zone (matches). Derive from the scored landing x sign.
          const failSide = (loggedType==='F') ? (res.landing.x<0 ? 'RIGHT' : 'LEFT') : null;
          const rec={
            trial_kind: 'throw',
            participant: BT_CONFIG.participant,
            condition: SESSION.condition,                 // TRUE condition, per run
            recorded: !isPractice,                        // false = warmup (pre-start)
            throw_type: loggedType,                       // 'S' | 'F' | 'U' (our field; trial_type is reserved by jsPsych)
            trial_number: isPractice?null:(SESSION.trialManager.trialCount+1),
            landing_x:+res.landing.x.toFixed(3), landing_y:+res.landing.y.toFixed(3),
            dist_from_center:+res.dist.toFixed(3),        // Euclidean from center (SCORED, VR-faithful)
            // visual landing (first touch) vs final resting position (after roll),
            // to match VR's LANDING POINT vs ACTUAL FINAL POSITION. Display-only.
            vland_x:+(res.landingPoint?res.landingPoint.x:res.landing.x).toFixed(3),
            vland_y:+(res.landingPoint?res.landingPoint.y:res.landing.y).toFixed(3),
            vfinal_x:+(res.finalPoint?res.finalPoint.x:res.landing.x).toFixed(3),
            vfinal_y:+(res.finalPoint?res.finalPoint.y:res.landing.y).toFixed(3),
            aim:+res.aim.toFixed(3), power:+res.power.toFixed(3),
            hold_ms: res.holdMs,                          // time the ball was held/pulled before release
            zone_size:(!isPractice && type==='S')?SESSION.trialManager.getSuccessZoneSize():null,
            fail_side: failSide
          };
          if(!isPractice && type) SESSION.trialManager.advanceTrial();
          setTimeout(()=>jsPsych.finishTrial(rec),500);
        }
      });
    }
  };
}

const relativeSkill={type:jsPsychHtmlButtonResponse,
  stimulus:panel(`<h2>A few questions</h2><p>Do you think your ability at this ball
  throwing task got <b>better</b>, <b>worse</b>, or <b>stayed the same</b>?</p>`),
  choices:['Better','Worse','Stayed the same'], data:{measure:'relative_skill_direction'},
  on_finish:(d)=>{ d.relative_skill=['better','worse','same'][d.response]; }};

const magnitude={ timeline:[{type:jsPsychHtmlButtonResponse,
  stimulus:function(){
    const l=jsPsych.data.get().filter({measure:'relative_skill_direction'}).last(1).values()[0];
    const word = (l && l.relative_skill==='worse') ? 'worse' : 'better';
    return panel(`<p>On a scale from <b>1</b> to <b>10</b>, how much <b>${word}</b> did you get?</p>
  <div style="max-width:460px;margin:22px auto 4px;">
    <input type="range" id="bt-mag" min="1" max="10" step="1" value="5"
           style="width:100%;height:28px;cursor:pointer;">
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#4a5a46;margin-top:2px;">
      <span>1 — minimally ${word}</span><span>10 — substantially ${word}</span></div>
    <div style="text-align:center;margin-top:12px;font-size:20px;font-weight:700;color:#12240f;">
      Your rating: <span id="bt-mag-val">—</span></div>
  </div>`);
  },
  choices:['Continue'], data:{measure:'relative_skill_magnitude'},
  on_load:function(){
    const slider=document.getElementById('bt-mag');
    const out=document.getElementById('bt-mag-val');
    const btn=document.querySelector('.jspsych-btn');
    // require an explicit interaction before Continue works, so there is no
    // silent default rating. Slider is integer-only (step=1).
    window.__mag=null;
    if(btn){ btn.disabled=true; btn.style.opacity=0.5; btn.style.cursor='not-allowed'; }
    const commit=()=>{ window.__mag=parseInt(slider.value,10); out.textContent=window.__mag;
      if(btn){ btn.disabled=false; btn.style.opacity=''; btn.style.cursor=''; } };
    if(slider){ slider.addEventListener('input', commit); slider.addEventListener('change', commit); }
  },
  on_finish:(d)=>{ d.magnitude = (window.__mag!=null?window.__mag:null); }}],
  conditional_function:()=>{ const l=jsPsych.data.get().filter({measure:'relative_skill_direction'}).last(1).values()[0];
    return l && (l.relative_skill==='better'||l.relative_skill==='worse'); }};

const studyPurpose={type:jsPsychHtmlButtonResponse,
  stimulus:panel(`<p>What do you think was the purpose of this study?</p>
    <textarea id="bt-purpose" rows="4" style="width:100%;font-size:15px;padding:8px;box-sizing:border-box;"></textarea>`),
  choices:['Continue'], data:{measure:'study_purpose'},
  on_load:function(){
    const el=document.getElementById('bt-purpose');
    if(el) el.addEventListener('input', ()=>{ window.__purpose=el.value; });
    window.__purpose='';
  },
  on_finish:(d)=>{ d.purpose_text = window.__purpose||''; }};

const debrief={type:jsPsychHtmlButtonResponse,stimulus:panel(`<h2>Thank you</h2>
  <p>Thank you for participating in our study! During this experiment, you were
  instructed to engage in a slingshot game. We asked you to attempt to achieve a
  goal across repeated attempts and then assess your ability or skill at this
  task.</p>
  <p>Unbeknownst to you, we manipulated aspects of the scene throughout your
  participation in the study. For example, we may have altered the trajectory of
  the ball as you threw it or the outcomes you observed. Later, you were asked a
  set of questions to see if you noticed these changes. We withhold this
  information from participants as they engage in the study in order to
  investigate the impact that these physical manipulations have on participants'
  judgments of their ability and skill at a novel task.</p>
  <p>If you have any questions or would like to have your data withdrawn from
  this study, please email
  <a href="mailto:sociallearninglab@stanford.edu">sociallearninglab@stanford.edu</a>.</p>
  <p>Best,<br>Stanford Social Learning Lab</p>`),
  choices:['Continue'], ...readGate()};

// End screen: Play again (restart) or Show data (on-screen table). TESTING only;
// real runs just end. Kept as a looping node so "Play again" restarts cleanly.
const endScreen={type:jsPsychHtmlButtonResponse,
  stimulus:panel(`<h2>Done</h2>
    <p>You can replay the task or view the data collected in this run.</p>
    <p style="color:#4a5a46;font-size:14px;">(Reviewer build — data is not saved anywhere.)</p>`),
  choices:['Play again','Show data'],
  data:{ screen:'end' },
  on_finish:(d)=>{
    d.play_again = (d.response===0);
    if(d.response===1){
      jsPsych.data.displayData();
      // add a Back button below the data table to restart the game
      const back=document.createElement('button');
      back.textContent='← Back / Play again';
      back.style.cssText='display:block;margin:16px auto;padding:12px 22px;font-size:16px;'+
        'font-weight:600;background:#12240f;color:#fff;border:0;border-radius:8px;cursor:pointer;';
      back.onclick=()=>location.reload();
      document.body.appendChild(back);
    }
  }};

// All three conditions have the same number of throws.
const NUM_THROWS = STRUCTURES.improvement.length; // 7

// One full run of the task as a timeline array.
function buildRun(){
  const tl=[];
  if(BT_CONFIG.TESTING){ tl.push(conditionPicker); }
  tl.push(intro, fieldPreview, practiceExplainer, mechExplain1, mechExplain2, mechExplain3);
  for(let i=0;i<BT_CONFIG.practiceThrows;i++) tl.push(makeThrowTrial({isPractice:true}));
  tl.push({type:jsPsychHtmlButtonResponse,stimulus:panel(`<p>Throw the ball as close to the <b>center</b> of the target as you can.</p>`),
    choices:['Continue'], ...readGate()});
  for(let i=0;i<NUM_THROWS;i++) tl.push(makeThrowTrial({isPractice:false}));
  tl.push(relativeSkill, magnitude, studyPurpose, debrief);
  if(!BT_CONFIG.TESTING && BT_CONFIG.DATAPIPE_ID){ tl.push(makeSaveTrial()); }
  return tl;
}

// Replay loop (TESTING only): run task -> end screen -> repeat if "Play again".
const replayLoop={
  timeline: BT_CONFIG.TESTING ? [{timeline: buildRun()}, endScreen] : [{timeline: buildRun()}],
  loop_function: ()=>{
    if(!BT_CONFIG.TESTING) return false;
    const end=jsPsych.data.get().filter({screen:'end'}).last(1).values()[0];
    return !!(end && end.play_again);
  }
};

const timeline=[consentTrial, ...(BT_CONFIG.TESTING ? [] : [micTestTrial]), replayLoop];

// Startup: in pilot mode, assign a (balanced) condition BEFORE running. In testing
// mode, the picker sets the condition instead.
async function startExperiment(){
  // === TESTING OVERRIDE: force IMPROVEMENT for every run. ===
  // Remove this block (and un-comment nothing else) to restore normal
  // balanced/picker assignment.
  const FORCE_CONDITION = "improvement";   // set to null to disable the override
  if(FORCE_CONDITION){
    initSession(FORCE_CONDITION, false);
    jsPsych.run(timeline);
    return;
  }

  if(!BT_CONFIG.TESTING){
    const cond = await assignCondition();
    initSession(cond, false);
  }
  jsPsych.run(timeline);
}
startExperiment();
