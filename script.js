(function(){
"use strict";

// ===================== STORAGE =====================
const Store = {
  get(k, d){ try{ const v=localStorage.getItem('ogs_'+k); return v===null?d:JSON.parse(v); }catch{ return d; } },
  set(k,v){ localStorage.setItem('ogs_'+k, JSON.stringify(v)); }
};
function todayKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function yesterdayKey(){
  const d=new Date(); d.setDate(d.getDate()-1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// ===================== AUDIO =====================
const Sfx = (()=>{
  let ctx, muted = Store.get('muted', false);
  let musicTimer = null;
  function init(){
    if(!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended') ctx.resume();
  }
  function tone(freq, dur, type='sine', vol=0.12, slide=0){
    if(muted||!ctx) return;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if(slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime+dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime+dur);
  }
  function noise(dur, vol=0.06){
    if(muted||!ctx) return;
    const buf=ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*0.5;
    const src=ctx.createBufferSource(), g=ctx.createGain();
    src.buffer=buf; g.gain.setValueAtTime(vol,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
    src.connect(g); g.connect(ctx.destination);
    src.start();
  }
  return {
    init, isMuted:()=>muted,
    toggle(){ muted=!muted; Store.set('muted',muted); if(!muted) this.startMusic(); else this.stopMusic(); return muted; },
    click:()=>tone(600,0.08,'square',0.06),
    jump:()=>{ tone(320,0.12,'sine',0.1,520); },
    coin:()=>{ tone(880,0.1,'sine',0.1); setTimeout(()=>tone(1100,0.08,'sine',0.08),60); },
    pearl:()=>{ tone(660,0.15,'sine',0.12); setTimeout(()=>tone(990,0.12,'sine',0.1),80); },
    hit:()=>{ tone(120,0.25,'sawtooth',0.15,60); noise(0.15,0.08); },
    powerup:()=>{ tone(440,0.1,'sine',0.1); setTimeout(()=>tone(660,0.1,'sine',0.1),80); setTimeout(()=>tone(880,0.15,'sine',0.1),160); },
    dolphin:()=>{ tone(500,0.2,'sine',0.1,700); },
    achievement:()=>{ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.15,'sine',0.1),i*100)); },
    splash:()=>noise(0.12,0.05),
    startMusic(){
      if(muted||musicTimer) return;
      let step=0;
      const notes=[261,329,392,523,392,329];
      musicTimer=setInterval(()=>{
        if(muted){ clearInterval(musicTimer); musicTimer=null; return; }
        tone(notes[step%notes.length],0.35,'triangle',0.025);
        step++;
      }, 600);
    },
    stopMusic(){ if(musicTimer){ clearInterval(musicTimer); musicTimer=null; } }
  };
})();

// ===================== BOARDS / SHOP =====================
const BOARDS = [
  { id:'default', name:'Classic', cost:0, board:0xfef6e4, stripe:0xff6ec7, emissive:0.6 },
  { id:'neon', name:'Neon Board', cost:500, board:0x111133, stripe:0x39ff14, emissive:1.2 },
  { id:'fire', name:'Fire Board', cost:800, board:0x2a0a00, stripe:0xff4500, emissive:1.0 },
  { id:'ice', name:'Ice Board', cost:800, board:0xd4f1f9, stripe:0x00bfff, emissive:0.5 },
  { id:'gold', name:'Gold Board', cost:1500, board:0xffd700, stripe:0xfff8dc, emissive:0.4, metal:0.6 },
  { id:'trail', name:'Neon Trail', cost:600, trail:true },
];
let totalCoins = Store.get('coins', 0);
let ownedItems = Store.get('owned', ['default']);
let equippedBoard = Store.get('board', 'default');
let hasTrail = ownedItems.includes('trail') && Store.get('trailOn', false);

// ===================== ACHIEVEMENTS =====================
const ACHIEVEMENTS = [
  { id:'first_ride', name:'🏆 First Ride', check:()=>Store.get('totalRuns',0)>=1 },
  { id:'club_1000', name:'🏆 1000m Club', check:()=>Store.get('best',0)>=1000 },
  { id:'jump_master', name:'🏆 Jump Master', check:()=>sessionJumps>=50 },
  { id:'ocean_king', name:'🏆 Ocean King', check:()=>themesSeen.size>=4 },
  { id:'storm_rider', name:'🏆 Storm Rider', check:()=>stormDistance>=500 },
  { id:'pearl_keeper', name:'🏆 Pearl Keeper', check:()=>Store.get('pearls',0)>=100 },
  { id:'rich', name:'🏆 Treasure Hunter', check:()=>totalCoins>=5000 },
  { id:'mission_all', name:'🏆 Daily Hero', check:()=>missionsDoneCount()>=4 },
];
let unlockedAch = Store.get('achievements', []);
let themesSeen = new Set();
let stormDistance = 0;
let sessionJumps = 0;

function missionsDoneCount(){
  const m=getMissions(); return m.filter(x=>x.done).length;
}

function showAchToast(text){
  const el=document.getElementById('achToast');
  el.textContent=text; el.classList.add('show');
  Sfx.achievement();
  clearTimeout(showAchToast._t);
  showAchToast._t=setTimeout(()=>el.classList.remove('show'),2800);
}

function checkAchievements(){
  ACHIEVEMENTS.forEach(a=>{
    if(!unlockedAch.includes(a.id) && a.check()){
      unlockedAch.push(a.id);
      Store.set('achievements', unlockedAch);
      showAchToast(a.name + ' unlocked!');
    }
  });
}

// ===================== DAILY MISSIONS =====================
const MISSION_DEFS = [
  { id:'travel', icon:'🏄', label:'Travel 1000m', goal:1000 },
  { id:'jumps', icon:'⬆️', label:'Jump 20 times', goal:20 },
  { id:'avoid', icon:'🪨', label:'Avoid 50 rocks', goal:50 },
  { id:'beat', icon:'📈', label:"Beat yesterday's score", goal:1 },
];

function getMissions(){
  const key='missions_'+todayKey();
  let data=Store.get(key, null);
  if(!data){
    const yBest=Store.get('dailyBest_'+yesterdayKey(), 0);
    data=MISSION_DEFS.map(m=>({ id:m.id, progress:0, done:false, goal:m.id==='beat'?Math.max(yBest,1):m.goal }));
    Store.set(key, data);
  }
  return data;
}

function updateMission(id, amount){
  const missions=getMissions();
  const m=missions.find(x=>x.id===id);
  if(!m||m.done) return;
  const def=MISSION_DEFS.find(d=>d.id===id);
  if(id==='beat'){
    if(amount >= m.goal){ m.progress=1; m.done=true; onMissionComplete(def); awardMissionBonus(); }
  } else {
    m.progress=Math.min(m.goal, m.progress+amount);
    if(m.progress>=m.goal){ m.done=true; onMissionComplete(def); awardMissionBonus(); }
  }
  Store.set('missions_'+todayKey(), missions);
  if(state!=='playing') renderMissions();
}

function onMissionComplete(def){
  totalCoins+=15; Store.set('coins',totalCoins);
  showAchToast('✅ '+def.label+' — +15 🪙');
  addXP(25);
}

function awardMissionBonus(){
  if(missionsDoneCount()===4 && !Store.get('missionBonus_'+todayKey(), false)){
    totalCoins+=50; Store.set('coins',totalCoins);
    Store.set('missionBonus_'+todayKey(), true);
    showAchToast('🎉 ALL DAILY MISSIONS DONE! +50 🪙');
    addXP(100);
  }
}

function renderMissions(){
  const missions=getMissions();
  const list=document.getElementById('missionsList');
  list.innerHTML='';
  let done=0;
  missions.forEach((m,i)=>{
    const def=MISSION_DEFS.find(d=>d.id===m.id);
    const pct=m.id==='beat'?(m.done?100:0):Math.min(100,m.progress/m.goal*100);
    if(m.done) done++;
    const el=document.createElement('div');
    el.className='mission'+(m.done?' done':'');
    el.innerHTML=`<span class="icon">${def.icon}</span><span>${def.label}</span><div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div>`;
    list.appendChild(el);
  });
  document.getElementById('missionBadge').textContent=done+'/4';
}

// ===================== ISLAND QUESTS (story completion) =====================
const CHAPTER_QUESTS = [
  { id:'q1', icon:'🏝️', name:'Reach Coral Cove', desc:'Surf 500m in one run', type:'runDistance', goal:500, reward:200, xp:80 },
  { id:'q2', icon:'🦪', name:'Pearl Diver', desc:'Collect 15 pearls total', type:'pearls', goal:15, reward:250, xp:100 },
  { id:'q3', icon:'🪙', name:'Coin Collector', desc:'Earn 500 total coins', type:'coins', goal:500, reward:300, xp:120 },
  { id:'q4', icon:'⚡', name:'Storm Survivor', desc:'Surf 300m during Storm Break', type:'stormRun', goal:300, reward:350, xp:150 },
  { id:'q5', icon:'👑', name:'Ocean King', desc:'Restore the ocean — 100 pearls', type:'pearls', goal:100, reward:500, xp:300 },
];

function getQuestProgress(){
  return Store.get('questProgress', {});
}

function getQuestValue(q){
  const p=getQuestProgress();
  if(q.type==='pearls') return Store.get('pearls',0);
  if(q.type==='coins') return Store.get('coins',0);
  if(q.type==='runDistance') return p.runBest||0;
  if(q.type==='stormRun') return p.stormBest||0;
  return p[q.id]||0;
}

function isQuestComplete(q){
  return Store.get('questsDone',[]).includes(q.id);
}

function checkChapterQuests(){
  const done=Store.get('questsDone',[]);
  let changed=false;
  CHAPTER_QUESTS.forEach(q=>{
    if(done.includes(q.id)) return;
    if(getQuestValue(q)>=q.goal){
      done.push(q.id);
      totalCoins+=q.reward; Store.set('coins',totalCoins);
      addXP(q.xp);
      showAchToast(q.icon+' QUEST COMPLETE: '+q.name+'! +'+q.reward+' 🪙');
      changed=true;
    }
  });
  if(changed) Store.set('questsDone',done);
}

function updateQuestProgress(){
  const p=getQuestProgress();
  p.runBest=Math.max(p.runBest||0, Math.floor(distance));
  if(toTheme.storm && transitionT>=0.9) p.stormRun=(p.stormRun||0)+speed*0.016;
  p.stormBest=Math.max(p.stormBest||0, Math.floor(p.stormRun||0));
  Store.set('questProgress',p);
  checkChapterQuests();
}

function renderQuests(){
  const done=Store.get('questsDone',[]);
  const list=document.getElementById('questList');
  list.innerHTML='';
  let complete=0;
  CHAPTER_QUESTS.forEach(q=>{
    const finished=done.includes(q.id);
    const val=getQuestValue(q);
    const pct=Math.min(100, val/q.goal*100);
    if(finished) complete++;
    const el=document.createElement('div');
    el.className='quest-item'+(finished?' complete':'');
    el.innerHTML=finished
      ?`<span class="q-icon">${q.icon}</span><div class="q-info"><div class="q-name">${q.name}</div><div class="q-desc">Completed!</div></div><span class="q-check">✅</span>`
      :`<span class="q-icon">${q.icon}</span><div class="q-info"><div class="q-name">${q.name}</div><div class="q-desc">${q.desc}</div><div class="q-reward">Reward: ${q.reward} 🪙 · ${Math.floor(val)}/${q.goal}</div><div class="bar-wrap" style="margin-top:6px;height:4px;background:rgba(255,255,255,.12);border-radius:3px;"><div class="bar" style="width:${pct}%;height:100%;background:linear-gradient(90deg,#00e5ff,#6effc0);border-radius:3px;"></div></div></div>`;
    list.appendChild(el);
  });
  document.getElementById('questBadge').textContent=complete+'/5';

  const dots=document.getElementById('chapterDots');
  dots.innerHTML='';
  CHAPTER_QUESTS.forEach((q,i)=>{
    const d=document.createElement('div');
    d.className='chapter-dot'+(done.includes(q.id)?' done':(i===done.length?' active':''));
    d.textContent=i+1;
    d.title=q.name;
    dots.appendChild(d);
  });
}

// ===================== RUN TASKS (per-run completion) =====================
const RUN_TASK_POOL = [
  { id:'coins', label:'Collect {n} coins this run', goal:8, track:()=>runCoins },
  { id:'jumps', label:'Jump {n} times', goal:12, track:()=>sessionJumps },
  { id:'avoid', label:'Dodge {n} obstacles', goal:15, track:()=>sessionAvoided },
  { id:'distance', label:'Reach {n}m', goal:600, track:()=>Math.floor(distance) },
  { id:'combo', label:'Hit a {n}x combo', goal:5, track:()=>maxCombo },
  { id:'dolphin', label:'Touch {n} dolphins', goal:2, track:()=>sessionDolphins },
];
let runTask=null, runTaskDone=false, maxCombo=0, sessionDolphins=0;
let combo=0, comboTimer=0;

function pickRunTask(){
  const t=RUN_TASK_POOL[randInt(0,RUN_TASK_POOL.length-1)];
  runTask={...t, goal:t.goal};
  runTaskDone=false;
  updateRunTaskUI();
}

function updateRunTaskUI(){
  if(!runTask) return;
  const val=runTask.track();
  const pct=Math.min(100, val/runTask.goal*100);
  const text=runTask.label.replace('{n}', runTask.goal);
  document.getElementById('runQuestText').textContent=runTaskDone?'✅ '+text+' DONE!':text+' ('+Math.floor(val)+'/'+runTask.goal+')';
  document.getElementById('runQuestBar').style.width=(runTaskDone?100:pct)+'%';
}

function checkRunTask(){
  if(!runTask||runTaskDone) return;
  if(runTask.track()>=runTask.goal){
    runTaskDone=true;
    totalCoins+=30; Store.set('coins',totalCoins);
    addXP(40);
    showAchToast('✅ RUN TASK DONE! +30 🪙');
    updateRunTaskUI();
  }
}

function addCombo(){
  combo++; comboTimer=2.5;
  maxCombo=Math.max(maxCombo, combo);
  const mult=Math.min(5, 1+Math.floor(combo/3));
  document.getElementById('comboVal').textContent='x'+mult;
  document.getElementById('comboHud').classList.toggle('show', combo>=3);
  checkRunTask();
}

function breakCombo(){
  combo=0; comboTimer=0;
  document.getElementById('comboHud').classList.remove('show');
}

// ===================== XP / LEVEL =====================
let playerXP=Store.get('xp',0);
function xpForLevel(l){ return l*100+50; }
function getLevel(){ let l=1,xp=playerXP; while(xp>=xpForLevel(l)){ xp-=xpForLevel(l); l++; } return {level:l,xp,xpNeed:xpForLevel(l)}; }

function addXP(n){
  playerXP+=n; Store.set('xp',playerXP);
  const {level,xp,xpNeed}=getLevel();
  document.getElementById('levelLabel').textContent='LV '+level;
  document.getElementById('levelBar').style.width=(xp/xpNeed*100)+'%';
}

function updateLevelUI(){
  const {level,xp,xpNeed}=getLevel();
  document.getElementById('levelLabel').textContent='LV '+level;
  document.getElementById('levelBar').style.width=(xp/xpNeed*100)+'%';
}

// ===================== RENDERER / SCENE =====================
const canvas=document.getElementById('gameCanvas');
const renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 0.1, 2000);

function resize(){
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const skyUniforms={
  topColor:{value:new THREE.Color('#87CEEB')},
  bottomColor:{value:new THREE.Color('#ffffff')},
  offset:{value:60}, exponent:{value:0.7}
};
const skyGeo=new THREE.SphereGeometry(900,24,16);
const skyMat=new THREE.ShaderMaterial({
  uniforms:skyUniforms,
  vertexShader:`varying vec3 vWorldPosition;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorldPosition=wp.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform vec3 topColor,bottomColor;uniform float offset,exponent;varying vec3 vWorldPosition;void main(){float h=normalize(vWorldPosition+vec3(0.0,offset,0.0)).y;gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.0),exponent),0.0)),1.0);}`,
  side:THREE.BackSide
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

const hemi=new THREE.HemisphereLight(0xffffff,0x224466,0.65);
scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,1.3);
sun.position.set(40,60,-20);
scene.add(sun);
const accent1=new THREE.PointLight(0x00e5ff,3,18,2);
const accent2=new THREE.PointLight(0xff6ec7,3,18,2);
scene.add(accent1, accent2);

const OCEAN_SIZE=260, OCEAN_SEG=60;
const oceanGeo=new THREE.PlaneGeometry(OCEAN_SIZE,OCEAN_SIZE,OCEAN_SEG,OCEAN_SEG);
oceanGeo.rotateX(-Math.PI/2);
const oceanMat=new THREE.MeshPhongMaterial({color:0x0f6d7c,shininess:90,specular:0x88ffff,side:THREE.FrontSide});
const ocean=new THREE.Mesh(oceanGeo, oceanMat);
scene.add(ocean);
const oceanBasePos=oceanGeo.attributes.position.array.slice();

const laneGlowGeo=new THREE.PlaneGeometry(0.14,OCEAN_SIZE);
const LANES=[-2.4,0,2.4];
const laneGlows=LANES.map(x=>{
  const m=new THREE.Mesh(laneGlowGeo, new THREE.MeshBasicMaterial({color:0x00e5ff,transparent:true,opacity:0.35}));
  m.rotation.x=-Math.PI/2; m.position.set(x,0.03,0); scene.add(m); return m;
});

// ---------- Player (detailed surfer) ----------
const player=new THREE.Group();
const boardGroup=new THREE.Group();
boardGroup.position.y=0.02;
player.add(boardGroup);

const boardMat=new THREE.MeshStandardMaterial({color:0xfef6e4,roughness:0.3,metalness:0.08});
const stripeMat=new THREE.MeshStandardMaterial({color:0xff6ec7,emissive:0xff6ec7,emissiveIntensity:0.7,roughness:0.35});

// Tapered surfboard
const deck=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.07,2.1), boardMat);
deck.position.set(0,0.04,0); boardGroup.add(deck);
const nose=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.05,0.45), boardMat);
nose.position.set(0,0.06,1.15); nose.rotation.x=-0.25; boardGroup.add(nose);
const tail=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.05,0.3), boardMat);
tail.position.set(0,0.05,-1.05); boardGroup.add(tail);
const stripe=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.02,1.6), stripeMat);
stripe.position.set(0,0.1,0.05); boardGroup.add(stripe);
[[-0.18,0xff6ec7],[0.18,0x00e5ff]].forEach(([x,c])=>{
  const fin=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.22,0.14), new THREE.MeshStandardMaterial({color:c,roughness:0.5}));
  fin.position.set(x,0.02,-0.85); fin.rotation.x=0.3; boardGroup.add(fin);
});

// Surfer body in surf stance
const bodyGroup=new THREE.Group();
bodyGroup.position.set(0,0.18,-0.1);
bodyGroup.rotation.x=0.45;
player.add(bodyGroup);

const skinMat=new THREE.MeshStandardMaterial({color:0xffc9a0,roughness:0.65});
const suitTopMat=new THREE.MeshStandardMaterial({color:0xffd166,emissive:0xcc8800,emissiveIntensity:0.15,roughness:0.45});
const suitShortMat=new THREE.MeshStandardMaterial({color:0x00b4d8,emissive:0x0077b6,emissiveIntensity:0.2,roughness:0.4});
const hairMat=new THREE.MeshStandardMaterial({color:0xf4c542,roughness:0.8});
const glassMat=new THREE.MeshStandardMaterial({color:0x111111,roughness:0.2,metalness:0.5});

const torso=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.38,0.2), suitTopMat);
torso.position.set(0,0.42,0.02); bodyGroup.add(torso);
const shorts=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.16,0.2), suitShortMat);
shorts.position.set(0,0.2,0.02); bodyGroup.add(shorts);

const legFront=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.34,0.12), suitShortMat);
legFront.position.set(0.1,0.02,0.18); legFront.rotation.x=-0.6; bodyGroup.add(legFront);
const legBack=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.3,0.12), suitShortMat);
legBack.position.set(-0.12,0.04,-0.12); legBack.rotation.x=0.5; bodyGroup.add(legBack);
const footF=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.06,0.22), skinMat);
footF.position.set(0.12,-0.08,0.28); footF.rotation.x=-0.3; bodyGroup.add(footF);
const footB=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.06,0.2), skinMat);
footB.position.set(-0.12,-0.04,-0.22); bodyGroup.add(footB);

const armL=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.32,0.09), skinMat);
armL.position.set(-0.38,0.48,0.05); armL.rotation.z=1.1; armL.rotation.x=-0.3; bodyGroup.add(armL);
const armR=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.32,0.09), skinMat);
armR.position.set(0.38,0.48,0.05); armR.rotation.z=-1.1; armR.rotation.x=-0.3; bodyGroup.add(armR);

const head=new THREE.Mesh(new THREE.SphereGeometry(0.15,14,14), skinMat);
head.position.set(0,0.72,0.06); bodyGroup.add(head);
const hair=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,10), hairMat);
hair.position.set(0,0.8,0); hair.scale.set(1.05,0.75,1); bodyGroup.add(hair);
const glasses=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.05,0.06), glassMat);
glasses.position.set(0,0.7,0.14); bodyGroup.add(glasses);

const playerLight=new THREE.PointLight(0x00e5ff,1.6,7);
playerLight.position.set(0,1.4,-0.3); player.add(playerLight);

// Keep suitMat alias for theme color updates
const suitMat=suitShortMat;

const trailGeo=new THREE.BufferGeometry();
const trailPositions=new Float32Array(60*3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions,3));
const trailMesh=new THREE.Points(trailGeo, new THREE.PointsMaterial({color:0x00e5ff,size:0.2,transparent:true,opacity:0.75}));
scene.add(trailMesh);

player.position.set(0,0,0);
scene.add(player);

let surfAnim=0;

function applyBoardSkin(id){
  const b=BOARDS.find(x=>x.id===id)||BOARDS[0];
  if(b.trail) return;
  boardMat.color.setHex(b.board);
  boardMat.metalness=b.metal||0.08;
  stripeMat.color.setHex(b.stripe);
  stripeMat.emissive.setHex(b.stripe);
  stripeMat.emissiveIntensity=b.emissive;
  trailMesh.material.color.setHex(b.stripe);
}

// ===================== THEMES =====================
const THEMES=[
  {name:"SUNSET BAY",top:'#ff9a6c',bottom:'#3a1550',ocean:0x0f6d7c,sun:0xffb37a,sunI:1.3,hemiSky:0xffb385,hemiGround:0x2c1440,fog:0x5a2f66,accent1:0xff6ec7,accent2:0x00e5ff,storm:false},
  {name:"NEON NIGHT",top:'#0c1240',bottom:'#04010f',ocean:0x041c3a,sun:0x8fb3ff,sunI:0.55,hemiSky:0x1a2560,hemiGround:0x03040c,fog:0x05010f,accent1:0x39ff14,accent2:0xff00e5,storm:false},
  {name:"TROPICAL DAWN",top:'#bfefff',bottom:'#fff2b3',ocean:0x17b6a7,sun:0xfff4d6,sunI:1.5,hemiSky:0xffffff,hemiGround:0x2f7d6b,fog:0xcdefe0,accent1:0xffd166,accent2:0x06d6a0,storm:false},
  {name:"STORM BREAK",top:'#454b57',bottom:'#14161a',ocean:0x263238,sun:0x9aa5b1,sunI:0.6,hemiSky:0x3a3f4a,hemiGround:0x0d0f12,fog:0x2b2f36,accent1:0x00bcd4,accent2:0xff5252,storm:true},
];

const DAILY_MAP_INDEX = new Date().getDate() % THEMES.length;

let state='idle';
let currentLane=1, displayX=0, distance=0, speed=16;
const BASE_SPEED=16, MAX_SPEED=42;
let lives=3, invincibleTimer=0;
let isJumping=false, jumpVel=0, jumpY=0;
const GRAVITY=22, JUMP_VELOCITY=8.6, JUMP_REQUIRED_HEIGHT=1.35;
let bestDistance=Store.get('best',0);

let themeIndex=DAILY_MAP_INDEX, themeTimer=0;
const THEME_DURATION=42;
let transitionT=1, fromTheme=THEMES[themeIndex], toTheme=THEMES[themeIndex];
let stormFlashTimer=randRange(3,6);

let obstacles=[], collectibles=[];
let spawnTimer=1.2;
let clock=new THREE.Clock();
let playerCollider=new THREE.Box3();

let runCoins=0, sessionAvoided=0, pearlsCollected=Store.get('pearls',0);
let shieldTimer=0, magnetTimer=0, speedBoostTimer=0;
let trailIndex=0;

function randRange(a,b){ return a+Math.random()*(b-a); }
function randInt(a,b){ return Math.floor(randRange(a,b+1)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function lerpColorHex(c1,c2,t){ return new THREE.Color(c1).lerp(new THREE.Color(c2),t); }

// ===================== THEME =====================
const mapBanner=document.getElementById('mapBanner');
function showBanner(text){
  mapBanner.textContent=text;
  mapBanner.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t=setTimeout(()=>mapBanner.classList.remove('show'),2600);
}

function startThemeTransition(nextIndex){
  fromTheme=toTheme; toTheme=THEMES[nextIndex]; themeIndex=nextIndex;
  transitionT=0; themesSeen.add(nextIndex);
  showBanner("\u2600 "+toTheme.name);
}

function applyTheme(t){
  skyUniforms.topColor.value.set(t.top);
  skyUniforms.bottomColor.value.set(t.bottom);
  oceanMat.color.set(t.ocean);
  sun.color.set(t.sun); sun.intensity=t.sunI;
  hemi.color.set(t.hemiSky); hemi.groundColor.set(t.hemiGround);
  if(!scene.fog) scene.fog=new THREE.Fog(t.fog,20,130);
  scene.fog.color.set(t.fog);
  accent1.color.set(t.accent1); accent2.color.set(t.accent2);
  suitMat.color.set(t.accent2); suitMat.emissive.set(t.accent2);
  suitTopMat.emissive.set(t.accent1);
  laneGlows.forEach(g=>g.material.color.set(t.accent1));
}

function blendedTheme(a,b,t){
  return {
    top:new THREE.Color(a.top).lerp(new THREE.Color(b.top),t).getStyle(),
    bottom:new THREE.Color(a.bottom).lerp(new THREE.Color(b.bottom),t).getStyle(),
    ocean:lerpColorHex(a.ocean,b.ocean,t).getHex(),
    sun:lerpColorHex(a.sun,b.sun,t).getHex(), sunI:lerp(a.sunI,b.sunI,t),
    hemiSky:lerpColorHex(a.hemiSky,b.hemiSky,t).getHex(),
    hemiGround:lerpColorHex(a.hemiGround,b.hemiGround,t).getHex(),
    fog:lerpColorHex(a.fog,b.fog,t).getHex(),
    accent1:lerpColorHex(a.accent1,b.accent1,t).getHex(),
    accent2:lerpColorHex(a.accent2,b.accent2,t).getHex(),
  };
}

// ===================== OBSTACLES & COLLECTIBLES =====================
const rockMat=new THREE.MeshStandardMaterial({color:0x6b5644,roughness:0.9});
const finMat=new THREE.MeshStandardMaterial({color:0x1c2229,roughness:0.6});
const barMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x00e5ff,emissiveIntensity:0.9,roughness:0.3});
const coinMat=new THREE.MeshStandardMaterial({color:0xffd700,emissive:0xffaa00,emissiveIntensity:0.8,metalness:0.6,roughness:0.3});
const pearlMat=new THREE.MeshStandardMaterial({color:0xffe4f0,emissive:0xff69b4,emissiveIntensity:1.0,metalness:0.4,roughness:0.2});
const dolphinMat=new THREE.MeshStandardMaterial({color:0x5dade2,emissive:0x2e86c1,emissiveIntensity:0.4,roughness:0.5});
const logMat=new THREE.MeshStandardMaterial({color:0x8B6914,roughness:0.85});
const waveMat=new THREE.MeshStandardMaterial({color:0x4fc3f7,emissive:0x0288d1,emissiveIntensity:0.5,transparent:true,opacity:0.85});

const PWR_TYPES=['shield','magnet','speed','life'];
const pwrColors={shield:0x00e5ff,magnet:0xff6ec7,speed:0xffd36e,life:0xff5252};

function makeObstacleMesh(type){
  if(type==='rock'){
    const g=new THREE.Group();
    const m=new THREE.Mesh(new THREE.DodecahedronGeometry(0.55,0),rockMat);
    m.position.y=0.4; m.rotation.set(Math.random(),Math.random(),Math.random());
    g.add(m); return g;
  }
  if(type==='shark'){
    const g=new THREE.Group();
    const fin=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.7,4),finMat);
    fin.rotation.x=Math.PI; fin.position.y=0.55; fin.scale.set(1,1,0.4);
    g.add(fin); return g;
  }
  if(type==='bar'){
    const g=new THREE.Group();
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,7.4,10),barMat);
    bar.rotation.z=Math.PI/2; bar.position.y=JUMP_REQUIRED_HEIGHT; g.add(bar);
    const postGeo=new THREE.CylinderGeometry(0.08,0.08,JUMP_REQUIRED_HEIGHT,8);
    [-3.6,3.6].forEach(x=>{const post=new THREE.Mesh(postGeo,barMat);post.position.set(x,JUMP_REQUIRED_HEIGHT/2,0);g.add(post);});
    return g;
  }
  if(type==='log'){
    const g=new THREE.Group();
    const log=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.25,2.2,8),logMat);
    log.rotation.z=Math.PI/2; log.position.y=0.25; g.add(log);
    return g;
  }
  if(type==='wave'){
    const g=new THREE.Group();
    const w=new THREE.Mesh(new THREE.BoxGeometry(7.8,1.1,0.6),waveMat);
    w.position.y=0.55; g.add(w);
    return g;
  }
  if(type==='dolphin'){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.SphereGeometry(0.35,10,8),dolphinMat);
    body.scale.set(1.4,0.7,0.8); body.position.y=0.5; g.add(body);
    const snout=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.35,6),dolphinMat);
    snout.rotation.z=-Math.PI/2; snout.position.set(0.5,0.55,0); g.add(snout);
    return g;
  }
}

function makeCollectibleMesh(type){
  if(type==='coin'){
    const m=new THREE.Mesh(new THREE.TorusGeometry(0.22,0.07,8,16),coinMat);
    m.rotation.x=Math.PI/2; m.position.y=0.7; return m;
  }
  if(type==='pearl'){
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.2,12,12),pearlMat);
    m.position.y=0.75; return m;
  }
  if(PWR_TYPES.includes(type)){
    const mat=new THREE.MeshStandardMaterial({color:pwrColors[type],emissive:pwrColors[type],emissiveIntensity:1.0});
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(0.28,0),mat);
    m.position.y=0.8; return m;
  }
}

function spawnObstacle(type,lane,z){
  const mesh=makeObstacleMesh(type);
  mesh.position.set(lane===null?0:LANES[lane],0,z);
  scene.add(mesh); mesh.updateMatrixWorld(true);
  const collider=new THREE.Box3().setFromObject(mesh);
  const shrink=type==='bar'?-0.02:(type==='dolphin'?0.15:-0.06);
  collider.expandByScalar(shrink);
  obstacles.push({mesh,type,lane,z,passed:false,hit:false,collider,friendly:type==='dolphin'});
}

function spawnCollectible(type,lane,z){
  const mesh=makeCollectibleMesh(type);
  mesh.position.set(LANES[lane],0,z);
  scene.add(mesh); mesh.updateMatrixWorld(true);
  collectibles.push({mesh,type,lane,z,collected:false,spin:Math.random()*Math.PI*2});
}

function spawnRow(z){
  const r=Math.random();
  if(r<0.08) spawnCollectible('pearl',randInt(0,2),z);
  else if(r<0.22) spawnCollectible('coin',randInt(0,2),z);
  else if(r<0.28) spawnCollectible(PWR_TYPES[randInt(0,3)],randInt(0,2),z);
  else if(r<0.36) spawnObstacle('dolphin',randInt(0,2),z);
  else if(r<0.48){
    spawnObstacle(Math.random()<0.5?'rock':'shark',randInt(0,2),z);
  } else if(r<0.65){
    [0,1,2].sort(()=>Math.random()-0.5).slice(0,2).forEach(l=>spawnObstacle(Math.random()<0.4?'log':(Math.random()<0.5?'rock':'shark'),l,z));
  } else if(r<0.8){
    spawnObstacle(Math.random()<0.5?'bar':'wave',null,z);
  } else {
    spawnObstacle(Math.random()<0.5?'rock':'shark',randInt(0,2),z);
  }
}

function clearAll(){
  obstacles.forEach(o=>scene.remove(o.mesh));
  collectibles.forEach(c=>scene.remove(c.mesh));
  obstacles=[]; collectibles=[];
}

// ===================== INPUT =====================
function moveLane(dir){
  if(state!=='playing') return;
  currentLane=Math.max(0,Math.min(2,currentLane+dir));
}
function jump(){
  if(state!=='playing') return;
  if(!isJumping){ isJumping=true; jumpVel=JUMP_VELOCITY; Sfx.jump(); sessionJumps++; updateMission('jumps',1); }
}
window.addEventListener('keydown',(e)=>{
  if(e.repeat) return;
  if(e.code==='ArrowLeft'||e.code==='KeyA') moveLane(1);
  if(e.code==='ArrowRight'||e.code==='KeyD') moveLane(-1);
  if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){jump();e.preventDefault();}
  if(e.code==='Enter'){ if(state==='idle'||state==='gameover') startGame(); }
});

let touchStartX=0,touchStartY=0,touchStartT=0;
window.addEventListener('touchstart',(e)=>{
  const t=e.changedTouches[0];
  touchStartX=t.clientX; touchStartY=t.clientY; touchStartT=performance.now();
},{passive:true});
window.addEventListener('touchend',(e)=>{
  const t=e.changedTouches[0];
  const dx=t.clientX-touchStartX, dy=t.clientY-touchStartY, dt=performance.now()-touchStartT;
  if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)) moveLane(dx>0?1:-1);
  else if(dy<-40&&Math.abs(dy)>Math.abs(dx)) jump();
  else if(dt<250&&Math.abs(dx)<20&&Math.abs(dy)<20) jump();
},{passive:true});

// ===================== UI =====================
const startOverlay=document.getElementById('startOverlay');
const shopOverlay=document.getElementById('shopOverlay');
const overOverlay=document.getElementById('overOverlay');
const scoreVal=document.getElementById('scoreVal');
const runCoinsEl=document.getElementById('runCoins');
const speedfill=document.getElementById('speedfill');
const flashEl=document.getElementById('flash');
const hitFlashEl=document.getElementById('hitFlash');
const touchZones=document.getElementById('touchZones');
const lifeEls=[document.getElementById('life0'),document.getElementById('life1'),document.getElementById('life2')];

document.getElementById('playBtn').addEventListener('click',()=>{Sfx.init();Sfx.click();startGame();});
document.getElementById('retryBtn').addEventListener('click',()=>{Sfx.click();startGame();});
document.getElementById('shopBtn').addEventListener('click',()=>{Sfx.click();openShop();});
document.getElementById('shopBackBtn').addEventListener('click',()=>{Sfx.click();shopOverlay.classList.add('hidden');startOverlay.classList.remove('hidden');});
document.getElementById('achBtn').addEventListener('click',()=>{Sfx.click();openTasks();});
document.getElementById('achBackBtn').addEventListener('click',()=>{Sfx.click();document.getElementById('achOverlay').classList.add('hidden');startOverlay.classList.remove('hidden');});
document.getElementById('shareBtn').addEventListener('click',shareScore);
document.getElementById('muteBtn').addEventListener('click',()=>{
  const m=Sfx.toggle();
  document.getElementById('muteBtn').textContent=m?'🔇':'🔊';
});

function updateLivesUI(){
  lifeEls.forEach((el,i)=>el.classList.toggle('lost',i>=lives));
}

function updatePowerupUI(){
  document.getElementById('pwrShield').classList.toggle('active',shieldTimer>0);
  document.getElementById('pwrMagnet').classList.toggle('active',magnetTimer>0);
  document.getElementById('pwrSpeed').classList.toggle('active',speedBoostTimer>0);
}

function updateCoinUI(){
  runCoinsEl.textContent=runCoins;
  document.getElementById('totalCoins').textContent=totalCoins;
  document.getElementById('shopCoins').textContent=totalCoins;
}

function updateStoryUI(){
  const p=Store.get('pearls',0);
  const restored=p>=100;
  document.getElementById('storyLine').textContent=restored
    ? '🌊 The ocean is restored! You are the Ocean King.'
    : `The ocean is cursed. Collect magic pearls to restore it. 🦪 ${p} / 100`;
}

function refreshStartUI(){
  document.getElementById('dailyMapLabel').textContent="Today's Map: "+THEMES[DAILY_MAP_INDEX].name;
  updateCoinUI(); updateStoryUI(); renderMissions(); renderQuests(); updateLevelUI();
}

function openTasks(){
  startOverlay.classList.add('hidden');
  document.getElementById('achOverlay').classList.remove('hidden');
  renderTasksPanel();
}

function renderTasksPanel(){
  const done=Store.get('questsDone',[]);
  const qList=document.getElementById('achQuestList');
  qList.innerHTML='';
  CHAPTER_QUESTS.forEach(q=>{
    const finished=done.includes(q.id);
    const val=getQuestValue(q);
    const el=document.createElement('div');
    el.className='quest-item'+(finished?' complete':'');
    el.innerHTML=`<span class="q-icon">${q.icon}</span><div class="q-info"><div class="q-name">${q.name}</div><div class="q-desc">${finished?'Done!':q.desc+' ('+Math.floor(val)+'/'+q.goal+')'}</div></div>${finished?'<span class="q-check">✅</span>':''}`;
    qList.appendChild(el);
  });

  const mList=document.getElementById('achMissionList');
  mList.innerHTML='';
  getMissions().forEach(m=>{
    const def=MISSION_DEFS.find(d=>d.id===m.id);
    const el=document.createElement('div');
    el.className='mission'+(m.done?' done':'');
    el.innerHTML=`<span class="icon">${def.icon}</span><span>${def.label}</span>${m.done?' ✅':''}`;
    mList.appendChild(el);
  });

  const aList=document.getElementById('achList');
  aList.innerHTML='';
  ACHIEVEMENTS.forEach(a=>{
    const got=unlockedAch.includes(a.id);
    const el=document.createElement('div');
    el.className='mission'+(got?' done':'');
    el.innerHTML=`<span>${a.name}</span>${got?' ✅':' 🔒'}`;
    aList.appendChild(el);
  });
}

function openShop(){
  startOverlay.classList.add('hidden');
  shopOverlay.classList.remove('hidden');
  renderShop();
}

function renderShop(){
  const grid=document.getElementById('shopGrid');
  grid.innerHTML='';
  BOARDS.forEach(b=>{
    const owned=ownedItems.includes(b.id);
    const equipped=b.trail?(hasTrail):(equippedBoard===b.id);
    const el=document.createElement('div');
    el.className='shop-item'+(owned?' owned':'')+(equipped?' equipped':'');
    const swatchColors=b.trail?['#00e5ff','#ff6ec7']:['#'+b.board.toString(16).padStart(6,'0'),'#'+b.stripe.toString(16).padStart(6,'0')];
    el.innerHTML=`<div class="swatch" style="background:linear-gradient(135deg,${swatchColors[0]},${swatchColors[1]})"></div>
      <div class="name">${b.name}</div>
      <div class="price ${b.cost===0?'free':''}">${equipped?'Equipped':owned?'Tap to equip':b.cost+' 🪙'}</div>`;
    el.addEventListener('click',()=>buyOrEquip(b));
    grid.appendChild(el);
  });
}

function buyOrEquip(b){
  Sfx.click();
  if(!ownedItems.includes(b.id)){
    if(totalCoins<b.cost){ showAchToast('Not enough coins!'); return; }
    totalCoins-=b.cost; ownedItems.push(b.id);
    Store.set('coins',totalCoins); Store.set('owned',ownedItems);
    showAchToast('Unlocked: '+b.name+'!');
  }
  if(b.trail){ hasTrail=true; Store.set('trailOn',true); }
  else { equippedBoard=b.id; Store.set('board',b.id); applyBoardSkin(b.id); }
  updateCoinUI(); renderShop();
}

function shareScore(){
  const text=`🏄 I scored ${Math.floor(distance)}m and earned ${runCoins} coins in OG Surfer! Today's map: ${THEMES[DAILY_MAP_INDEX].name}. Can you beat me?`;
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>showAchToast('Score copied!'));
  } else {
    showAchToast(text);
  }
}

function startGame(){
  Sfx.init(); Sfx.startMusic();
  clearAll();
  distance=0; speed=BASE_SPEED; lives=3; currentLane=1; displayX=0;
  isJumping=false; jumpVel=0; jumpY=0; invincibleTimer=0;
  spawnTimer=1.4; runCoins=0; sessionAvoided=0; sessionJumps=0;
  shieldTimer=0; magnetTimer=0; speedBoostTimer=0;
  themesSeen=new Set([DAILY_MAP_INDEX]); stormDistance=0;
  combo=0; maxCombo=0; comboTimer=0; sessionDolphins=0;
  const qp=getQuestProgress(); qp.stormRun=0; Store.set('questProgress',qp);

  pickRunTask();
  breakCombo();
  updateTheme._lastMilestone=-1;

  themeIndex=DAILY_MAP_INDEX; toTheme=THEMES[themeIndex]; fromTheme=THEMES[themeIndex];
  transitionT=1; themeTimer=0;
  applyTheme(THEMES[themeIndex]);
  applyBoardSkin(equippedBoard);
  hasTrail=ownedItems.includes('trail')&&Store.get('trailOn',false);

  updateLivesUI(); updateCoinUI(); updatePowerupUI(); updateLevelUI();
  scoreVal.textContent='0';
  startOverlay.classList.add('hidden');
  shopOverlay.classList.add('hidden');
  document.getElementById('achOverlay').classList.add('hidden');
  overOverlay.classList.add('hidden');
  touchZones.classList.remove('hidden');
  state='playing';
  showBanner("\u2600 Today's Map: "+THEMES[themeIndex].name);
  clock.getDelta();

  const runs=Store.get('totalRuns',0)+1;
  Store.set('totalRuns',runs);
}

function endGame(){
  state='gameover';
  Sfx.stopMusic();
  const dist=Math.floor(distance);
  bestDistance=Math.max(bestDistance,dist);
  Store.set('best',bestDistance);

  const dailyKey='dailyBest_'+todayKey();
  const prevDaily=Store.get(dailyKey,0);
  if(dist>prevDaily) Store.set(dailyKey,dist);
  updateMission('beat',dist);

  const distBonus=Math.floor(dist/10);
  totalCoins+=distBonus;
  Store.set('coins',totalCoins);
  const coinEarned=distBonus+runCoins;

  document.getElementById('finalScore').textContent='Distance: '+dist+'m';
  document.getElementById('bestScore').textContent='Best: '+bestDistance+'m';
  document.getElementById('earnedCoins').textContent='+'+coinEarned+' coins earned';

  let summary='';
  if(runTaskDone) summary+='<div class="done-task">✅ Run task completed (+30 🪙)</div>';
  else summary+='<div>Run task: '+runTask.label.replace('{n}',runTask.goal)+' — '+(runTaskDone?'done':Math.floor(runTask.track())+'/'+runTask.goal)+'</div>';
  if(maxCombo>=3) summary+='<div class="done-task">🔥 Best combo: x'+Math.min(5,1+Math.floor(maxCombo/3))+'</div>';
  document.getElementById('runSummary').innerHTML=summary;

  overOverlay.classList.remove('hidden');
  touchZones.classList.add('hidden');

  updateQuestProgress();
  refreshStartUI();
  checkAchievements();
}

function hitFlashPulse(){
  hitFlashEl.style.background='rgba(255,40,40,0.55)';
  setTimeout(()=>hitFlashEl.style.background='rgba(255,40,40,0)',160);
}

function addCoins(n){
  const mult=combo>=3?Math.min(5,1+Math.floor(combo/3)):1;
  const earned=Math.floor(n*mult);
  runCoins+=earned; totalCoins+=earned; Store.set('coins',totalCoins); updateCoinUI(); Sfx.coin();
  checkRunTask(); checkChapterQuests();
}

function collectPowerup(type){
  Sfx.powerup();
  if(type==='shield') shieldTimer=Math.max(shieldTimer,5);
  if(type==='magnet') magnetTimer=Math.max(magnetTimer,8);
  if(type==='speed') speedBoostTimer=Math.max(speedBoostTimer,5);
  if(type==='life'){ lives=Math.min(lives+1,3); updateLivesUI(); }
  updatePowerupUI();
}

// ===================== GAME LOOP =====================
function updateOcean(t){
  const pos=oceanGeo.attributes.position, arr=pos.array;
  for(let i=0;i<arr.length;i+=3){
    const x=oceanBasePos[i], z=oceanBasePos[i+2];
    const wx=x+ocean.position.x, wz=z+ocean.position.z;
    arr[i+1]=Math.sin(wx*0.18+t*1.4)*0.16+Math.cos(wz*0.12+t*1.1)*0.22;
  }
  pos.needsUpdate=true; oceanGeo.computeVertexNormals();
}

function updateTrail(){
  if(!hasTrail||state!=='playing') return;
  const pos=trailGeo.attributes.position.array;
  trailIndex=(trailIndex+1)%20;
  const base=trailIndex*3;
  pos[base]=player.position.x+(Math.random()-0.5)*0.3;
  pos[base+1]=player.position.y+0.1;
  pos[base+2]=player.position.z-0.5;
  for(let i=0;i<20;i++){
    const idx=((trailIndex-i+20)%20)*3;
    pos[idx+1]+=i*0.02;
  }
  trailGeo.attributes.position.needsUpdate=true;
}

function updatePlayer(dt){
  const targetX=LANES[currentLane];
  displayX=lerp(displayX,targetX,1-Math.pow(0.001,dt));
  player.position.x=displayX;
  const lean=(targetX-displayX)*-0.35;
  player.rotation.z=lerp(player.rotation.z,lean,1-Math.pow(0.001,dt));

  surfAnim+=dt*8;
  const sway=Math.sin(surfAnim)*0.08;
  armL.rotation.z=1.1+sway; armR.rotation.z=-1.1-sway;
  bodyGroup.rotation.x=isJumping?0.2:0.45+Math.sin(surfAnim*0.5)*0.04;
  hair.position.y=0.8+Math.sin(surfAnim*1.2)*0.02;
  boardGroup.rotation.z=lean*0.15;

  if(isJumping){
    jumpVel-=GRAVITY*dt; jumpY+=jumpVel*dt;
    bodyGroup.rotation.x=lerp(bodyGroup.rotation.x,0.1,dt*6);
    if(jumpY<=0){ jumpY=0; isJumping=false; jumpVel=0; Sfx.splash(); }
  }
  player.position.y=jumpY+Math.sin(performance.now()*0.005)*0.05+0.02;

  const invincible=invincibleTimer>0||shieldTimer>0;
  if(invincibleTimer>0) invincibleTimer-=dt;
  if(shieldTimer>0) shieldTimer-=dt;
  if(magnetTimer>0) magnetTimer-=dt;
  if(speedBoostTimer>0) speedBoostTimer-=dt;
  if(comboTimer>0){ comboTimer-=dt; if(comboTimer<=0) breakCombo(); }
  updatePowerupUI();

  if(invincibleTimer>0&&shieldTimer<=0){
    player.visible=Math.floor(performance.now()/90)%2===0;
  } else player.visible=true;

  player.updateMatrixWorld(true);
  playerCollider.setFromObject(player);
  playerCollider.expandByScalar(-0.08);
}

function updateCamera(dt){
  const camX=lerp(camera.position.x,player.position.x*0.5,1-Math.pow(0.0005,dt));
  camera.position.set(camX,4.6+Math.sin(performance.now()*0.004)*0.06,player.position.z-7.6);
  camera.lookAt(player.position.x*0.6,1.1,player.position.z+9);
}

function updateObstacles(dt){
  spawnTimer-=dt;
  const interval=Math.max(0.5,1.5-speed*0.018);
  if(spawnTimer<=0){
    spawnRow(player.position.z+70+Math.random()*10);
    spawnTimer=interval;
  }
  for(let i=obstacles.length-1;i>=0;i--){
    const o=obstacles[i];
    const dz=o.z-player.position.z;
    if(!o.hit&&!o.friendly&&Math.abs(dz)<2.5){
      const invincible=invincibleTimer>0||shieldTimer>0;
      if(!invincible&&playerCollider.intersectsBox(o.collider)){
        o.hit=true; registerHit();
      }
    }
    if(o.friendly&&!o.passed&&Math.abs(dz)<1.5&&Math.abs(player.position.x-o.mesh.position.x)<1.2){
      o.passed=true; sessionDolphins++; addCoins(15); Sfx.dolphin();
      showBanner('🐬 Dolphin bonus! +15'); checkRunTask();
      scene.remove(o.mesh); obstacles.splice(i,1); continue;
    }
    if(!o.passed&&dz<-1.2){
      o.passed=true; distance+=5;
      if(o.type==='rock'||o.type==='shark'||o.type==='log'){
        sessionAvoided++; updateMission('avoid',1); addCombo(); addCoins(2);
      }
    }
    if(dz<-14){ scene.remove(o.mesh); obstacles.splice(i,1); }
  }
}

function updateCollectibles(dt){
  for(let i=collectibles.length-1;i>=0;i--){
    const c=collectibles[i];
    c.spin+=dt*3; c.mesh.rotation.y=c.spin;
    c.mesh.position.y=0.7+Math.sin(performance.now()*0.004+c.spin)*0.12;

    const dz=c.mesh.position.z-player.position.z;
    let collect=false;

    if(magnetTimer>0&&Math.abs(dz)<12){
      c.mesh.position.x=lerp(c.mesh.position.x,player.position.x,dt*4);
      c.mesh.position.z=lerp(c.mesh.position.z,player.position.z,dt*3);
      if(Math.abs(dz)<2&&Math.abs(c.mesh.position.x-player.position.x)<1.0) collect=true;
    } else if(Math.abs(dz)<1.5&&Math.abs(c.mesh.position.x-player.position.x)<0.9){
      collect=true;
    }

    if(collect&&!c.collected){
      c.collected=true;
      if(c.type==='coin') addCoins(5);
      else if(c.type==='pearl'){
        pearlsCollected++; Store.set('pearls',pearlsCollected);
        addCoins(10); Sfx.pearl(); updateStoryUI(); checkChapterQuests();
        if(pearlsCollected>=100) showAchToast('🌊 Ocean Restored!');
      } else collectPowerup(c.type);
      scene.remove(c.mesh); collectibles.splice(i,1); continue;
    }
    if(dz<-14){ scene.remove(c.mesh); collectibles.splice(i,1); }
  }
}

function registerHit(){
  lives--; breakCombo(); updateLivesUI(); invincibleTimer=1.7; Sfx.hit(); hitFlashPulse();
  if(lives<=0) setTimeout(()=>endGame(),250);
}

function updateTheme(dt){
  themeTimer+=dt;
  if(transitionT<1) transitionT=Math.min(1,transitionT+dt/1.8);
  if(themeTimer>THEME_DURATION){ themeTimer=0; startThemeTransition((themeIndex+1)%THEMES.length); }
  applyTheme(blendedTheme(fromTheme,toTheme,transitionT));

  if(toTheme.storm){
    if(transitionT>=1) stormDistance+=speed*dt*0.4;
    if(toTheme.storm&&transitionT>=1){
      stormFlashTimer-=dt;
      if(stormFlashTimer<=0){
        stormFlashTimer=randRange(3.5,7);
        flashEl.style.transition='opacity 0.08s'; flashEl.style.opacity='0.55';
        sun.intensity=2.2;
        setTimeout(()=>{flashEl.style.opacity='0';sun.intensity=toTheme.sunI;},110);
      }
    }
  }
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  const t=clock.elapsedTime;

  if(state==='playing'){
    const speedMult=speedBoostTimer>0?1.4:1;
    speed=Math.min(MAX_SPEED,BASE_SPEED+distance*0.012)*speedMult;
    player.position.z+=speed*dt;
    distance+=speed*dt*0.4;
    scoreVal.textContent=Math.floor(distance);
    speedfill.style.width=Math.min(100,(speed/BASE_SPEED-1)/(MAX_SPEED/BASE_SPEED)*100)+'%';
    updateMission('travel',speed*dt*0.4);
    checkRunTask();
    updateRunTaskUI();
    updateQuestProgress();
    const distFloor=Math.floor(distance);
    if(distFloor>0&&distFloor%500===0&&distFloor!==updateTheme._lastMilestone){
      updateTheme._lastMilestone=distFloor;
      showBanner('🏁 '+distFloor+'m checkpoint! +10 🪙');
      addCoins(10); addXP(20);
    }

    updatePlayer(dt);
    updateObstacles(dt);
    updateCollectibles(dt);
    updateTheme(dt);
    updateTrail();
  }

  ocean.position.set(0,0,player.position.z);
  updateOcean(t);
  laneGlows.forEach(g=>g.position.z=player.position.z);
  updateCamera(dt);
  accent1.position.set(player.position.x-2,3,player.position.z+2);
  accent2.position.set(player.position.x+2,3,player.position.z-2);
  renderer.render(scene,camera);
}

// ===================== INIT =====================
applyTheme(THEMES[DAILY_MAP_INDEX]);
applyBoardSkin(equippedBoard);
document.getElementById('muteBtn').textContent=Sfx.isMuted()?'🔇':'🔊';
refreshStartUI();
updateLevelUI();
animate();

})();