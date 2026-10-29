const fs=require('fs');
const SR=44100;
function wav(path,ch){const n=ch[0].length,nc=ch.length;const buf=Buffer.alloc(44+n*nc*2);
 buf.write('RIFF',0);buf.writeUInt32LE(36+n*nc*2,4);buf.write('WAVE',8);buf.write('fmt ',12);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(nc,22);buf.writeUInt32LE(SR,24);buf.writeUInt32LE(SR*nc*2,28);buf.writeUInt16LE(nc*2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*nc*2,40);
 let o=44;for(let i=0;i<n;i++)for(let c=0;c<nc;c++){const v=Math.max(-1,Math.min(1,ch[c][i]));buf.writeInt16LE(Math.round(v*32767),o);o+=2;}fs.writeFileSync(path,buf);}
const N=(s)=>Math.round(s*SR);
// deterministic noise
let seed=1234;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296*2-1;};
// ---------- MUSIC ----------
const DUR=33.5;const L=new Float32Array(N(DUR)),R=new Float32Array(N(DUR));
const f=n=>440*Math.pow(2,(n-69)/12);// midi
const chords=[[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]];// Am F C G (midi)
const CH=4.0;
// pad: each chord window with attack/release crossfade
for(let ci=0;ci<Math.ceil(DUR/CH);ci++){const ch=chords[ci%4];const t0=ci*CH,t1=t0+CH;const s0=N(Math.max(0,t0-.9)),s1=N(Math.min(DUR,t1+.9));
 const phases=ch.map(()=>rnd()*6.28),ph2=ch.map(()=>rnd()*6.28);
 for(let i=s0;i<s1;i++){const t=i/SR;let env=1;if(t<t0)env=(t-(t0-.9))/.9;else if(t>t1)env=1-(t-t1)/.9;env=Math.max(0,Math.min(1,env));env=env*env*(3-2*env);
  let v=0,w=0;for(let k=0;k<ch.length;k++){const fr=f(ch[k])*(k==0?.5:1);const a=k==0?1.0:0.55;v+=a*(Math.sin(2*Math.PI*fr*t+phases[k])+.35*Math.sin(2*Math.PI*fr*2*t+phases[k])+.12*Math.sin(2*Math.PI*fr*3*t));w+=a*(Math.sin(2*Math.PI*fr*1.003*t+ph2[k])+.35*Math.sin(2*Math.PI*fr*2.003*t+ph2[k]));}
  const lfo=.85+.15*Math.sin(2*Math.PI*.18*t);const g=env*lfo*.055;L[i]+=v*g;R[i]+=w*g;}}
// gentle one-pole lowpass on pad
function lp(arr,fc){const a=1-Math.exp(-2*Math.PI*fc/SR);let y=0;for(let i=0;i<arr.length;i++){y+=a*(arr[i]-y);arr[i]=y;}}
lp(L,1800);lp(R,1800);
// pulse: soft kick every 0.6s in active sections, shaker on 8ths
function kick(t0,amp){const s=N(t0);for(let i=0;i<N(.32);i++){const t=i/SR;const fr=150*Math.exp(-t*18)+48;const v=Math.sin(2*Math.PI*fr*t)*Math.exp(-t*9)*amp;if(s+i<L.length){L[s+i]+=v;R[s+i]+=v;}}}
function shaker(t0,amp){const s=N(t0);let y=0;for(let i=0;i<N(.06);i++){const t=i/SR;const n=rnd();y=n-y*.3;const v=y*Math.exp(-t*70)*amp;if(s+i<L.length){L[s+i]+=v*.7;R[s+i]+=v;}}}
const active=[[3.2,22.4],[26.8,32.4]];
for(const [a,b] of active){for(let t=a;t<b;t+=.6){kick(t,.22);shaker(t+.3,.05);} }
// final fade out
for(let i=N(31.6);i<L.length;i++){const g=Math.max(0,1-(i-N(31.6))/N(1.8));L[i]*=g;R[i]*=g;}
// fade in
for(let i=0;i<N(.8);i++){const g=i/N(.8);L[i]*=g;R[i]*=g;}
wav('audio/music.wav',[L,R]);
// ---------- SFX ----------
function mk(len){return new Float32Array(N(len));}
// tap
{const a=mk(.12);let y=0;for(let i=0;i<a.length;i++){const t=i/SR;y=rnd()*.5-y*.2;a[i]=(y*Math.exp(-t*160)*.6+Math.sin(2*Math.PI*1400*t)*Math.exp(-t*90)*.5)*.9;}wav('audio/tap.wav',[a,a]);}
// whoosh: bandpassed noise swell
{const a=mk(.7);let y1=0,y2=0;for(let i=0;i<a.length;i++){const t=i/SR;const n=rnd();y1+=.08*(n-y1);y2+=.02*(y1-y2);const env=Math.sin(Math.PI*Math.min(1,t/.7));a[i]=(y1-y2)*env*env*2.2;}wav('audio/whoosh.wav',[a,a]);}
// chime (payoff)
{const a=mk(1.6);for(let i=0;i<a.length;i++){const t=i/SR;a[i]=(Math.sin(2*Math.PI*880*t)*.5+Math.sin(2*Math.PI*1318.5*t)*.35+Math.sin(2*Math.PI*1760*t)*.2*Math.exp(-t*4))*Math.exp(-t*2.6)*.55*(t<.01?t/.01:1);}wav('audio/chime.wav',[a,a]);}
// riser into payoff
{const a=mk(1.2);let y=0;for(let i=0;i<a.length;i++){const t=i/SR;const n=rnd();const fc=.01+.2*(t/1.2);y+=fc*(n-y);a[i]=y*(t/1.2)*(t/1.2)*1.4;}wav('audio/riser.wav',[a,a]);}
// buzz (rule)
{const a=mk(.35);for(let i=0;i<a.length;i++){const t=i/SR;const ph=(t*110)%1;const sq=ph<.5?1:-1;a[i]=(sq*.35+Math.sin(2*Math.PI*110*t)*.4)*Math.exp(-t*7)*.6;}lp(a,900);wav('audio/buzz.wav',[a,a]);}
// pip tick (day counter)
{const a=mk(.09);for(let i=0;i<a.length;i++){const t=i/SR;a[i]=Math.sin(2*Math.PI*1800*t)*Math.exp(-t*110)*.45+Math.sin(2*Math.PI*900*t)*Math.exp(-t*80)*.2;}wav('audio/tick.wav',[a,a]);}
// pop (badge/button)
{const a=mk(.25);for(let i=0;i<a.length;i++){const t=i/SR;const fr=600*Math.exp(-t*25)+180;a[i]=Math.sin(2*Math.PI*fr*t)*Math.exp(-t*22)*.6;}wav('audio/pop.wav',[a,a]);}
console.log('audio ok');
