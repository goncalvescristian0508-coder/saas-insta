const fs=require('fs');const SR=44100;
function wav(path,ch){const n=ch[0].length,nc=ch.length;const buf=Buffer.alloc(44+n*nc*2);buf.write('RIFF',0);buf.writeUInt32LE(36+n*nc*2,4);buf.write('WAVE',8);buf.write('fmt ',12);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(nc,22);buf.writeUInt32LE(SR,24);buf.writeUInt32LE(SR*nc*2,28);buf.writeUInt16LE(nc*2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*nc*2,40);let o=44;for(let i=0;i<n;i++)for(let c=0;c<nc;c++){const v=Math.max(-1,Math.min(1,ch[c][i]));buf.writeInt16LE(Math.round(v*32767),o);o+=2;}fs.writeFileSync(path,buf);}
const N=s=>Math.round(s*SR);let seed=777;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296*2-1;};
function lp(arr,fc){const a=1-Math.exp(-2*Math.PI*fc/SR);let y=0;for(let i=0;i<arr.length;i++){y+=a*(arr[i]-y);arr[i]=y;}}
const DUR=48.0;const L=new Float32Array(N(DUR)),R=new Float32Array(N(DUR));
const f=n=>440*Math.pow(2,(n-69)/12);
const BPM=122,BEAT=60/BPM,BAR=BEAT*4;
// chords: Am  F  C  G  (2 bars each)
const chords=[[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]];const CH=BAR*2;
for(let ci=0;ci<Math.ceil(DUR/CH);ci++){const ch=chords[ci%4];const t0=ci*CH,t1=t0+CH;const s0=N(Math.max(0,t0-.5)),s1=N(Math.min(DUR,t1+.5));const ph=ch.map(()=>rnd()*6.28),ph2=ch.map(()=>rnd()*6.28);
 for(let i=s0;i<s1;i++){const t=i/SR;let env=1;if(t<t0)env=(t-(t0-.5))/.5;else if(t>t1)env=1-(t-t1)/.5;env=Math.max(0,Math.min(1,env));env=env*env*(3-2*env);
  let v=0,w=0;for(let k=0;k<ch.length;k++){const fr=f(ch[k])*(k==0?.5:1);const a=k==0?1.0:0.5;v+=a*(Math.sin(2*Math.PI*fr*t+ph[k])+.3*Math.sin(2*Math.PI*fr*2*t+ph[k]));w+=a*(Math.sin(2*Math.PI*fr*1.004*t+ph2[k])+.3*Math.sin(2*Math.PI*fr*2.004*t+ph2[k]));}
  // sidechain-like pump on beats
  const bt=(t%BEAT)/BEAT;const pump=.55+.45*Math.min(1,bt*3);const g=env*pump*.05;L[i]+=v*g;R[i]+=w*g;}}
lp(L,2200);lp(R,2200);
function kick(t0,amp){const s=N(t0);for(let i=0;i<N(.3);i++){const t=i/SR;const fr=170*Math.exp(-t*22)+50;const v=Math.sin(2*Math.PI*fr*t)*Math.exp(-t*10)*amp;if(s+i<L.length){L[s+i]+=v;R[s+i]+=v;}}}
function hat(t0,amp,dec=90){const s=N(t0);let y=0,z=0;for(let i=0;i<N(.08);i++){const t=i/SR;const n=rnd();y=n-z;z=.6*z+.4*n;const v=y*Math.exp(-t*dec)*amp;if(s+i<L.length){L[s+i]+=v*.8;R[s+i]+=v;}}}
function bass(t0,note,amp,len=.22){const s=N(t0);const fr=f(note);for(let i=0;i<N(len);i++){const t=i/SR;const env=Math.min(1,t*200)*Math.exp(-t*7);const v=(Math.sin(2*Math.PI*fr*t)+.4*Math.sin(2*Math.PI*fr*2*t))*env*amp;if(s+i<L.length){L[s+i]+=v;R[s+i]+=v;}}}
// drum sections: beat from 4.6 to 24.8, 25.3 to 39.4, 39.9 to 46.5 ; intro has soft pulse
const sections=[[4.6,24.8],[25.3,39.4],[39.9,46.6]];
for(const [a,b] of sections){for(let t=Math.ceil(a/BEAT)*BEAT;t<b;t+=BEAT){const beat=Math.round(t/BEAT)%4;kick(t,beat%2==0?.3:.24);hat(t+BEAT/2,.06);if(beat==1||beat==3)hat(t,.09,60);
  const ci=Math.floor(t/CH)%4;const root=chords[ci][0]-12;bass(t,root,.22);bass(t+BEAT*.5,root,.14,.14);bass(t+BEAT*.75,root+7,.1,.12);}}
for(let t=0;t<4.6;t+=BEAT){kick(t,.14);}
// risers before wipes
function riser(t0,len,amp){const s=N(t0);let y=0;for(let i=0;i<N(len);i++){const t=i/SR;const n=rnd();const fc=.01+.25*(t/len);y+=fc*(n-y);const v=y*Math.pow(t/len,2)*amp;if(s+i<L.length){L[s+i]+=v;R[s+i]+=v;}}}
riser(3.6,1.0,.9);riser(14.1,1.0,.9);riser(23.8,1.0,1.1);riser(38.4,1.0,.9);
for(let i=N(46.3);i<L.length;i++){const g=Math.max(0,1-(i-N(46.3))/N(1.6));L[i]*=g;R[i]*=g;}
for(let i=0;i<N(.5);i++){const g=i/N(.5);L[i]*=g;R[i]*=g;}
wav('audio2/music.wav',[L,R]);
function mk(len){return new Float32Array(N(len));}
{const a=mk(.12);let y=0;for(let i=0;i<a.length;i++){const t=i/SR;y=rnd()*.5-y*.2;a[i]=(y*Math.exp(-t*160)*.6+Math.sin(2*Math.PI*1400*t)*Math.exp(-t*90)*.5)*.9;}wav('audio2/tap.wav',[a,a]);}
{const a=mk(.45);let y1=0,y2=0;for(let i=0;i<a.length;i++){const t=i/SR;const n=rnd();y1+=.1*(n-y1);y2+=.03*(y1-y2);const env=Math.sin(Math.PI*Math.min(1,t/.45));a[i]=(y1-y2)*env*env*2.4;}wav('audio2/whoosh.wav',[a,a]);}
{const a=mk(.35);let y1=0;for(let i=0;i<a.length;i++){const t=i/SR;const n=rnd();y1+=.2*(n-y1);a[i]=(y1*Math.exp(-t*14)*1.6)+(Math.sin(2*Math.PI*60*t)*Math.exp(-t*18)*.8);}wav('audio2/slam.wav',[a,a]);}
{const a=mk(1.6);for(let i=0;i<a.length;i++){const t=i/SR;a[i]=(Math.sin(2*Math.PI*880*t)*.5+Math.sin(2*Math.PI*1318.5*t)*.35+Math.sin(2*Math.PI*1760*t)*.2*Math.exp(-t*4))*Math.exp(-t*2.6)*.55*(t<.01?t/.01:1);}wav('audio2/chime.wav',[a,a]);}
{const a=mk(.6);for(let i=0;i<a.length;i++){const t=i/SR;const f1=t<.12?1046:1318;a[i]=Math.sin(2*Math.PI*f1*t)*Math.exp(-((t%.12))*18)*Math.exp(-t*3)*.5;}wav('audio2/ding.wav',[a,a]);}
{const a=mk(.35);for(let i=0;i<a.length;i++){const t=i/SR;const ph=(t*110)%1;const sq=ph<.5?1:-1;a[i]=(sq*.35+Math.sin(2*Math.PI*110*t)*.4)*Math.exp(-t*7)*.6;}lp(a,900);wav('audio2/buzz.wav',[a,a]);}
{const a=mk(.09);for(let i=0;i<a.length;i++){const t=i/SR;a[i]=Math.sin(2*Math.PI*1800*t)*Math.exp(-t*110)*.45+Math.sin(2*Math.PI*900*t)*Math.exp(-t*80)*.2;}wav('audio2/tick.wav',[a,a]);}
{const a=mk(.25);for(let i=0;i<a.length;i++){const t=i/SR;const fr=600*Math.exp(-t*25)+180;a[i]=Math.sin(2*Math.PI*fr*t)*Math.exp(-t*22)*.6;}wav('audio2/pop.wav',[a,a]);}
{const a=mk(.3);let y=0;for(let i=0;i<a.length;i++){const t=i/SR;const n=rnd();y+=.15*(n-y);a[i]=y*Math.exp(-t*12)*Math.min(1,t*60)*1.2;}wav('audio2/slide.wav',[a,a]);}
console.log('audio2 ok');
