"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TACTICS, OPENINGS, ENDGAMES, THEMES, THEME_COACHING, type Puzzle, type Opening } from "@/data/puzzles";

const PC:Record<string,string>={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
const START_FEN="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Difficulty levels → Lichess rating bands
const LEVELS=[
  {n:1,label:"Beginner",desc:"Mate in 1, simple captures (Chess.com 100-350)",min:50,max:350},
  {n:2,label:"Easy",desc:"2-move tactics, basic forks (Chess.com 300-600)",min:250,max:600},
  {n:3,label:"Medium",desc:"Pins, discovered attacks (Chess.com 550-900)",min:500,max:900},
  {n:4,label:"Hard",desc:"Sacrifices, multi-move combos (Chess.com 800-1150)",min:750,max:1150},
  {n:5,label:"Expert",desc:"Complex combinations (Chess.com 1000-1400)",min:950,max:1400},
];

// Chess logic
function parseFEN(f:string){const rows=f.split(" ")[0].split("/"),b:(string|null)[][]=[];for(const r of rows){const a:(string|null)[]=[];for(const c of r)if(c>="1"&&c<="8")for(let i=0;i<+c;i++)a.push(null);else a.push(c);b.push(a)}return b}
function getClr(f:string){return f.split(" ")[1]}
function isW(p:string|null):boolean{return!!p&&p===p.toUpperCase()}
function u2c(u:string){const f="abcdefgh";return{fr:8-+u[1],fc:f.indexOf(u[0]),tr:8-+u[3],tc:f.indexOf(u[2]),pr:u[4]||null}}
function c2u(fr:number,fc:number,tr:number,tc:number){return"abcdefgh"[fc]+(8-fr)+"abcdefgh"[tc]+(8-tr)}
function doMove(b:(string|null)[][],u:string){const n=b.map(r=>[...r]);const{fr,fc,tr,tc,pr}=u2c(u);let p=n[fr][fc];if(!p)return n;if(pr)p=isW(p)?pr.toUpperCase():pr.toLowerCase();if((p==="K"||p==="k")&&Math.abs(tc-fc)===2){if(tc>fc){n[fr][5]=n[fr][7];n[fr][7]=null}else{n[fr][3]=n[fr][0];n[fr][0]=null}}if((p==="P"||p==="p")&&fc!==tc&&!n[tr][tc])n[fr][tc]=null;n[tr][tc]=p;n[fr][fc]=null;return n}
function getMvs(b:(string|null)[][],r:number,c:number){const p=b[r][c];if(!p)return[] as number[][];const w=isW(p),m:number[][]=[];const t=p.toLowerCase();const add=(rr:number,cc:number)=>{if(rr<0||rr>7||cc<0||cc>7)return false;const x=b[rr][cc];if(x&&isW(x)===w)return false;m.push([rr,cc]);return!x};const sl=(ds:number[][])=>{for(const[dr,dc]of ds)for(let i=1;i<8;i++)if(!add(r+dr*i,c+dc*i))break};if(t==="p"){const d=w?-1:1,s=w?6:1;if(r+d>=0&&r+d<=7&&!b[r+d][c]){m.push([r+d,c]);if(r===s&&!b[r+2*d][c])m.push([r+2*d,c])}for(const dc of[-1,1]){const nr=r+d,nc=c+dc;if(nr>=0&&nr<=7&&nc>=0&&nc<=7&&b[nr][nc]&&isW(b[nr][nc])!==w)m.push([nr,nc])}}else if(t==="n")for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);else if(t==="b")sl([[-1,-1],[-1,1],[1,-1],[1,1]]);else if(t==="r")sl([[-1,0],[1,0],[0,-1],[0,1]]);else if(t==="q")sl([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);else if(t==="k"){for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])add(r+dr,c+dc);if(w&&r===7&&c===4){if(!b[7][5]&&!b[7][6])m.push([7,6]);if(!b[7][3]&&!b[7][2]&&!b[7][1])m.push([7,2])}if(!w&&r===0&&c===4){if(!b[0][5]&&!b[0][6])m.push([0,6]);if(!b[0][3]&&!b[0][2]&&!b[0][1])m.push([0,2])}}return m}

interface SR{ef:number;iv:number;rep:number;next:number;last:string|null;att:number;cor:number}
const mkSR=():SR=>({ef:2.5,iv:1,rep:0,next:0,last:null,att:0,cor:0});
function doSR(s:SR,ok:boolean):SR{const n={...s,att:s.att+1};if(ok){n.cor=s.cor+1;n.rep=s.rep+1;n.iv=n.rep===1?1:n.rep===2?3:Math.round(s.iv*s.ef);n.ef=Math.max(1.3,s.ef+0.1);n.last="ok"}else{n.rep=0;n.iv=1;n.ef=Math.max(1.3,s.ef-0.2);n.last="fail"}n.next=Date.now()+n.iv*864e5;return n}
interface UserInfo{id:string;name:string}
interface ThemeStat{att:number;cor:number}
interface UserData{tacticsSR:Record<string,SR>;openingSR:Record<string,SR>;endgameSR:Record<string,SR>;solved:number;att:number;streak:number;lastDate:string|null;themeStats:Record<string,ThemeStat>;rushBest:number;level:number}
function loadUsers():UserInfo[]{try{return JSON.parse(localStorage.getItem("chess-users")||"[]")}catch{return[]}}
function saveUsers(u:UserInfo[]){localStorage.setItem("chess-users",JSON.stringify(u))}
function loadUD(uid:string):UserData|null{try{const d=localStorage.getItem("chess-"+uid);return d?JSON.parse(d):null}catch{return null}}
function saveUD(uid:string,d:UserData){localStorage.setItem("chess-"+uid,JSON.stringify(d))}
const mkData=():UserData=>({tacticsSR:{},openingSR:{},endgameSR:{},solved:0,att:0,streak:0,lastDate:null,themeStats:{},rushBest:0,level:2});

async function askCoach(ctx:string,wrongMove:string|null,mode:string):Promise<string>{try{const res=await fetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:ctx,wrongMove,mode})});const d=await res.json();return d.message||"Keep practicing!"}catch{return"Great effort!"}}
function getStaticCoaching(themes:string[],ok:boolean):string{for(const t of themes){const c=THEME_COACHING[t];if(c)return ok?c.ok:c.fail}return ok?"Well done!":"Review the solution — you will spot it next time!"}

// ── Board with high-contrast pieces ──
function Board({board,flipped,sel,mvs,onClick,lastMv,wrongSq,guideSq,compact}:{board:(string|null)[][],flipped:boolean,sel:number[]|null,mvs:number[][],onClick:(r:number,c:number)=>void,lastMv:{fr:number,fc:number,tr:number,tc:number}|null,wrongSq:number[]|null,guideSq?:number[]|null,compact?:boolean}){
  const rnks=flipped?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const fls=flipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  const sz=compact?"min(52vh,80vw)":"min(60vh,88vw)";
  const fsz=compact?"min(5.5vw,5.5vh,36px)":"min(6vw,6.5vh,44px)";
  return(<div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",width:sz,height:sz,borderRadius:"6px",overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.15)",flexShrink:0}}>
    {rnks.map((_,vy)=>{const row=flipped?_:7-_;return fls.map((hi,hx)=>{const col=flipped?7-hi:hi;
      const lt=(row+col)%2===0;const p=board[row]?.[col];
      const isSel=sel?sel[0]===row&&sel[1]===col:false;
      const isMv=mvs.some(([r,c])=>r===row&&c===col);
      const isLast=lastMv?((lastMv.fr===row&&lastMv.fc===col)||(lastMv.tr===row&&lastMv.tc===col)):false;
      const isWr=wrongSq?wrongSq[0]===row&&wrongSq[1]===col:false;
      const isGuide=guideSq?((guideSq[0]===row&&guideSq[1]===col)||(guideSq[2]===row&&guideSq[3]===col)):false;
      let bg=lt?"#EEDEBC":"#779556";
      if(isSel)bg=lt?"#F6E68A":"#B5C94A";
      else if(isWr)bg=lt?"#F8A0A0":"#D45555";
      else if(isGuide)bg=lt?"#90CAF9":"#42A5F5";
      else if(isLast)bg=lt?"#E8E07A":"#A0B84A";
      // High-contrast piece styling
      const pieceStyle:React.CSSProperties=p?{
        fontSize:fsz,lineHeight:1,zIndex:1,
        color:isW(p)?"#FFFFFF":"#000000",
        textShadow:isW(p)
          ?"0 0 2px #000, 0 0 2px #000, 1px 1px 2px rgba(0,0,0,0.8), -1px -1px 0 rgba(0,0,0,0.4)"
          :"0 0 2px #FFF, 0 0 2px #FFF, 1px 1px 1px rgba(255,255,255,0.5)",
        transform:isSel?"scale(1.15)":"scale(1)",transition:"transform .1s",
      }:{};
      return(<div key={row+"-"+col} onClick={()=>onClick(row,col)} style={{background:bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",cursor:"pointer",aspectRatio:"1",transition:"background .1s"}}>
        {isMv&&!p&&<div style={{width:"26%",height:"26%",borderRadius:"50%",background:"rgba(0,0,0,0.18)"}}/>}
        {isMv&&!!p&&<div style={{position:"absolute",inset:"3px",borderRadius:"50%",border:"3px solid rgba(0,0,0,0.25)"}}/>}
        {isGuide&&<div style={{position:"absolute",inset:"2px",borderRadius:"50%",border:"3px solid #1565C0",animation:"pulse 1s ease-in-out infinite"}}/>}
        {p&&<span style={pieceStyle}>{PC[p]}</span>}
        {vy===7&&<span style={{position:"absolute",bottom:1,right:2,fontSize:"8px",fontWeight:700,opacity:.5,color:lt?"#8E7E5E":"#F0E4C8"}}>{"abcdefgh"[col]}</span>}
        {hx===0&&<span style={{position:"absolute",top:1,left:2,fontSize:"8px",fontWeight:700,opacity:.5,color:lt?"#8E7E5E":"#F0E4C8"}}>{8-row}</span>}
      </div>)})}).flat()}
  </div>);
}

function Timer({active,dur=180,onTimeout}:{active:boolean,dur?:number,onTimeout?:()=>void}){
  const[t,setT]=useState(dur);const ref=useRef<NodeJS.Timeout|null>(null);
  useEffect(()=>{if(active&&t>0){ref.current=setInterval(()=>setT(x=>{if(x<=1){clearInterval(ref.current!);onTimeout?.();return 0}return x-1}),1000);return()=>{if(ref.current)clearInterval(ref.current)}}},[active,t>0]);// eslint-disable-line
  useEffect(()=>{setT(dur)},[dur]);
  const pct=t/dur*100;const col=pct>50?"#4CAF50":pct>25?"#FF9800":"#F44336";
  return(<div style={{display:"flex",alignItems:"center",gap:"8px"}}>
    <div style={{width:"60px",height:"6px",borderRadius:"3px",background:"#E0E0E0",overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",borderRadius:"3px",background:col,transition:"width 1s linear"}}/></div>
    <span style={{fontSize:"16px",fontWeight:700,color:col,fontVariantNumeric:"tabular-nums"}}>{Math.floor(t/60)}:{(t%60).toString().padStart(2,"0")}</span>
  </div>);
}

// ═══════════════════════════════════════
export default function ChessCompanion(){
  const[view,setView]=useState("users");const[users,setUsers]=useState<UserInfo[]>([]);const[uid,setUid]=useState<string|null>(null);const[uname,setUname]=useState("");const[data,setData]=useState<UserData|null>(null);const[mounted,setMounted]=useState(false);const[newName,setNewName]=useState("");
  const[puzzle,setPuzzle]=useState<Puzzle|null>(null);const[board,setBoard]=useState<(string|null)[][]>([]);const[sel,setSel]=useState<number[]|null>(null);const[mvs,setMvs]=useState<number[][]>([]);const[mIdx,setMIdx]=useState(0);const[status,setStatus]=useState<string|null>(null);const[wrongSq,setWrongSq]=useState<number[]|null>(null);const[wrongMove,setWrongMove]=useState<string|null>(null);const[lastMv,setLastMv]=useState<{fr:number,fc:number,tr:number,tc:number}|null>(null);const[hintUsed,setHintUsed]=useState(false);const qRef=useRef<Puzzle[]>([]);
  const[timerMode,setTimerMode]=useState(false);const[timerActive,setTimerActive]=useState(false);const[rushScore,setRushScore]=useState(0);const[rushTotal,setRushTotal]=useState(0);const[coach,setCoach]=useState<string|null>(null);const[coachLoad,setCoachLoad]=useState(false);const[mode,setMode]=useState("tactics");
  const[opLine,setOpLine]=useState<Opening|null>(null);const[opMoveIdx,setOpMoveIdx]=useState(0);const[opStatus,setOpStatus]=useState<string|null>(null);const[opTip,setOpTip]=useState("");
  const[opGuideMode,setOpGuideMode]=useState(false);const[guideSq,setGuideSq]=useState<number[]|null>(null);
  const[showDiffPicker,setShowDiffPicker]=useState(false);const[pickerMode,setPickerMode]=useState<"train"|"rush">("train");

  useEffect(()=>{setMounted(true);setUsers(loadUsers())},[]);
  useEffect(()=>{if(data&&uid&&mounted)saveUD(uid,data)},[data,uid,mounted]);

  const selectUser=useCallback((id:string,name:string)=>{setUid(id);setUname(name);setData(loadUD(id)||mkData());setView("home")},[]);
  const createUser=useCallback(()=>{if(!newName.trim())return;const id=Date.now().toString(36);const nu=[...users,{id,name:newName.trim()}];setUsers(nu);saveUsers(nu);setNewName("");selectUser(id,newName.trim())},[users,newName,selectUser]);
  const deleteUser=useCallback((id:string)=>{if(!confirm("Delete this player?"))return;const nu=users.filter(u=>u.id!==id);setUsers(nu);saveUsers(nu);try{localStorage.removeItem("chess-"+id)}catch{}if(uid===id){setUid(null);setView("users")}},[users,uid]);

  const record=useCallback((id:string,ok:boolean,themes:string[],srKey:string="tacticsSR")=>{
    setData(prev=>{if(!prev)return prev;const n={...prev,att:prev.att+1};const srMap=prev[srKey as keyof UserData] as Record<string,SR>;const sr=srMap[id]||mkSR();(n as any)[srKey]={...srMap,[id]:doSR(sr,ok)};if(ok)n.solved=prev.solved+1;const today=new Date().toDateString();if(prev.lastDate!==today){const yday=new Date(Date.now()-864e5).toDateString();n.streak=prev.lastDate===yday?prev.streak+1:1;n.lastDate=today}const ts={...prev.themeStats};for(const t of themes){if(!ts[t])ts[t]={att:0,cor:0};ts[t]={att:ts[t].att+1,cor:ts[t].cor+(ok?1:0)}}n.themeStats=ts;return n})
  },[]);

  const startPuzzle=useCallback((p:Puzzle,m:string="tactics")=>{setPuzzle(p);setBoard(parseFEN(p.fen));setSel(null);setMvs([]);setMIdx(0);setStatus(null);setWrongSq(null);setWrongMove(null);setLastMv(null);setHintUsed(false);setCoach(null);setGuideSq(null);setMode(m);setView("puzzle")},[]);

  const startSession=useCallback((timer:boolean,level:number)=>{
    const lv=LEVELS[level-1]||LEVELS[1];
    let pool=TACTICS.filter(p=>p.r>=lv.min&&p.r<=lv.max);
    if(pool.length<5)pool=TACTICS.filter(p=>p.r>=lv.min-100&&p.r<=lv.max+100);
    if(pool.length<5)pool=[...TACTICS];
    const due=pool.filter(p=>{const sr=data?.tacticsSR?.[p.id];return!sr||sr.next<=Date.now()});
    const q=(due.length>=5?due:pool).slice(0,timer?50:10);
    qRef.current=q.slice(1);setTimerMode(timer);setTimerActive(timer);setRushScore(0);setRushTotal(0);setShowDiffPicker(false);
    if(q.length)startPuzzle(q[0],"tactics");
  },[data,startPuzzle]);

  const startEndgame=useCallback(()=>{const items=[...ENDGAMES].sort((a,b)=>{const sa=data?.endgameSR?.[a.id],sb=data?.endgameSR?.[b.id];if(!sa&&!sb)return a.r-b.r;if(!sa)return-1;if(!sb)return 1;return sa.next-sb.next});qRef.current=items.slice(1);if(items.length)startPuzzle(items[0],"endgames")},[data,startPuzzle]);
  const nextPuzzle=useCallback(()=>{if(qRef.current.length){const n=qRef.current[0];qRef.current=qRef.current.slice(1);startPuzzle(n,mode)}else{setTimerActive(false);setView("home")}},[startPuzzle,mode]);

  const onSqClick=useCallback((row:number,col:number)=>{
    if(!board.length||!puzzle||status==="solved"||status==="fail")return;const pw=getClr(puzzle.fen)==="w";
    if(sel){if(sel[0]===row&&sel[1]===col){setSel(null);setMvs([]);return}const p=board[row][col];if(p&&((pw&&isW(p))||(!pw&&!isW(p)))){setSel([row,col]);setMvs(getMvs(board,row,col));return}
      const uci=c2u(sel[0],sel[1],row,col);
      if(uci===puzzle.sol[mIdx]){const nb=doMove(board,uci);setBoard(nb);setSel(null);setMvs([]);setLastMv(u2c(uci));setWrongSq(null);const ni=mIdx+1;if(ni>=puzzle.sol.length){setStatus("solved");record(puzzle.id,!hintUsed,puzzle.th,mode==="endgames"?"endgameSR":"tacticsSR");if(timerMode){setRushScore(s=>s+1);setRushTotal(t=>t+1)}}else{setMIdx(ni);setStatus("ok");setTimeout(()=>{setBoard(doMove(nb,puzzle.sol[ni]));setLastMv(u2c(puzzle.sol[ni]));setMIdx(ni+1);setStatus(null)},500)}}
      else{setWrongSq([row,col]);setWrongMove(uci);setStatus("fail");record(puzzle.id,false,puzzle.th,mode==="endgames"?"endgameSR":"tacticsSR");if(timerMode)setRushTotal(t=>t+1);setTimeout(()=>setWrongSq(null),1200)}
    }else{const p=board[row][col];if(p&&((getClr(puzzle.fen)==="w"&&isW(p))||(getClr(puzzle.fen)!=="w"&&!isW(p)))){setSel([row,col]);setMvs(getMvs(board,row,col))}}
  },[board,sel,puzzle,mIdx,status,hintUsed,record,timerMode,mode]);

  const getHint=useCallback(()=>{if(!puzzle||mIdx>=puzzle.sol.length)return;const{fr,fc}=u2c(puzzle.sol[mIdx]);setHintUsed(true);setSel([fr,fc]);setMvs(getMvs(board,fr,fc))},[puzzle,mIdx,board]);
  const showAns=useCallback(()=>{if(!puzzle)return;let b=board;for(let i=mIdx;i<puzzle.sol.length;i++)b=doMove(b,puzzle.sol[i]);setBoard(b);setLastMv(u2c(puzzle.sol[puzzle.sol.length-1]));setStatus("solved");setSel(null);setMvs([])},[puzzle,board,mIdx]);

  const showGuide=useCallback((moveIdx:number,op:Opening)=>{if(moveIdx<op.moves.length){const{fr,fc,tr,tc}=u2c(op.moves[moveIdx]);setGuideSq([fr,fc,tr,tc])}},[]);
  const startOpening=useCallback((op:Opening,guide:boolean)=>{
    const isNew=!data?.openingSR?.[op.id];const useGuide=guide||isNew;
    setOpLine(op);setOpMoveIdx(0);setOpStatus(null);setOpTip(op.tips[0]||"");setBoard(parseFEN(START_FEN));setSel(null);setMvs([]);setLastMv(null);setCoach(null);setHintUsed(false);setOpGuideMode(useGuide);setGuideSq(null);setMode("openings");setView("puzzle");
    if(op.color==="b"){setTimeout(()=>{const b=doMove(parseFEN(START_FEN),op.moves[0]);setBoard(b);setLastMv(u2c(op.moves[0]));setOpMoveIdx(1);setOpTip(op.tips[1]||"");if(useGuide)setTimeout(()=>showGuide(1,op),300)},500)}
    else if(useGuide){setTimeout(()=>showGuide(0,op),300)}
  },[data,showGuide]);

  const onOpSqClick=useCallback((row:number,col:number)=>{
    if(!opLine||opStatus==="done"||opStatus==="fail")return;const playerW=opLine.color==="w";const curIdx=opMoveIdx;if(curIdx>=opLine.moves.length){setOpStatus("done");return}
    if(sel){if(sel[0]===row&&sel[1]===col){setSel(null);setMvs([]);return}const p=board[row][col];if(p&&((playerW&&isW(p))||(!playerW&&!isW(p)))){setSel([row,col]);setMvs(getMvs(board,row,col));return}
      const uci=c2u(sel[0],sel[1],row,col);
      if(uci===opLine.moves[curIdx]){const nb=doMove(board,uci);setBoard(nb);setSel(null);setMvs([]);setLastMv(u2c(uci));setGuideSq(null);const ni=curIdx+1;
        if(ni>=opLine.moves.length){setOpStatus("done");setOpTip("Opening complete! 🎉");record(opLine.id,!hintUsed,["opening"],"openingSR")}
        else{setOpMoveIdx(ni);setOpTip(opLine.tips[ni]||"");setTimeout(()=>{const nb2=doMove(nb,opLine.moves[ni]);setBoard(nb2);setLastMv(u2c(opLine.moves[ni]));const ni2=ni+1;if(ni2>=opLine.moves.length){setOpStatus("done");setOpTip("Opening complete! 🎉");record(opLine.id,!hintUsed,["opening"],"openingSR")}else{setOpMoveIdx(ni2);setOpTip(opLine.tips[ni2]||"");if(opGuideMode)setTimeout(()=>showGuide(ni2,opLine),300)}},500)}}
      else{setWrongSq([row,col]);if(!opGuideMode){setOpStatus("fail");record(opLine.id,false,["opening"],"openingSR")}setTimeout(()=>setWrongSq(null),800)}}
    else{const p=board[row][col];if(p&&((playerW&&isW(p))||(!playerW&&!isW(p)))){setSel([row,col]);setMvs(getMvs(board,row,col))}}
  },[opLine,opMoveIdx,board,sel,opStatus,hintUsed,record,opGuideMode,showGuide]);

  const getOpHint=useCallback(()=>{if(!opLine||opMoveIdx>=opLine.moves.length)return;const{fr,fc}=u2c(opLine.moves[opMoveIdx]);setHintUsed(true);setSel([fr,fc]);setMvs(getMvs(board,fr,fc))},[opLine,opMoveIdx,board]);

  const doAskCoach=useCallback(async()=>{if(coachLoad)return;setCoachLoad(true);let ctx="";if(mode==="tactics"||mode==="endgames"){ctx="Position (FEN): "+puzzle?.fen+"\nCorrect solution: "+puzzle?.sol?.join(", ")+"\nTactical themes: "+puzzle?.th?.map(t=>THEMES[t]?.l||t).join(", ")+"\nResult: "+(status==="solved"?"Player solved it correctly!":"Player failed — show them the correct approach")+"\nPuzzle title: "+(puzzle?.t||"")+"\nPuzzle concept: "+(puzzle?.desc||"")+"\n"+(puzzle?.tip?"Endgame principle: "+puzzle.tip+"\n":"")+(puzzle?.goal?"Correct move explanation: "+puzzle.goal+"\n":"")}else{ctx="Opening: "+opLine?.name+"\nOpening background: "+(opLine?.desc||"")+"\nMoves played so far: "+opLine?.moves?.slice(0,opMoveIdx).join(" ")+"\nResult: "+(opStatus==="done"?"Player completed the opening line":"Player made a wrong move")+"\nOpening summary: "+opLine?.summary}const msg=await askCoach(ctx,status!=="solved"?wrongMove:null,mode);setCoach(msg);setCoachLoad(false)},[mode,puzzle,status,wrongMove,opLine,opMoveIdx,opStatus,coachLoad]);
  const showStaticCoach=useCallback(()=>{if(mode==="openings"&&opLine){setCoach(opLine.summary);return}if(puzzle){if(puzzle.tip){setCoach(puzzle.tip);return}setCoach(getStaticCoaching(puzzle.th,status==="solved"))}},[mode,opLine,puzzle,status]);

  if(!mounted)return<div style={{minHeight:"100vh",background:"#FAFAF8",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"#2E7D32",fontSize:"18px"}}>Loading...</p></div>;

  const css=`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`;
  const bSm:React.CSSProperties={padding:"7px 14px",borderRadius:"8px",border:"1px solid #D0D0C8",background:"#FFF",color:"#555",fontSize:"13px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
  const bP:React.CSSProperties={padding:"10px 18px",borderRadius:"10px",border:"none",background:"#2E7D32",color:"#FFF",fontSize:"15px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
  const bS:React.CSSProperties={padding:"10px 18px",borderRadius:"10px",border:"1px solid #D0D0C8",background:"#FFF",color:"#333",fontSize:"15px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
  const card:React.CSSProperties={background:"#FFF",border:"1px solid #E8E8E0",borderRadius:"12px",padding:"14px",marginBottom:"10px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"};
  const tag=(c:string):React.CSSProperties=>({display:"inline-flex",alignItems:"center",gap:"3px",padding:"3px 10px",borderRadius:"14px",background:c+"15",border:"1px solid "+c+"30",fontSize:"13px",color:c,fontWeight:600});

  // ═══════ USERS ═══════
  if(view==="users"){return(<div style={{minHeight:"100vh",background:"#FAFAF8",fontFamily:"'Segoe UI',sans-serif"}}><style>{css}</style><div style={{maxWidth:"420px",margin:"0 auto",padding:"40px 16px",textAlign:"center"}}>
    <div style={{fontSize:"56px",marginBottom:"4px"}}>♞</div>
    <h1 style={{fontSize:"28px",fontWeight:700,color:"#1B5E20",margin:"0 0 2px"}}>Chess Companion</h1>
    <p style={{fontSize:"14px",color:"#999",marginBottom:"28px"}}>Tactics · Openings · Endgames</p>
    <h2 style={{fontSize:"18px",fontWeight:600,marginBottom:"14px"}}>Who&apos;s playing today?</h2>
    {users.map(u=>(<div key={u.id} style={{...card,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"14px 18px"}} onClick={()=>selectUser(u.id,u.name)}><div style={{display:"flex",alignItems:"center",gap:"12px"}}><span style={{fontSize:"28px"}}>♟</span><span style={{fontSize:"20px",fontWeight:600}}>{u.name}</span></div><button onClick={(e)=>{e.stopPropagation();deleteUser(u.id)}} style={{background:"none",border:"none",color:"#CCC",cursor:"pointer",fontSize:"18px"}}>✕</button></div>))}
    <div style={{...card,marginTop:"16px"}}><div style={{display:"flex",gap:"8px"}}><input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createUser()} placeholder="Add a player..." style={{flex:1,padding:"12px 14px",borderRadius:"10px",border:"1px solid #D0D0C8",background:"#F8F8F5",color:"#2D2D2D",fontSize:"16px",fontFamily:"inherit",outline:"none"}}/><button onClick={createUser} style={{...bP,padding:"12px 22px"}}>Add</button></div></div>
  </div></div>)}

  // ═══════ DIFFICULTY PICKER (modal) ═══════
  if(showDiffPicker){
    const lvl=data?.level||2;
    return(<div style={{minHeight:"100vh",background:"#FAFAF8",fontFamily:"'Segoe UI',sans-serif"}}><div style={{maxWidth:"420px",margin:"0 auto",padding:"24px 16px"}}>
      <button onClick={()=>setShowDiffPicker(false)} style={bSm}>← Back</button>
      <h2 style={{fontSize:"22px",fontWeight:700,margin:"16px 0 4px"}}>Choose Difficulty</h2>
      <p style={{fontSize:"14px",color:"#888",margin:"0 0 14px"}}>{pickerMode==="rush"?"Puzzle Rush":"Daily Training"} — select your level</p>
      {LEVELS.map(l=>(<button key={l.n} onClick={()=>{if(data)setData({...data,level:l.n});startSession(pickerMode==="rush",l.n)}} style={{...card,display:"flex",alignItems:"center",gap:"14px",width:"100%",cursor:"pointer",textAlign:"left",padding:"14px 16px",borderColor:lvl===l.n?"#2E7D32":"#E8E8E0",background:lvl===l.n?"#E8F5E9":"#FFF"}}>
        <div style={{width:"36px",height:"36px",borderRadius:"50%",background:l.n<=2?"#E8F5E9":l.n<=4?"#FFF3E0":"#FFEBEE",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:"16px",color:l.n<=2?"#2E7D32":l.n<=4?"#E65100":"#C62828",flexShrink:0}}>{l.n}</div>
        <div><div style={{fontWeight:700,fontSize:"16px",color:"#333"}}>{l.label}</div><div style={{fontSize:"13px",color:"#888"}}>{l.desc}</div></div>
      </button>))}
    </div></div>);
  }

  // ═══════ HOME — compact layout ═══════
  if(view==="home"&&data){
    const today=new Date().toDateString();const sk=data.lastDate===today||data.lastDate===new Date(Date.now()-864e5).toDateString()?data.streak:0;const mastered=Object.values(data.tacticsSR).filter(s=>s.rep>=3).length;const opLearned=Object.values(data.openingSR).filter(s=>s.rep>=1).length;const acc=data.att>0?Math.round(data.solved/data.att*100):0;
    return(<div style={{minHeight:"100vh",background:"#FAFAF8",fontFamily:"'Segoe UI',sans-serif"}}><div style={{maxWidth:"520px",margin:"0 auto",padding:"14px 14px"}}>
      {/* Header row: name + compact stats */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",gap:"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px",minWidth:0}}>
          <button onClick={()=>setView("users")} style={{...bSm,padding:"5px 10px",fontSize:"12px",flexShrink:0}}>←</button>
          <div style={{minWidth:0}}><div style={{fontSize:"20px",fontWeight:700,color:"#1B5E20",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{uname}</div></div>
        </div>
        <div style={{display:"flex",gap:"8px",flexShrink:0,fontSize:"13px",color:"#888"}}>
          <span title="Solved">✓{data.solved}</span>
          <span title="Accuracy">{acc}%</span>
          <span title="Mastered">⭐{mastered}</span>
          {sk>0&&<span>🔥{sk}d</span>}
        </div>
      </div>

      {/* Tactics */}
      <div style={card}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}><h3 style={{fontSize:"17px",fontWeight:700,color:"#1B5E20",margin:0}}>⚔️ Tactics</h3><span style={{fontSize:"12px",color:"#AAA"}}>Level {data.level||2} · {LEVELS[(data.level||2)-1]?.label}</span></div>
        <div style={{display:"flex",gap:"8px"}}><button onClick={()=>{setPickerMode("train");setShowDiffPicker(true)}} style={{...bP,flex:1,fontSize:"14px"}}>♟ Train</button><button onClick={()=>{setPickerMode("rush");setShowDiffPicker(true)}} style={{...bS,flex:1,fontSize:"14px"}}>⏱ Rush</button><button onClick={()=>setView("stats")} style={{...bSm,fontSize:"12px"}}>📊</button></div>
        <div style={{display:"flex",gap:"8px",marginTop:"6px",fontSize:"12px",color:"#999"}}><span style={{flex:1,textAlign:"center"}}>Untimed · 10 puzzles · learn deeply</span><span style={{flex:1,textAlign:"center"}}>3 min timer · speed training</span></div>
      </div>

      {/* Openings */}
      <div style={card}>
        <h3 style={{fontSize:"17px",fontWeight:700,color:"#1B5E20",margin:"0 0 8px"}}>📖 Openings <span style={{fontSize:"12px",fontWeight:400,color:"#AAA"}}>{opLearned}/{OPENINGS.length} learned</span></h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>{OPENINGS.map(op=>{const sr=data.openingSR[op.id];const done=sr?.rep>=1;const mast=sr?.rep>=3;const isNew=!sr;
          return(<button key={op.id} onClick={()=>startOpening(op,false)} style={{...bSm,fontSize:"12px",padding:"5px 10px",borderColor:mast?"#4CAF50":done?"#FF9800":undefined,background:mast?"#E8F5E9":done?"#FFF8E1":"#FFF"}}>{op.color==="w"?"⬜":"⬛"} {op.name}{isNew?" 🆕":mast?" ⭐":done?" ✓":""}</button>)})}</div>
      </div>

      {/* Endgames */}
      <div style={card}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontSize:"17px",fontWeight:700,color:"#1B5E20",margin:0}}>🎭 Endgames</h3><button onClick={startEndgame} style={{...bP,fontSize:"14px",padding:"8px 18px"}}>{ENDGAMES.length} positions →</button></div>
      </div>
    </div></div>)}

  // ═══════ STATS ═══════
  if(view==="stats"&&data){
    const themes=Object.entries(data.themeStats).sort((a,b)=>b[1].att-a[1].att);
    return(<div style={{minHeight:"100vh",background:"#FAFAF8",fontFamily:"'Segoe UI',sans-serif"}}><div style={{maxWidth:"480px",margin:"0 auto",padding:"14px 14px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}><button onClick={()=>setView("home")} style={bSm}>← Back</button><h2 style={{fontSize:"20px",fontWeight:700,margin:0}}>{uname}</h2></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom:"14px"}}>{[{l:"Tried",v:data.att,c:"#555"},{l:"Solved",v:data.solved,c:"#4CAF50"},{l:"Accuracy",v:data.att>0?Math.round(data.solved/data.att*100)+"%":"—",c:"#1B5E20"},{l:"Rush",v:data.rushBest,c:"#FF9800"}].map(s=>(<div key={s.l} style={{textAlign:"center",padding:"10px 4px",background:"#F5F5F0",borderRadius:"10px"}}><div style={{fontSize:"20px",fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:"10px",color:"#999",textTransform:"uppercase"}}>{s.l}</div></div>))}</div>
      {themes.length>0&&<>{themes.map(([t,s])=>{const acc=Math.round(s.cor/s.att*100);const col=acc>=70?"#4CAF50":acc>=40?"#FF9800":"#F44336";const m=THEMES[t]||{l:t,i:"♟"};return(<div key={t} style={{...card,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px"}}><div style={{display:"flex",alignItems:"center",gap:"8px"}}><span>{m.i}</span><span style={{fontWeight:600,fontSize:"14px"}}>{m.l}</span><span style={{fontSize:"12px",color:"#AAA"}}>{s.cor}/{s.att}</span></div><span style={{fontSize:"18px",fontWeight:700,color:col}}>{acc}%</span></div>)})}</>}
      <button onClick={()=>{if(confirm("Reset?")){const f=mkData();setData(f);if(uid)saveUD(uid,f)}}} style={{...bS,width:"100%",marginTop:"14px",color:"#F44336",borderColor:"#FFCDD2",fontSize:"13px"}}>Reset Progress</button>
    </div></div>)}

  // ═══════ PUZZLE VIEW — compact, no-scroll ═══════
  const isOp=mode==="openings"&&opLine;const pw=isOp?opLine!.color==="w":puzzle?getClr(puzzle.fen)==="w":true;const curStatus=isOp?opStatus:status;const rem=qRef.current.length;
  return(<div style={{minHeight:"100vh",background:"#FAFAF8",fontFamily:"'Segoe UI',sans-serif"}}><style>{css}</style>
    <div style={{maxWidth:"440px",margin:"0 auto",padding:"8px 12px",display:"flex",flexDirection:"column",minHeight:"100vh"}}>
      {/* Top bar — very compact */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"}}>
        <button onClick={()=>{setTimerActive(false);if(timerMode&&rushScore>0&&data)setData({...data,rushBest:Math.max(data.rushBest,rushScore)});setView("home")}} style={{...bSm,padding:"4px 10px",fontSize:"12px"}}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          {timerMode&&<Timer active={timerActive} dur={180} onTimeout={()=>{setTimerActive(false);setStatus("timeout");if(data)setData({...data,rushBest:Math.max(data.rushBest,rushScore)})}}/>}
          {timerMode&&<span style={{fontSize:"18px",fontWeight:700,color:"#1B5E20"}}>{rushScore}</span>}
          {!timerMode&&!isOp&&<span style={{fontSize:"13px",color:"#AAA"}}>{rem+1} left</span>}
        </div>
      </div>

      {/* Title row */}
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px",flexWrap:"wrap"}}>
        <span style={{fontSize:"18px",fontWeight:700}}>{isOp?opLine!.name:puzzle?.t}</span>
        <span style={tag(mode==="tactics"?"#D84315":mode==="openings"?"#1565C0":"#6A1B9A")}>{mode==="tactics"?"⚔️":mode==="openings"?"📖":"🎭"}</span>
        {!isOp&&puzzle&&<span style={tag("#FF9800")}>⭐{puzzle.r}</span>}
        {isOp&&<span style={tag(opGuideMode?"#2196F3":"#FF9800")}>{opGuideMode?"Learn":"Practice"}</span>}
      </div>

      {/* Opening tip */}
      {isOp&&opTip&&<div style={{background:opGuideMode?"#E3F2FD":"#E8F5E9",border:"1px solid "+(opGuideMode?"#BBDEFB":"#C8E6C9"),borderRadius:"10px",padding:"10px 12px",marginBottom:"6px"}}>
        <p style={{margin:0,fontSize:"15px",lineHeight:1.5,color:opGuideMode?"#1565C0":"#2E7D32"}}>{opGuideMode&&guideSq?"👆 ":""}{opTip}{opGuideMode&&guideSq?<span style={{fontSize:"13px",color:"#888"}}> — move the highlighted piece</span>:null}</p>
      </div>}
      {/* Opening description (first move only) */}
      {isOp&&opLine&&!curStatus&&opMoveIdx<=1&&opLine.desc&&<div style={{background:"#FFF",border:"1px solid #E0E0E0",borderRadius:"10px",padding:"8px 12px",marginBottom:"4px"}}><p style={{margin:0,fontSize:"13px",lineHeight:1.4,color:"#666"}}>📖 {opLine.desc}</p></div>}
      {/* Puzzle goal/description (before solving) */}
      {!isOp&&puzzle?.desc&&!curStatus&&<div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:"10px",padding:"8px 12px",marginBottom:"4px"}}><p style={{margin:0,fontSize:"13px",lineHeight:1.4,color:"#795548"}}>{puzzle.desc}</p></div>}

      {/* Turn indicator */}
      <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}>
        <div style={{width:"14px",height:"14px",borderRadius:"50%",background:pw?"#FFF":"#333",border:"2px solid #999"}}/>
        <span style={{fontSize:"15px",color:"#888"}}>{curStatus==="solved"||curStatus==="done"?"Complete! 🎉":curStatus==="fail"?"Incorrect":curStatus==="ok"?"Correct!":curStatus==="timeout"?rushScore+" solved":(pw?"White":"Black")+" to move"}</span>
      </div>

      {/* Board — centered, compact */}
      <div style={{display:"flex",justifyContent:"center",marginBottom:"6px"}}><Board board={board} flipped={!pw} sel={sel} mvs={mvs} onClick={isOp?onOpSqClick:onSqClick} lastMv={lastMv} wrongSq={wrongSq} guideSq={opGuideMode?guideSq:null} compact/></div>

      {/* Post-puzzle content — compact */}
      {!isOp&&puzzle?.goal&&(curStatus==="solved"||curStatus==="fail")&&<div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:"10px",padding:"10px 12px",marginBottom:"6px"}}><p style={{margin:0,fontSize:"14px",lineHeight:1.5,color:"#795548"}}>📝 {puzzle.goal}</p></div>}
      {mode==="endgames"&&puzzle?.tip&&(curStatus==="solved"||curStatus==="fail")&&<div style={{background:"#E8F5E9",borderRadius:"10px",padding:"10px 12px",marginBottom:"6px"}}><p style={{margin:0,fontSize:"14px",lineHeight:1.5,color:"#2E7D32"}}>💡 {puzzle.tip}</p></div>}
      {isOp&&curStatus==="done"&&opLine!.summary&&<div style={{background:"#E8F5E9",borderRadius:"10px",padding:"10px 12px",marginBottom:"6px"}}><p style={{margin:0,fontSize:"14px",lineHeight:1.5,color:"#2E7D32"}}>📖 {opLine!.summary}</p></div>}

      {!isOp&&curStatus==="solved"&&<div style={{background:"#E8F5E9",borderRadius:"10px",padding:"10px",marginBottom:"6px",textAlign:"center"}}><span style={{fontSize:"16px",fontWeight:700,color:"#2E7D32"}}>🎉 {hintUsed?"Solved with hint":"Brilliant!"}</span></div>}
      {curStatus==="fail"&&!isOp&&<div style={{background:"#FFEBEE",borderRadius:"10px",padding:"10px",marginBottom:"6px",textAlign:"center"}}><span style={{fontSize:"16px",fontWeight:700,color:"#D32F2F"}}>💡 Not quite</span></div>}
      {curStatus==="fail"&&isOp&&!opGuideMode&&<div style={{background:"#FFEBEE",borderRadius:"10px",padding:"10px",marginBottom:"6px",textAlign:"center"}}><span style={{fontSize:"14px",fontWeight:600,color:"#D32F2F"}}>Try Learn Mode first!</span></div>}
      {curStatus==="timeout"&&<div style={{background:"#FFF3E0",borderRadius:"10px",padding:"10px",marginBottom:"6px",textAlign:"center"}}><span style={{fontSize:"16px",fontWeight:700,color:"#E65100"}}>⏱ Score: {rushScore}{rushScore>(data?.rushBest||0)?" 🏆 New best!":""}</span></div>}

      {/* Theme badges */}
      {!isOp&&(curStatus==="solved"||curStatus==="fail")&&<div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginBottom:"6px"}}>{puzzle?.th?.map(t=><span key={t} style={tag("#1B5E20")}>{THEMES[t]?.i} {THEMES[t]?.l}</span>)}</div>}

      {/* Coach */}
      {(curStatus==="solved"||curStatus==="fail"||curStatus==="done")&&!coach&&<div style={{display:"flex",gap:"6px",marginBottom:"6px"}}><button onClick={showStaticCoach} style={{...bS,flex:1,fontSize:"14px",padding:"8px"}}>💡 Tip</button><button onClick={doAskCoach} disabled={coachLoad} style={{...bS,flex:1,fontSize:"14px",padding:"8px",opacity:coachLoad?.5:1}}>{coachLoad?"🤔...":"🧠 AI Coach"}</button></div>}
      {coach&&<div style={{background:"#E8F5E9",borderRadius:"10px",padding:"10px 12px",marginBottom:"6px"}}><p style={{margin:0,fontSize:"14px",lineHeight:1.5,color:"#2E7D32"}}>{coach}</p></div>}

      {/* Action buttons — always visible */}
      <div style={{display:"flex",gap:"8px",marginTop:"auto",paddingBottom:"10px"}}>
        {isOp&&!curStatus&&<button onClick={getOpHint} style={{...bS,flex:1}}>💡 Hint</button>}
        {!isOp&&!curStatus&&curStatus!=="ok"&&<><button onClick={getHint} style={{...bS,flex:1}}>💡 Hint</button><button onClick={showAns} style={{...bS,flex:1}}>👁 Answer</button></>}
        {(curStatus==="solved"||curStatus==="fail"||curStatus==="done")&&<>{isOp?<><button onClick={()=>startOpening(opLine!,true)} style={{...bS,flex:1,fontSize:"14px"}}>📘 Learn</button><button onClick={()=>startOpening(opLine!,false)} style={{...bS,flex:1,fontSize:"14px"}}>🔄 Practice</button><button onClick={()=>setView("home")} style={{...bP,flex:1}}>Done</button></>:<><button onClick={()=>startPuzzle(puzzle!,mode)} style={{...bS,flex:1}}>🔄 Retry</button><button onClick={nextPuzzle} style={{...bP,flex:1}}>{rem>0?"Next →":"Finish"}</button></>}</>}
        {curStatus==="timeout"&&<button onClick={()=>setView("home")} style={{...bP,width:"100%"}}>Home</button>}
      </div>
    </div>
  </div>);
}
