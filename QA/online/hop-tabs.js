const L=require('./lib.js');const {wait,newPage}=L;
(async()=>{const b=await L.launch();const p=await newPage(b,null,{size:{width:430,height:780}});
await p.evaluate(()=>{window.__ludusTestMuted=true;Ludus.state.reduceMotion=true;window.ludusOpenGame('sparkhop')});await wait(900);
const r=await p.evaluate(()=>{const c=[...document.querySelectorAll('canvas')].sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];const w=c.getBoundingClientRect();return {w:w.width,x:w.left,y:w.top}});
const k=r.w/360;const raw=['Classic','Monsters','Boost','Moon','Storm','Night'].map(s=>s.length*6.2+22),sum=raw.reduce((a,b)=>a+b,0);let x=0;const cs=raw.map(v=>{const q=(x+v/2)*344/sum;x+=v;return q});
const ids=['classic','monsters','boost','moon','storm','night'];
for(let i=5;i>=0;i--){await p.mouse.click(r.x+(8+cs[i])*k,r.y+62*k);await wait(250);const m=await p.evaluate(()=>Ludus.games.find(g=>g.id==='sparkhop')._peek().mode);console.log(ids[i],m,m===ids[i]?'PASS':'FAIL')}
await p.evaluate(()=>Ludus.games.find(g=>g.id==='sparkhop')._cue.pick('monsters'));await wait(300);
await p.screenshot({path:process.argv[2],clip:{x:r.x,y:r.y+40*k,width:r.w,height:48*k}});await b.close()})();
