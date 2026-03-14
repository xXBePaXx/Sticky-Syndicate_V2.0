import { useState, useEffect, useRef, useCallback } from "react";

ASSET_PLACEHOLDER

// ─── DEFAULT ACCOUNTS & INITIAL STATE ────────────────────────────────────────
const DEFAULT_ACCOUNTS = [
  { username:"admin",   password:"admin123", role:"admin",  displayName:"Admin" },
  { username:"verde",   password:"verde1",   role:"player", displayName:"El Verde" },
  { username:"carlos2", password:"carlos2",  role:"player", displayName:"Carlos Jr." },
  { username:"ghost99", password:"ghost99",  role:"player", displayName:"Ghost_99" },
  { username:"rookie",  password:"rookie1",  role:"player", displayName:"Rookie" },
];

const EMPTY_GAME_STATE = () => ({
  cash:420, earned:0, harvests:0, planted:false, mutations:0,
  bestGrade:"D", upgrades:[], inventory:[], plants:[null,null],
  seenChapters:[], tutStep:0, unlockedAchievements:[],
  lastBeach:null, settings:{confirmBuy:true,showTutHints:true,missionBanner:true,waterWarning:true},
  lastSeen: new Date().toISOString(),
});

const DEFAULT_DIALOGS = {
  papa:   ["Die Pflanze kennt dein Herz. Gieß sie mit Liebe.","Die ersten Samen sind immer die wichtigsten.","Qualität schlägt Quantität – merke dir das.","Ich hab auf dieser Insel vieles gesehen. Du bist... anders."],
  carlos: ["Grade A? Ich hab den richtigen Käufer dafür.","Der Markt schläft nie. Ich auch nicht.","Auf dieser Insel hat jeder seinen Preis. Was ist deiner?","Vertrau mir. Oder auch nicht. Aber verkauf mir die Ernte."],
  sanchez:["Coffee First. Dann reden wir.","Legale Lizenzen? Sehr... interessant.","Ich seh heute nichts. Morgen vielleicht wieder.","Du arbeitest hart. Das respektiere ich."],
  ghost:  ["...","Ich weiß wer du bist.","$10.000. Dann reden wir.","– G"],
};

// ─── STORAGE HELPERS ─────────────────────────────────────────────────────────
// ── Firebase Firestore Store ──────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCAivKTReLriLGwWkAkdXE59ZeXuPllLeA",
  authDomain: "sticky-syndicate.firebaseapp.com",
  projectId: "sticky-syndicate",
  storageBucket: "sticky-syndicate.firebasestorage.app",
  messagingSenderId: "597121685068",
  appId: "1:597121685068:web:4798cab3da8ebad6d886e9"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Firestore key sanitizer: colons not allowed in doc IDs
const sk = k => k.replace(/:/g,"__");
const uk = k => k.replace(/__/g,":");

const store = {
  async get(key) {
    try {
      const snap = await getDoc(doc(db, "gamedata", sk(key)));
      return snap.exists() ? snap.data().value : null;
    } catch(e) { console.warn("store.get",key,e); return null; }
  },
  async set(key, val) {
    try {
      await setDoc(doc(db, "gamedata", sk(key)), { value: val, updatedAt: Date.now() });
      return true;
    } catch(e) { console.warn("store.set",key,e); return false; }
  },
  async delete(key) {
    try { await deleteDoc(doc(db, "gamedata", sk(key))); return true; }
    catch(e) { return false; }
  },
  async list(prefix) {
    try {
      const snap = await getDocs(collection(db, "gamedata"));
      const keys = [];
      snap.forEach(d => { const k=uk(d.id); if(k.startsWith(prefix)) keys.push(k); });
      return keys;
    } catch(e) { console.warn("store.list",e); return []; }
  },
};

async function seedAccounts() {
  // Seed default items if not yet stored
  const storedItems = await store.get("settings:items");
  if (!storedItems) {
    await store.set("settings:items", {
      strains: DEFAULT_STRAINS,
      upgrades: DEFAULT_UPGRADES,
      beach: DEFAULT_BEACH_ITEMS,
    });
  } else {
    if (storedItems.strains) STRAINS = storedItems.strains;
    if (storedItems.upgrades) UPGRADES = storedItems.upgrades;
    if (storedItems.beach) BEACH_ITEMS = storedItems.beach;
  }
  for (const acc of DEFAULT_ACCOUNTS) {
    const existing = await store.get(`user:${acc.username}`);
    if (!existing) {
      await store.set(`user:${acc.username}`, {
        password: acc.password,
        role: acc.role,
        displayName: acc.displayName,
        locked: false,
        gameState: acc.role === "player" ? EMPTY_GAME_STATE() : null,
      });
    }
  }
  const dialogs = await store.get("settings:dialogs");
  if (!dialogs) await store.set("settings:dialogs", DEFAULT_DIALOGS);
  const global = await store.get("settings:global");
  if (!global) await store.set("settings:global", { announcement:"", maintenanceMode:false });
}

async function addLog(username, action, detail) {
  const key = `log:${username}`;
  const logs = (await store.get(key)) || [];
  logs.unshift({ time: new Date().toISOString(), action, detail });
  await store.set(key, logs.slice(0, 100));
}

// ─── GAME DATA ────────────────────────────────────────────────────────────────
const STAGES=[
  {id:0,name:"Keimung", emoji:"🌱",duration:18,color:"#86efac"},
  {id:1,name:"Wachstum",emoji:"🌿",duration:22,color:"#4ade80"},
  {id:2,name:"Blüte",   emoji:"🌸",duration:28,color:"#f9a8d4"},
  {id:3,name:"Ernte!",  emoji:"✂️", duration:0, color:"#fbbf24"},
];
const DEFAULT_STRAINS=[
  // qualityCap: max erreichbare Qualität (0-100). Common=65 → Note max B
  // stressTolerance: wie gut die Pflanze Trockenstress aushält
  // waterNeeds: Multiplikator für Wasserverlust pro Tick
  // growSpeed: Multiplikator für Wachstumsgeschwindigkeit
  {id:"island_haze",   name:"Island Haze",   emoji:"🌴",rarity:"Common",basePrice:160,bud:"bud_basic",
   seedCost:40,  qualityCap:65,  stressTolerance:70,waterNeeds:0.8, growSpeed:1.0,
   sellDays:[],bonusPercent:50},
  {id:"tropical_dream",name:"Tropical Dream",emoji:"🌺",rarity:"Common",basePrice:180,bud:"bud_purple",
   seedCost:60,  qualityCap:70,  stressTolerance:55,waterNeeds:1.0, growSpeed:1.1,
   sellDays:[5,6],bonusPercent:50},
  {id:"coral_kush",    name:"Coral Kush",    emoji:"🪸",rarity:"Rare",  basePrice:320,bud:"bud_neon",
   seedCost:120, qualityCap:88,  stressTolerance:40,waterNeeds:1.2, growSpeed:0.9,
   sellDays:[2],bonusPercent:75},
  {id:"phantom_orchid",name:"Phantom Orchid",emoji:"🌸",rarity:"Epic",  basePrice:600,bud:"bud_gold",
   seedCost:200, qualityCap:100, stressTolerance:20,waterNeeds:1.5, growSpeed:0.75,
   sellDays:[0,6],bonusPercent:100},
];
// Will be overridden by storage if admin has customized items
let STRAINS = [...DEFAULT_STRAINS];
const GRADES=[
  {grade:"D", label:"Mies",    color:"#ef4444",min:0 },
  {grade:"C", label:"Okay",    color:"#f97316",min:40},
  {grade:"B", label:"Gut",     color:"#eab308",min:60},
  {grade:"A", label:"Top",     color:"#22c55e",min:78},
  {grade:"A+",label:"Legendär",color:"#a855f7",min:92},
];
const RARITY_C={Common:"#60a5fa",Rare:"#a855f7",Epic:"#f59e0b"};
const DEFAULT_UPGRADES=[
  {id:"auto_water",    name:"Auto-Bewässerung",  img:"item_fertilizer",cost:800,  desc:"Wasser sinkt 50% langsamer",   dayAvailability:[]},
  {id:"grow_lamp",     name:"Pro-Wachstumslampe", img:"icon_lightning",  cost:1200, desc:"+30% schnelleres Wachstum",   dayAvailability:[]},
  {id:"extra_slot",    name:"2. Pflanzplatz",      img:"grow_box",        cost:2000, desc:"Zwei Pflanzen gleichzeitig",  dayAvailability:[]},
  {id:"bike_delivery", name:"Fahrrad-Lieferung",   img:"vehicle_bike",    cost:1500, desc:"+20% Marktpreis täglich",    dayAvailability:[]},
  {id:"dobermann",     name:"Dobermann Rex",        img:"npc_dobermann",   cost:3500, desc:"Schutz vor Razzien",         dayAvailability:[]},
];
let UPGRADES = [...DEFAULT_UPGRADES];
const NPCS_BASE=[
  {id:"papa",   name:"Papa Verde",     title:"Dein Mentor",   img:"npc_mentor2", color:"#4ade80",unlocked:true},
  {id:"carlos", name:"Don Carlos",     title:"Markt-Kontakt", img:"npc_tropical",color:"#fbbf24",unlocked:true},
  {id:"sanchez",name:"Officer Sanchez",title:"Lokale Polizei",img:"npc_police2", color:"#60a5fa",unlocked:true},
  {id:"ghost",  name:"G H O S T",      title:"??? Gesperrt",  img:"npc_ghost2",  color:"#ef4444",unlocked:false},
];
const ACHIEVEMENTS=[
  {id:"first",   name:"First Harvest",  img:"badge_harvest", desc:"Erste Ernte",      check:s=>s.harvests>=1},
  {id:"cash1k",  name:"Cash is King",   img:"icon_money",    desc:"$1.000 verdient",   check:s=>s.earned>=1000},
  {id:"boss",    name:"Syndicate Boss", img:"badge_boss",    desc:"$10.000 verdient",  check:s=>s.earned>=10000},
  {id:"perfect", name:"Perfektionist",  img:"icon_logbook",  desc:"Grade A+ erreicht", check:s=>s.bestGrade==="A+"},
  {id:"hof",     name:"Hall of Fame",   img:"statue_hof",    desc:"$50.000 verdient",  check:s=>s.earned>=50000},
];
const DEFAULT_BEACH_ITEMS=[
  {name:"Kokos-Paket",img:"item_coconut",cash:50, seeds:0,prob:0.4},
  {name:"Papaya-Fund",img:"item_papaya", cash:80, seeds:0,prob:0.3},
  {name:"Samen-Dose", img:"item_seeds",  cash:0,  seeds:1,prob:0.2},
  {name:"Rum-Fass",   img:"item_rum",    cash:200,seeds:0,prob:0.1},
];
let BEACH_ITEMS = [...DEFAULT_BEACH_ITEMS];
const STORY_CHAPTERS=[
  {id:0,scenes:[
    {speaker:null,bg:"bg_beach",text:"Du erinnerst dich an das Salzwasser.\nAn Sand in deinen Schuhen.\nAn die Stille nach dem Sturm.",mood:"dark"},
    {speaker:"papa",name:"Papa Verde",img:"npc_mentor2",bg:"bg_beach",text:"Hé, Junge... ich hab dich gefunden.\nHalbverdurstet, leere Taschen, kein Name.\nWillkommen auf Isla Verde.",mood:"warm"},
    {speaker:"papa",name:"Papa Verde",img:"npc_mentor2",bg:"bg_beach",text:"Diese Insel gibt dir alles, was du brauchst.\nAber sie gibt nichts umsonst.\n\nNimm das hier – meine letzten Samen.",mood:"warm"},
    {speaker:"papa",name:"Papa Verde",img:"npc_mentor2",bg:"bg_beach",text:"Die alte Hütte am Waldrand gehört dir jetzt.\nDort drinnen ist dein erstes Growbett.\n\nBeweise mir, dass du es wert bist.",mood:"mission"},
  ]},
];
const CHAPTER_TRIGGERS=[
  {id:"ch1",after:"harvest",count:1,scenes:[
    {speaker:"papa",name:"Papa Verde",img:"npc_mentor2",bg:"bg_villa",text:"Nicht schlecht für einen Gestrandeten.\nAber auf Isla Verde reicht Talent allein nicht.",mood:"warm"},
    {speaker:"carlos",name:"Don Carlos",img:"npc_tropical",bg:"bg_market",text:"Ich hör du hast was zu verkaufen.\nDon Carlos kennt jeden Käufer auf dieser Insel.",mood:"gold"},
  ]},
  {id:"ch2",after:"earned",threshold:1000,scenes:[
    {speaker:"carlos",name:"Don Carlos",img:"npc_tropical",bg:"bg_market",text:"Tausend Dollar. Officer Sanchez hat dich bemerkt – das ist gut... oder sehr schlecht.",mood:"gold"},
    {speaker:"sanchez",name:"Officer Sanchez",img:"npc_police2",bg:"bg_market",text:"*Schaut dich über seinen Kaffee hinweg an*\n\nCoffee First.\n\n...Ich seh heute nichts.",mood:"blue"},
  ]},
  {id:"ch3",after:"earned",threshold:5000,scenes:[
    {speaker:null,bg:"bg_lab",text:"Du öffnest dein Terminal.\nEine anonyme Nachricht blinkt auf:",mood:"dark"},
    {speaker:"ghost",name:"???",img:"npc_ghost2",bg:"bg_lab",text:"Ich weiß was du machst.\nIch weiß wer du bist.\n\nWir müssen reden.\n\n– G",mood:"danger"},
  ]},
];
const TUTORIAL_STEPS=[
  {id:"plant",  screen:"grow",   title:"🌱 Dein erstes Growbett",     waitFor:"planted",
   text:"Papa Verde hat dir eine alte Hütte gegeben.\n\n👇 Wähle eine Sorte aus – fang mit Island Haze an."},
  {id:"water",  screen:"grow",   title:"💧 Wasser = Qualität",         waitFor:"watered",
   text:"Gieße regelmäßig! Je trockener, desto schlechter die Note.\n\n👇 Tippe auf GIESSEN."},
  {id:"growth", screen:"grow",   title:"🌿 Wie Wachstum funktioniert", waitFor:"continue",
   text:"4 Phasen: 🌱 Keimung → 🌿 Wachstum → 🌸 Blüte → ✂️ Ernte\n\nKomm regelmäßig zurück zum Gießen."},
  {id:"harvest",screen:"grow",   title:"✂️ Erntezeit!",                waitFor:"harvested",
   text:"Erntereif! Note D–A+ bestimmt den Preis.\n\n👇 Tippe auf ERNTEN."},
  {id:"market", screen:"market", title:"💰 Verkaufen",                  waitFor:"sold",
   text:"Deine Ernte liegt im Lager.\n\n👇 Verkaufe sie bei Don Carlos."},
  {id:"world",  screen:"grow",   title:"🌴 Isla Verde gehört dir!",    waitFor:"continue",
   text:"Du hast deine erste Ernte verkauft.\n\n🏖️ Strand  👥 NPCs  ⚙️ Shop  🏆 HOF"},
];
const MISSIONS=[
  {id:"m1",desc:"Pflanze deine erste Sorte",        check:s=>s.planted,           icon:"item_seeds"},
  {id:"m2",desc:"Ernte deine erste Pflanze",         check:s=>s.harvests>=1,       icon:"badge_harvest"},
  {id:"m3",desc:"Verdiene $1.000",                   check:s=>s.earned>=1000,       icon:"icon_money"},
  {id:"m4",desc:"Erreiche Note A oder besser",       check:s=>["A","A+"].includes(s.bestGrade),icon:"icon_logbook"},
  {id:"m5",desc:"Kaufe ein Upgrade",                 check:s=>s.upgrades?.length>=1,icon:"icon_gear"},
  {id:"m6",desc:"Verdiene $5.000",                   check:s=>s.earned>=5000,       icon:"npc_ghost2"},
];
const SCREEN_BG={grow:"bg_growroom",beach:"bg_beach",market:"bg_market",npcs:"bg_villa",shop:null,trophies:null};
const MOOD={
  dark:   {bg:"linear-gradient(160deg,#0a0a0f,#111827)",border:"rgba(255,255,255,0.08)",text:"rgba(255,255,255,0.85)"},
  warm:   {bg:"linear-gradient(160deg,#1a3a1a,#2d1a0a)",border:"rgba(74,222,128,0.3)", text:"#e8f5e9"},
  gold:   {bg:"linear-gradient(160deg,#2a1a00,#1a1200)",border:"rgba(251,191,36,0.35)",text:"#fff8e1"},
  blue:   {bg:"linear-gradient(160deg,#001a2e,#00122a)",border:"rgba(96,165,250,0.3)", text:"#e3f2fd"},
  danger: {bg:"linear-gradient(160deg,#1a0000,#0d0000)",border:"rgba(239,68,68,0.4)",  text:"#ffebee"},
  mission:{bg:"linear-gradient(160deg,#1a3a1a,#0d2a0d)",border:"rgba(74,222,128,0.5)", text:"#e8f5e9"},
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const calcQ=(log,stressTol=50,qualityCap=100)=>{
  if(!log||!log.length)return 0;
  const avg=log.reduce((a,b)=>a+b,0)/log.length;
  // Consistency penalty: high variance = lower quality (rewards regular watering)
  const variance=log.reduce((a,b)=>a+Math.pow(b-avg,2),0)/log.length;
  const consistencyPenalty=Math.min(25,Math.sqrt(variance)*0.4);
  // stressTolerance reduces the consistency penalty and variance impact
  const tolFactor=stressTol/100;
  const effectiveAvg=avg-(consistencyPenalty*(1-tolFactor));
  // qualityCap: genetic ceiling – even perfect plants can't exceed this
  const raw=Math.max(0,Math.min(qualityCap,effectiveAvg));
  return Math.round(raw);
};
const getGrade=s=>[...GRADES].reverse().find(g=>s>=g.min)||GRADES[0];
const sellP=(strain,q)=>{
  const g=getGrade(q);const m={D:.4,C:.75,B:1,A:1.6,"A+":2.8};
  const base=Math.round(strain.basePrice*m[g.grade]);
  // sellDays: if set, +bonusPercent% on those days; empty = always base price
  if(!strain.sellDays||!strain.sellDays.length)return base;
  const today=(new Date().getDay()+6)%7; // Mon=0
  const mult=1+(( strain.bonusPercent??50)/100);
  return strain.sellDays.includes(today)?Math.round(base*mult):base;
};
const isBonusDay=(strain)=>{
  if(!strain?.sellDays||!strain.sellDays.length)return false;
  return strain.sellDays.includes((new Date().getDay()+6)%7);
};
const fmtTime=iso=>{const d=new Date(iso);return d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+", "+d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});};

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function Toast({toasts}){
  return(
    <div style={{position:"absolute",top:72,left:12,right:12,zIndex:900,display:"flex",flexDirection:"column",gap:5,pointerEvents:"none"}}>
      {toasts.map(t=>(
        <div key={t.id} style={{background:t.color||"rgba(34,197,94,0.93)",backdropFilter:"blur(14px)",borderRadius:13,padding:"9px 14px",color:"#fff",fontWeight:700,fontSize:13,boxShadow:"0 3px 16px rgba(0,0,0,0.5)",display:"flex",alignItems:"center",gap:8}}>
          {t.icon&&A[t.icon]&&<img src={A[t.icon]} style={{width:26,height:26,borderRadius:6,flexShrink:0}}/>}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({item,onConfirm,onCancel}){
  if(!item)return null;
  return(
    <div style={{position:"absolute",inset:0,zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.75)",backdropFilter:"blur(6px)"}}>
      <div style={{background:"linear-gradient(160deg,#131c2b,#0d1a14)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:24,padding:"24px 22px",width:290,boxShadow:"0 20px 60px rgba(0,0,0,0.9)"}}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <img src={A[item.img]} style={{width:56,height:56,objectFit:"contain",marginBottom:8}}/>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,letterSpacing:1,marginBottom:5}}>KAUFBESTÄTIGUNG</div>
          <div style={{color:"#fff",fontWeight:800,fontSize:15,marginBottom:3}}>{item.name}</div>
          <div style={{color:"rgba(255,255,255,0.45)",fontSize:11,marginBottom:10}}>{item.desc}</div>
          <div style={{background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.3)",borderRadius:12,padding:"7px 14px",display:"inline-flex",alignItems:"center",gap:6}}>
            <img src={A.icon_coin} style={{width:17,height:17}}/><span style={{color:"#fbbf24",fontWeight:800,fontSize:17}}>${item.cost.toLocaleString()}</span>
          </div>
        </div>
        <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,textAlign:"center",marginBottom:14}}>Wirklich kaufen?</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"10px",color:"rgba(255,255,255,0.5)",fontWeight:700,fontSize:13,cursor:"pointer"}}>Abbrechen</button>
          <button onClick={onConfirm} style={{flex:1.4,background:"linear-gradient(135deg,#fbbf24,#f59e0b)",border:"none",borderRadius:14,padding:"10px",color:"#1a1a2e",fontWeight:800,fontSize:13,cursor:"pointer"}}>✓ Kaufen</button>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({onLogin,error,loading}){
  const [user,setUser]=useState("");const[pass,setPass]=useState("");
  return(
    <div style={{position:"relative",width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",overflow:"hidden"}}>
      <img src={A.bg_splash} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.97) 0%,rgba(0,0,0,0.3) 60%,transparent 100%)"}}/>
      <div style={{position:"relative",zIndex:2,padding:"0 26px 52px",width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontFamily:"'Fredoka One',cursive",fontSize:32,background:"linear-gradient(135deg,#4ade80,#fbbf24,#f87171)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:1,marginBottom:3}}>STICKY SYNDICATE</div>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,letterSpacing:2}}>ISLA VERDE · LOGIN</div>
        </div>
        <div style={{background:"rgba(0,0,0,0.6)",backdropFilter:"blur(20px)",border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:22,padding:"22px 20px"}}>
          <div style={{marginBottom:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,fontWeight:700,marginBottom:5,letterSpacing:0.5}}>BENUTZERNAME</div>
            <input value={user} onChange={e=>setUser(e.target.value)} placeholder="z.B. verde" onKeyDown={e=>e.key==="Enter"&&onLogin(user,pass)}
              style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"11px 14px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
          </div>
          <div style={{marginBottom:error?12:20}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,fontWeight:700,marginBottom:5,letterSpacing:0.5}}>PASSWORT</div>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&onLogin(user,pass)}
              style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"11px 14px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
          </div>
          {error&&<div style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"8px 12px",color:"#f87171",fontSize:12,marginBottom:14,textAlign:"center"}}>{error}</div>}
          <button onClick={()=>onLogin(user,pass)} disabled={loading} style={{width:"100%",background:loading?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:14,padding:"13px",color:loading?"rgba(255,255,255,0.3)":"#1a2e1a",fontWeight:800,fontSize:15,cursor:loading?"default":"pointer",boxShadow:loading?"none":"0 4px 20px rgba(74,222,128,0.4)"}}>
            {loading?"Lädt...":"🌴 EINLOGGEN"}
          </button>
        </div>
        <div style={{marginTop:16,display:"flex",justifyContent:"center",gap:16}}>
          {[{img:"npc_mentor2",n:"El Verde"},{img:"npc_tropical",n:"Carlos Jr."},{img:"npc_ghost2",n:"Ghost_99"},{img:"npc_police2",n:"Rookie"}].map(p=>(
            <div key={p.n} style={{textAlign:"center",cursor:"pointer"}} onClick={()=>{setUser(p.n==="El Verde"?"verde":p.n==="Carlos Jr."?"carlos2":p.n==="Ghost_99"?"ghost99":"rookie");setPass(p.n==="El Verde"?"verde1":p.n==="Carlos Jr."?"carlos2":p.n==="Ghost_99"?"ghost99":"rookie1");}}>
              <img src={A[p.img]} style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(255,255,255,0.1)",objectFit:"cover"}}/>
              <div style={{color:"rgba(255,255,255,0.3)",fontSize:8,marginTop:2}}>{p.n}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN PANEL V7 – DROP-IN REPLACEMENT for AdminPanel in game_v6.jsx
// Adds: Benutzer-Tab, Bilder-Tab, Notizen, Cash-Transfer, Stats
// ═══════════════════════════════════════════════════════════════════

// Asset categories for image manager
const ASSET_CATEGORIES = {
  "NPCs": [
    {key:"npc_mentor2", label:"Papa Verde"},
    {key:"npc_tropical", label:"Don Carlos"},
    {key:"npc_police2",  label:"Officer Sanchez"},
    {key:"npc_ghost2",   label:"G H O S T"},
    {key:"npc_mentor",   label:"Papa Verde (alt)"},
    {key:"npc_police",   label:"Sanchez (alt)"},
    {key:"npc_hacker",   label:"Hacker Icon"},
    {key:"npc_fixer",    label:"The Fixer"},
    {key:"npc_dobermann",label:"Rex (Dobermann)"},
  ],
  "Buds": [
    {key:"bud_basic",  label:"Island Haze"},
    {key:"bud_purple", label:"Tropical Dream"},
    {key:"bud_neon",   label:"Coral Kush"},
    {key:"bud_gold",   label:"Phantom Orchid"},
  ],
  "Hintergründe": [
    {key:"bg_splash",    label:"Splash / Titel"},
    {key:"bg_growroom",  label:"Grow Room"},
    {key:"bg_market",    label:"Markt"},
    {key:"bg_villa",     label:"Villa"},
    {key:"bg_beach",     label:"Strand"},
    {key:"bg_lab",       label:"Labor"},
  ],
  "Items & Shop": [
    {key:"item_seeds",      label:"Samen"},
    {key:"item_fertilizer", label:"Dünger"},
    {key:"item_coconut",    label:"Kokosnuss"},
    {key:"item_papaya",     label:"Papaya"},
    {key:"item_rum",        label:"Rum-Fass"},
    {key:"item_bottle",     label:"Wasserflasche"},
    {key:"item_bread",      label:"Brot"},
    {key:"vehicle_bike",    label:"Fahrrad"},
    {key:"grow_box",        label:"Grow-Box"},
    {key:"building_shack",  label:"Hütte"},
    {key:"statue_hof",      label:"HOF-Statue"},
  ],
  "Icons & Münzen": [
    {key:"icon_badge",    label:"Syndicate-Badge"},
    {key:"icon_coin",     label:"Münze"},
    {key:"icon_gear",     label:"Zahnrad"},
    {key:"icon_lightning",label:"Blitz"},
    {key:"icon_money",    label:"Geld"},
    {key:"icon_logbook",  label:"Logbuch"},
    {key:"icon_map",      label:"Karte"},
    {key:"icon_news",     label:"Neuigkeiten"},
    {key:"coin_dark",     label:"Münze Dunkel"},
    {key:"coin_light",    label:"Münze Hell"},
    {key:"coin_gold",     label:"Münze Gold"},
    {key:"coin_alert",    label:"Münze Alert"},
  ],
  "Trophäen": [
    {key:"badge_harvest",  label:"First Harvest"},
    {key:"badge_boss",     label:"Syndicate Boss"},
    {key:"badge_mutation", label:"Mutation Hunter"},
    {key:"badge_casino",   label:"Casino King"},
  ],
};

function AdminPanel({onLogout, customImgs, setCustomImgs, setGameItems=()=>{}}) {
  const [tab, setTab]           = useState("overview");
  const [players, setPlayers]   = useState([]);
  const [allAccounts, setAllAcc]= useState([]);
  const [logs, setLogs]         = useState([]);
  const [dialogs, setDialogs]   = useState(DEFAULT_DIALOGS);
  const [global, setGlobal]     = useState({announcement:"", maintenanceMode:false});
  const [selPlayer, setSelP]    = useState(null);
  const [logFilter, setLogF]    = useState("all");
  const [toasts, setToasts]     = useState([]);
  const [editDNpc, setEditDNpc] = useState("papa");
  const [editDLines, setEditDL] = useState([]);
  const [loading, setLoading]   = useState(true);
  // User management state
  const [editNames, setEditN]   = useState({});
  const [editPws, setEditPws]   = useState({});
  const [newUser, setNewUser]   = useState({username:"",password:"",displayName:"",role:"player"});
  const [cashCustom, setCashC]  = useState({});
  const [transferFrom, setTrFrom]=useState("");
  const [transferTo, setTrTo]  = useState("");
  const [transferAmt, setTrAmt]= useState("");
  const [notes, setNotes]       = useState({});
  const [editNote, setEditNote] = useState({});
  // Image manager state
  const [imgCat, setImgCat]     = useState("NPCs");
  // Admin mail
  const [adminMails, setAdminMails]   = useState([]);
  const [adminMailFilter, setAMF]     = useState("all");
  const [adminMailView, setAMV]       = useState(null);
  const [adminCompose, setAdminComp]  = useState(false);
  const [adminMailTo, setAdminTo]     = useState("");
  const [adminMailSub, setAdminSub]   = useState("");
  const [adminMailBody, setAdminBody] = useState("");
  // Items management
  const [itemSub, setItemSub]   = useState("strains");
  const [editStrains,  setEditStrains]  = useState([...DEFAULT_STRAINS]);
  const [editUpgrades, setEditUpgrades] = useState([...DEFAULT_UPGRADES]);
  const [editBeach,    setEditBeach]    = useState([...DEFAULT_BEACH_ITEMS]);
  const [customized, setCustomized]=useState({});
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);

  const toast = useCallback((msg, color) => {
    const id = Date.now();
    setToasts(p => [...p, {id, message:msg, color}]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2500);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Load all accounts
    const allKeys = await store.list("user:");
    const accs = [];
    for (const key of allKeys) {
      const u = await store.get(key);
      if (u) accs.push({username: key.replace("user:",""), ...u});
    }
    accs.sort((a,b) => a.role==="admin"?-1:b.role==="admin"?1:0);
    setAllAcc(accs);
    setPlayers(accs.filter(a => a.role==="player"));
    // Logs
    const allLogs = [];
    for (const acc of accs.filter(a => a.role==="player")) {
      const l = await store.get(`log:${acc.username}`) || [];
      l.forEach(e => allLogs.push({...e, username:acc.username}));
    }
    allLogs.sort((a,b) => new Date(b.time)-new Date(a.time));
    setLogs(allLogs);
    // Dialogs
    const d = await store.get("settings:dialogs") || DEFAULT_DIALOGS;
    setDialogs(d); setEditDL(d[editDNpc] || []);
    // Global
    const g = await store.get("settings:global") || {announcement:"", maintenanceMode:false};
    setGlobal(g);
    // Admin mail: load all inboxes
    const allMails = [];
    for (const acc of accs) {
      const msgs = await store.get(`mail:${acc.username}`) || [];
      msgs.forEach(m => allMails.push({...m, recipientUser: acc.username}));
    }
    allMails.sort((a,b) => new Date(b.time)-new Date(a.time));
    setAdminMails(allMails);
    // Notes
    const n = await store.get("admin:notes") || {};
    setNotes(n);
    // Customized image keys
    const imgKeys = await store.list("img:");
    const cust = {};
    imgKeys.forEach(k => { cust[k.replace("img:","")] = true; });
    setCustomized(cust);
    setLoading(false);
  }, [editDNpc]);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (dialogs[editDNpc]) setEditDL([...dialogs[editDNpc]]); }, [editDNpc]);

  // ── Item helpers ──
  const updateStrain  = (i, k, v) => setEditStrains(p  => { const n=[...p];  n[i]={...n[i],  [k]:v}; return n; });
  const updateUpgrade = (i, k, v) => setEditUpgrades(p => { const n=[...p];  n[i]={...n[i],  [k]:v}; return n; });
  const updateBeach   = (i, k, v) => setEditBeach(p    => { const n=[...p];  n[i]={...n[i],  [k]:v}; return n; });

  const saveItems = async (key, data) => {
    const current = await store.get("settings:items") || {};
    const updated = {...current, [key]: data};
    await store.set("settings:items", updated);
    // Update module-level vars so game picks up immediately
    if (key==="strains")  { STRAINS  = data; }
    if (key==="upgrades") { UPGRADES = data; }
    if (key==="beach")    { BEACH_ITEMS = data; }
    setGameItems(updated);
    toast(`✓ ${key==="strains"?"Sorten":key==="upgrades"?"Shop-Items":"Strand-Items"} gespeichert!`, "rgba(74,222,128,0.9)");
  };

  // Sync edit state when items load
  const syncItemsFromStorage = async () => {
    const items = await store.get("settings:items");
    if (items) {
      if (items.strains)  setEditStrains([...items.strains]);
      if (items.upgrades) setEditUpgrades([...items.upgrades]);
      if (items.beach)    setEditBeach([...items.beach]);
    }
  };
  useEffect(() => { syncItemsFromStorage(); }, []);

  // Convenience style for small inputs
  const iStyle = {width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"6px 9px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"};

  // ── User Management ──
  const updateName = async (username) => {
    const newName = editNames[username];
    if (!newName || newName.trim().length < 1) { toast("⚠️ Name zu kurz","rgba(239,68,68,0.9)"); return; }
    const u = await store.get(`user:${username}`);
    if (u) {
      u.displayName = newName.trim();
      await store.set(`user:${username}`, u);
      await addLog(username, "admin", `Name geändert zu "${newName.trim()}"`);
      setEditN(p => ({...p, [username]:""}));
      loadAll(); toast("✓ Name aktualisiert","rgba(74,222,128,0.9)");
    }
  };
  const updatePw = async (username) => {
    const pw = editPws[username];
    if (!pw || pw.length < 3) { toast("⚠️ Min. 3 Zeichen","rgba(239,68,68,0.9)"); return; }
    const u = await store.get(`user:${username}`);
    if (u) {
      u.password = pw;
      await store.set(`user:${username}`, u);
      setEditPws(p => ({...p, [username]:""}));
      loadAll(); toast("🔑 Passwort geändert","rgba(74,222,128,0.9)");
    }
  };
  const createAccount = async () => {
    const {username, password, displayName, role} = newUser;
    if (!username.trim() || !password || !displayName.trim()) { toast("⚠️ Alle Felder ausfüllen","rgba(239,68,68,0.9)"); return; }
    const slug = username.trim().toLowerCase().replace(/[^a-z0-9]/g,"");
    if (!slug) { toast("⚠️ Ungültiger Username","rgba(239,68,68,0.9)"); return; }
    const exists = await store.get(`user:${slug}`);
    if (exists) { toast("⚠️ Username bereits vergeben","rgba(239,68,68,0.9)"); return; }
    await store.set(`user:${slug}`, {
      password, role, displayName:displayName.trim(), locked:false,
      createdAt: new Date().toISOString(),
      gameState: role==="player" ? EMPTY_GAME_STATE() : null,
    });
    setNewUser({username:"",password:"",displayName:"",role:"player"});
    loadAll(); toast(`✓ Account @${slug} erstellt!`,"rgba(74,222,128,0.9)");
  };
  const deleteAccount = async (username) => {
    if (username === "admin") { toast("Admin nicht löschbar","rgba(239,68,68,0.9)"); return; }
    await store.delete(`user:${username}`);
    await store.delete(`log:${username}`);
    if (selPlayer === username) setSelP(null);
    loadAll(); toast(`🗑️ @${username} gelöscht`,"rgba(239,68,68,0.9)");
  };
  const applyCustomCash = async (username, direction) => {
    const amt = parseInt(cashCustom[username] || "0");
    if (isNaN(amt) || amt <= 0) { toast("⚠️ Ungültiger Betrag","rgba(239,68,68,0.9)"); return; }
    const delta = direction === "add" ? amt : -amt;
    const u = await store.get(`user:${username}`);
    if (u && u.gameState) {
      u.gameState.cash = Math.max(0, (u.gameState.cash||0) + delta);
      await store.set(`user:${username}`, u);
      await addLog(username, "admin", `Cash ${delta>0?"+":""}${delta}$ manuell`);
      loadAll(); toast(`💰 ${delta>0?"+":""}$${Math.abs(delta)} für @${username}`,"rgba(251,191,36,0.9)");
    }
  };
  const applyPresetCash = async (username, delta) => {
    const u = await store.get(`user:${username}`);
    if (u && u.gameState) {
      u.gameState.cash = Math.max(0, (u.gameState.cash||0) + delta);
      await store.set(`user:${username}`, u);
      await addLog(username, "admin", `Cash ${delta>0?"+":""}${delta}$`);
      loadAll(); toast(`💰 ${delta>0?"+":""}$${Math.abs(delta)}`,"rgba(251,191,36,0.9)");
    }
  };
  const doTransfer = async () => {
    const amt = parseInt(transferAmt);
    if (!transferFrom || !transferTo || !amt || amt <= 0) { toast("⚠️ Felder ausfüllen","rgba(239,68,68,0.9)"); return; }
    if (transferFrom === transferTo) { toast("⚠️ Gleicher Account","rgba(239,68,68,0.9)"); return; }
    const from = await store.get(`user:${transferFrom}`);
    const to   = await store.get(`user:${transferTo}`);
    if (!from?.gameState || !to?.gameState) { toast("⚠️ Spieler nicht gefunden","rgba(239,68,68,0.9)"); return; }
    if ((from.gameState.cash||0) < amt) { toast("⚠️ Nicht genug Cash","rgba(239,68,68,0.9)"); return; }
    from.gameState.cash -= amt; to.gameState.cash += amt;
    await store.set(`user:${transferFrom}`, from);
    await store.set(`user:${transferTo}`, to);
    await addLog(transferFrom,"admin",`Transfer: -$${amt} → @${transferTo}`);
    await addLog(transferTo,  "admin",`Transfer: +$${amt} von @${transferFrom}`);
    setTrAmt(""); loadAll();
    toast(`↔️ $${amt} von @${transferFrom} → @${transferTo}`,"rgba(96,165,250,0.9)");
  };
  const adminSendMail = async () => {
    if (!adminMailTo.trim() || !adminMailBody.trim()) { toast("⚠️ Empfänger + Nachricht ausfüllen","rgba(239,68,68,0.9)"); return; }
    const recipient = adminMailTo.trim().toLowerCase();
    const u = await store.get(`user:${recipient}`);
    if (!u) { toast("⚠️ Spieler nicht gefunden","rgba(239,68,68,0.9)"); return; }
    const msg = {id:`msg_${Date.now()}`, from:"admin", fromName:"Admin", to:recipient,
      subject: adminMailSub.trim()||"Nachricht vom Admin", body: adminMailBody.trim(),
      time: new Date().toISOString(), read: false};
    const inbox = await store.get(`mail:${recipient}`) || [];
    inbox.unshift(msg);
    await store.set(`mail:${recipient}`, inbox.slice(0,100));
    await addLog("admin", "mail", `Nachricht an @${recipient}: ${msg.subject}`);
    setAdminTo(""); setAdminSub(""); setAdminBody(""); setAdminComp(false);
    loadAll(); toast(`✉️ Gesendet an @${recipient}`,"rgba(74,222,128,0.9)");
  };
  const adminDeleteMail = async (recipientUser, msgId) => {
    const msgs = await store.get(`mail:${recipientUser}`) || [];
    await store.set(`mail:${recipientUser}`, msgs.filter(m => m.id !== msgId));
    loadAll(); toast("🗑️ Gelöscht","rgba(239,68,68,0.9)");
    if (adminMailView?.id === msgId) setAMV(null);
  };
  const adminMarkRead = async (recipientUser, msgId, val=true) => {
    const msgs = await store.get(`mail:${recipientUser}`) || [];
    await store.set(`mail:${recipientUser}`, msgs.map(m => m.id===msgId?{...m,read:val}:m));
    loadAll();
  };
  const saveNote = async (username) => {
    const updated = {...notes, [username]: editNote[username]||""};
    await store.set("admin:notes", updated);
    setNotes(updated);
    setEditNote(p => ({...p, [username]: undefined}));
    toast("📝 Notiz gespeichert","rgba(74,222,128,0.9)");
  };
  const toggleLock = async (username, locked) => {
    const u = await store.get(`user:${username}`);
    if (u) { u.locked = !locked; await store.set(`user:${username}`, u); await addLog(username,"admin",locked?"Entsperrt":"Gesperrt"); loadAll(); toast(locked?"🔓 Entsperrt":"🔒 Gesperrt","rgba(251,191,36,0.9)"); }
  };
  const giveUpgrade = async (username, upId) => {
    const u = await store.get(`user:${username}`);
    if (u?.gameState) { if (!u.gameState.upgrades) u.gameState.upgrades=[]; if(!u.gameState.upgrades.includes(upId)){u.gameState.upgrades.push(upId);await store.set(`user:${username}`,u);await addLog(username,"admin",`Upgrade: ${upId}`);loadAll();toast("✓ Upgrade gegeben","rgba(74,222,128,0.9)");} }
  };
  const removeUpgrade = async (username, upId) => {
    const u = await store.get(`user:${username}`);
    if (u?.gameState) { u.gameState.upgrades=(u.gameState.upgrades||[]).filter(x=>x!==upId);await store.set(`user:${username}`,u);await addLog(username,"admin",`Upgrade entfernt: ${upId}`);loadAll();toast("✓ Entfernt","rgba(251,191,36,0.9)"); }
  };
  const resetTutorial = async (username) => {
    const u = await store.get(`user:${username}`);
    if (u?.gameState) { u.gameState.tutStep=0; await store.set(`user:${username}`,u); loadAll(); toast("📖 Tutorial reset","rgba(74,222,128,0.9)"); }
  };
  const resetPlayer = async (username) => {
    const u = await store.get(`user:${username}`);
    if (u) { u.gameState=EMPTY_GAME_STATE(); await store.set(`user:${username}`,u); await store.set(`log:${username}`,[]);await addLog(username,"admin","Reset"); loadAll(); toast("🔄 Zurückgesetzt","rgba(239,68,68,0.9)"); }
  };

  // ── Dialog management ──
  const saveDialogs = async () => {
    const updated = {...dialogs, [editDNpc]: editDLines};
    await store.set("settings:dialogs", updated); setDialogs(updated);
    toast("💬 Dialoge gespeichert","rgba(74,222,128,0.9)");
  };
  const saveGlobal = async () => { await store.set("settings:global", global); toast("⚙️ Gespeichert","rgba(74,222,128,0.9)"); };
  const resetAll = async () => {
    for (const acc of players) { const u=await store.get(`user:${acc.username}`); if(u){u.gameState=EMPTY_GAME_STATE();await store.set(`user:${acc.username}`,u);await store.set(`log:${acc.username}`,[]);} }
    loadAll(); toast("💥 Alle zurückgesetzt","rgba(239,68,68,0.9)");
  };

  // ── Image management ──
  const handleImgUpload = (key) => {
    setUploadTarget(key);
    fileInputRef.current.click();
  };
  const onFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadTarget) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target.result;
      await store.set(`img:${uploadTarget}`, b64);
      setCustomImgs(p => ({...p, [uploadTarget]: b64}));
      setCustomized(p => ({...p, [uploadTarget]: true}));
      toast(`✓ Bild ersetzt: ${uploadTarget}`,"rgba(74,222,128,0.9)");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setUploadTarget(null);
  };
  const resetImg = async (key) => {
    try { await store.delete(`img:${key}`); } catch {}
    setCustomImgs(p => { const n={...p}; delete n[key]; return n; });
    setCustomized(p => { const n={...p}; delete n[key]; return n; });
    toast(`↩️ ${key} zurückgesetzt`,"rgba(251,191,36,0.9)");
  };

  // ── Stats ──
  const totalEarned = players.reduce((s,p)=>(p.gameState?.earned||0)+s,0);
  const totalHarvests = players.reduce((s,p)=>(p.gameState?.harvests||0)+s,0);
  const mostActive = players.sort((a,b)=>(b.gameState?.earned||0)-(a.gameState?.earned||0))[0];

  const adminTabs = [
    {id:"overview", emoji:"📊", label:"Übersicht"},
    {id:"users",    emoji:"👥", label:"Nutzer"},
    {id:"players",  emoji:"🎮", label:"Spielstand"},
    {id:"dialogs",  emoji:"💬", label:"Dialoge"},
    {id:"items",    emoji:"🌿", label:"Items"},
    {id:"images",   emoji:"🖼️",  label:"Bilder"},
    {id:"mail",     emoji:"📬", label:"Post"},
    {id:"logs",     emoji:"📋", label:"Logs"},
    {id:"system",   emoji:"⚙️", label:"System"},
  ];
  const sp = selPlayer ? players.find(p=>p.username===selPlayer) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"linear-gradient(160deg,#0f0f1a,#1a1a2e)",position:"relative",overflow:"hidden"}}>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{display:"none"}}/>
      <Toast toasts={toasts}/>

      {/* Admin Header */}
      <div style={{padding:"10px 14px 9px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,0.08)",background:"rgba(239,68,68,0.06)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:8,padding:"3px 8px"}}><span style={{color:"#f87171",fontSize:10,fontWeight:800,letterSpacing:1}}>🔐 ADMIN</span></div>
          <span style={{color:"#fff",fontWeight:700,fontSize:13}}>Sticky Syndicate</span>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button onClick={loadAll} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"4px 9px",color:"rgba(255,255,255,0.5)",fontSize:10,cursor:"pointer"}}>↻</button>
          <button onClick={onLogout} style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"4px 10px",color:"#f87171",fontSize:11,cursor:"pointer",fontWeight:700}}>Logout</button>
        </div>
      </div>

      {/* Global Stats Banner */}
      {!loading && (
        <div style={{display:"flex",gap:6,padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.3)",flexShrink:0}}>
          {[
            {l:"Spieler",  v:players.length, color:"#60a5fa"},
            {l:"Gesamtumsatz",v:`$${totalEarned.toLocaleString()}`,color:"#fbbf24"},
            {l:"Ernten",   v:totalHarvests, color:"#4ade80"},
            {l:"Top-Spieler",v:mostActive?.displayName||"–",color:"#a855f7"},
          ].map(s=>(
            <div key={s.l} style={{flex:1,background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"4px 5px",textAlign:"center"}}>
              <div style={{color:"rgba(255,255,255,0.25)",fontSize:7,marginBottom:1}}>{s.l}</div>
              <div style={{color:s.color,fontWeight:700,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Bar (scrollable) */}
      <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.07)",overflowX:"auto",flexShrink:0,scrollbarWidth:"none"}}>
        {adminTabs.map(t=>{
          const active = tab===t.id;
          return (
            <button key={t.id} onClick={()=>{setTab(t.id);if(t.id!=="players")setSelP(null);}} style={{flex:"0 0 auto",background:active?"rgba(239,68,68,0.1)":"none",border:"none",borderBottom:active?"2px solid #f87171":"2px solid transparent",padding:"8px 10px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:50}}>
              <span style={{fontSize:14}}>{t.emoji}</span>
              <span style={{fontSize:8,color:active?"#f87171":"rgba(255,255,255,0.3)",fontWeight:active?700:400,whiteSpace:"nowrap"}}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>
        {loading && <div style={{textAlign:"center",padding:40,color:"rgba(255,255,255,0.3)"}}>Lade...</div>}
        {!loading && <>

        {/* ── OVERVIEW ── */}
        {tab==="overview"&&(
          <div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:10}}>SPIELER-ÜBERSICHT</div>
            {players.map(p=>{
              const gs=p.gameState||{};
              return (
                <div key={p.username} onClick={()=>{setSelP(p.username);setTab("players");}} style={{background:`rgba(${p.locked?"60,0,0":"0,30,15"},0.5)`,border:`1.5px solid rgba(${p.locked?"239,68,68":"74,222,128"},0.12)`,borderRadius:16,padding:"11px 13px",marginBottom:9,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <div style={{width:34,height:34,borderRadius:9,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:"1px solid rgba(255,255,255,0.08)"}}>{p.displayName?.[0]||"?"}</div>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{color:"#fff",fontWeight:700,fontSize:13}}>{p.displayName}</span>
                          {notes[p.username]&&<span style={{background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.3)",borderRadius:5,padding:"1px 5px",color:"rgba(251,191,36,0.8)",fontSize:8}}>📝</span>}
                        </div>
                        <div style={{color:"rgba(255,255,255,0.3)",fontSize:10}}>@{p.username} {p.locked&&<span style={{color:"#f87171"}}>· 🔒</span>}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:"#fbbf24",fontWeight:800,fontSize:14}}>${(gs.cash||0).toLocaleString()}</div>
                      <div style={{color:"rgba(255,255,255,0.3)",fontSize:9}}>{gs.harvests||0} Ernten</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {[{l:"Verdient",v:`$${(gs.earned||0).toLocaleString()}`},{l:"Upgrades",v:`${(gs.upgrades||[]).length}/${UPGRADES.length}`},{l:"Grade",v:gs.bestGrade||"D"},{l:"Tutorial",v:gs.tutStep===null?"✓":"Schritt "+(gs.tutStep||0)+1}].map(s=>(
                      <div key={s.l} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"3px 4px",textAlign:"center"}}>
                        <div style={{color:"rgba(255,255,255,0.22)",fontSize:7}}>{s.l}</div>
                        <div style={{color:"#fff",fontSize:9,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── USER MANAGEMENT ── */}
        {tab==="users"&&(
          <div>
            {/* Create new account */}
            <AdminSection title="➕ Neuen Account erstellen">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:7}}>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,marginBottom:3}}>Username</div>
                  <input value={newUser.username} onChange={e=>setNewUser(p=>({...p,username:e.target.value}))} placeholder="z.B. player5"
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"7px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                </div>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,marginBottom:3}}>Passwort</div>
                  <input value={newUser.password} onChange={e=>setNewUser(p=>({...p,password:e.target.value}))} placeholder="Min. 3 Zeichen"
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"7px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:7,marginBottom:10}}>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,marginBottom:3}}>Anzeigename</div>
                  <input value={newUser.displayName} onChange={e=>setNewUser(p=>({...p,displayName:e.target.value}))} placeholder="z.B. El Rookie"
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"7px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                </div>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,marginBottom:3}}>Rolle</div>
                  <select value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"7px 8px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}>
                    <option value="player">Spieler</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <button onClick={createAccount} style={{width:"100%",background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:11,padding:"9px",color:"#1a2e1a",fontWeight:800,fontSize:13,cursor:"pointer"}}>✓ Account erstellen</button>
            </AdminSection>

            {/* Account list */}
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:10}}>ALLE ACCOUNTS ({allAccounts.length})</div>
            {allAccounts.map(acc=>(
              <div key={acc.username} style={{background:"rgba(255,255,255,0.03)",border:"1.5px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"12px 14px",marginBottom:10}}>
                {/* Header row */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:9}}>
                    <div style={{width:36,height:36,borderRadius:9,background:acc.role==="admin"?"rgba(239,68,68,0.15)":"rgba(74,222,128,0.1)",border:`1px solid ${acc.role==="admin"?"rgba(239,68,68,0.3)":"rgba(74,222,128,0.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{acc.displayName?.[0]||"?"}</div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:"#fff",fontWeight:700,fontSize:13}}>{acc.displayName}</span>
                        <span style={{background:acc.role==="admin"?"rgba(239,68,68,0.15)":"rgba(74,222,128,0.1)",border:`1px solid ${acc.role==="admin"?"rgba(239,68,68,0.3)":"rgba(74,222,128,0.2)"}`,borderRadius:5,padding:"1px 6px",color:acc.role==="admin"?"#f87171":"#4ade80",fontSize:8,fontWeight:700}}>{acc.role}</span>
                        {acc.locked&&<span style={{color:"#f87171",fontSize:10}}>🔒</span>}
                      </div>
                      <div style={{color:"rgba(255,255,255,0.3)",fontSize:10}}>@{acc.username}</div>
                    </div>
                  </div>
                  {acc.role==="player"&&<div style={{color:"#fbbf24",fontWeight:700,fontSize:13}}>${(acc.gameState?.cash||0).toLocaleString()}</div>}
                </div>

                {/* Edit name */}
                <div style={{display:"flex",gap:6,marginBottom:7}}>
                  <input value={editNames[acc.username]||""} onChange={e=>setEditN(p=>({...p,[acc.username]:e.target.value}))} placeholder={`Name: ${acc.displayName}`}
                    style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"6px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                  <button onClick={()=>updateName(acc.username)} disabled={!editNames[acc.username]} style={{background:editNames[acc.username]?"linear-gradient(135deg,#4ade80,#22c55e)":"rgba(255,255,255,0.05)",border:"none",borderRadius:9,padding:"6px 12px",color:editNames[acc.username]?"#1a2e1a":"rgba(255,255,255,0.2)",fontWeight:700,fontSize:11,cursor:editNames[acc.username]?"pointer":"default"}}>Name ✓</button>
                </div>

                {/* Edit password */}
                <div style={{display:"flex",gap:6,marginBottom:7}}>
                  <input type="password" value={editPws[acc.username]||""} onChange={e=>setEditPws(p=>({...p,[acc.username]:e.target.value}))} placeholder="Neues Passwort..."
                    style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"6px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                  <button onClick={()=>updatePw(acc.username)} disabled={!editPws[acc.username]} style={{background:editPws[acc.username]?"linear-gradient(135deg,#fbbf24,#f59e0b)":"rgba(255,255,255,0.05)",border:"none",borderRadius:9,padding:"6px 12px",color:editPws[acc.username]?"#1a1a2e":"rgba(255,255,255,0.2)",fontWeight:700,fontSize:11,cursor:editPws[acc.username]?"pointer":"default"}}>PW ✓</button>
                </div>

                {/* Cash controls (player only) */}
                {acc.role==="player"&&(
                  <div style={{marginBottom:7}}>
                    <div style={{color:"rgba(255,255,255,0.3)",fontSize:9,fontWeight:700,marginBottom:4}}>
                      💰 CASH · Aktuell: <span style={{color:"#fbbf24"}}>${(acc.gameState?.cash||0).toLocaleString()}</span>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      <input value={cashCustom[acc.username]||""} onChange={e=>setCashC(p=>({...p,[acc.username]:e.target.value}))}
                        placeholder="Betrag eingeben..."
                        style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"6px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}
                        type="number" min="1"/>
                      <button onClick={()=>applyCustomCash(acc.username,"add")} style={{background:"rgba(34,197,94,0.12)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:9,padding:"6px 12px",color:"#4ade80",fontWeight:700,fontSize:12,cursor:"pointer"}}>+</button>
                      <button onClick={()=>applyCustomCash(acc.username,"sub")} style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:9,padding:"6px 12px",color:"#f87171",fontWeight:700,fontSize:12,cursor:"pointer"}}>−</button>
                    </div>
                  </div>
                )}

                {/* Admin note */}
                <div style={{marginBottom:7}}>
                  {editNote[acc.username]!==undefined?(
                    <div style={{display:"flex",gap:5}}>
                      <input value={editNote[acc.username]} onChange={e=>setEditNote(p=>({...p,[acc.username]:e.target.value}))} placeholder="Notiz..."
                        style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:9,padding:"6px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                      <button onClick={()=>saveNote(acc.username)} style={{background:"rgba(251,191,36,0.15)",border:"none",borderRadius:9,padding:"6px 10px",color:"#fbbf24",fontWeight:700,fontSize:11,cursor:"pointer"}}>💾</button>
                      <button onClick={()=>setEditNote(p=>({...p,[acc.username]:undefined}))} style={{background:"rgba(255,255,255,0.05)",border:"none",borderRadius:9,padding:"6px 10px",color:"rgba(255,255,255,0.3)",fontSize:11,cursor:"pointer"}}>×</button>
                    </div>
                  ):(
                    <button onClick={()=>setEditNote(p=>({...p,[acc.username]:notes[acc.username]||""}))} style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:"5px 10px",color:"rgba(255,255,255,0.3)",fontSize:11,cursor:"pointer",textAlign:"left"}}>
                      📝 {notes[acc.username]||"Notiz hinzufügen..."}
                    </button>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{display:"flex",gap:6}}>
                  {acc.role==="player"&&<button onClick={()=>toggleLock(acc.username,acc.locked)} style={{flex:1,background:acc.locked?"rgba(74,222,128,0.1)":"rgba(239,68,68,0.1)",border:`1px solid ${acc.locked?"rgba(74,222,128,0.2)":"rgba(239,68,68,0.2)"}`,borderRadius:9,padding:"6px",color:acc.locked?"#4ade80":"#f87171",fontSize:11,cursor:"pointer",fontWeight:700}}>
                    {acc.locked?"🔓 Freischalten":"🔒 Sperren"}
                  </button>}
                  {acc.username!=="admin"&&<button onClick={()=>{if(window.confirm(`@${acc.username} wirklich löschen?`))deleteAccount(acc.username);}} style={{flex:1,background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:9,padding:"6px",color:"rgba(239,68,68,0.6)",fontSize:11,cursor:"pointer"}}>🗑️ Löschen</button>}
                </div>
              </div>
            ))}

            {/* Cash Transfer */}
            <AdminSection title="↔️ Cash-Transfer zwischen Spielern">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:7}}>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,marginBottom:3}}>Von</div>
                  <select value={transferFrom} onChange={e=>setTrFrom(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"7px 8px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}>
                    <option value="">Spieler...</option>
                    {players.map(p=><option key={p.username} value={p.username}>{p.displayName} (${p.gameState?.cash||0})</option>)}
                  </select>
                </div>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,marginBottom:3}}>An</div>
                  <select value={transferTo} onChange={e=>setTrTo(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"7px 8px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}>
                    <option value="">Spieler...</option>
                    {players.map(p=><option key={p.username} value={p.username}>{p.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",gap:7}}>
                <input type="number" value={transferAmt} onChange={e=>setTrAmt(e.target.value)} placeholder="Betrag in $" min="1"
                  style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"7px 10px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                <button onClick={doTransfer} style={{background:"linear-gradient(135deg,#60a5fa,#3b82f6)",border:"none",borderRadius:9,padding:"7px 16px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>↔️ Transfer</button>
              </div>
            </AdminSection>
          </div>
        )}

        {/* ── PLAYER DETAIL ── */}
        {tab==="players"&&(
          <div>
            {!sp&&<div>
              <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:10}}>SPIELSTAND VERWALTEN</div>
              {players.map(p=>(
                <button key={p.username} onClick={()=>setSelP(p.username)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:"rgba(255,255,255,0.04)",border:"1.5px solid rgba(255,255,255,0.08)",borderRadius:14,padding:"11px 14px",color:"#fff",cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                  <div style={{width:36,height:36,borderRadius:9,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{p.displayName?.[0]}</div>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{p.displayName}</div><div style={{color:"rgba(255,255,255,0.35)",fontSize:10}}>@{p.username} · ${(p.gameState?.cash||0).toLocaleString()}</div></div>
                  <span style={{color:"rgba(255,255,255,0.3)"}}>→</span>
                </button>
              ))}
            </div>}
            {sp&&<div>
              <button onClick={()=>setSelP(null)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"6px 12px",color:"rgba(255,255,255,0.5)",fontSize:12,cursor:"pointer",marginBottom:14}}>← Zurück</button>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,background:"rgba(0,0,0,0.4)",borderRadius:14,padding:"12px 14px"}}>
                <div style={{width:46,height:46,borderRadius:11,background:"rgba(74,222,128,0.1)",border:"1.5px solid rgba(74,222,128,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{sp.displayName?.[0]}</div>
                <div><div style={{color:"#fff",fontWeight:800,fontSize:15}}>{sp.displayName}</div><div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>@{sp.username} · {sp.locked?"🔒 Gesperrt":"✓ Aktiv"}</div></div>
              </div>
              <AdminSection title="⚙️ Upgrades">
                {UPGRADES.map(u=>{const has=(sp.gameState?.upgrades||[]).includes(u.id);return(
                  <div key={u.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <img src={customImgs[u.img]||A[u.img]} style={{width:28,height:28,objectFit:"contain",flexShrink:0}}/>
                    <div style={{flex:1}}><div style={{color:"#fff",fontSize:12}}>{u.name}</div></div>
                    {has?<button onClick={()=>removeUpgrade(sp.username,u.id)} style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"4px 10px",color:"#f87171",fontSize:11,cursor:"pointer"}}>Entfernen</button>
                        :<button onClick={()=>giveUpgrade(sp.username,u.id)} style={{background:"rgba(34,197,94,0.12)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:8,padding:"4px 10px",color:"#4ade80",fontSize:11,cursor:"pointer"}}>Geben</button>}
                  </div>
                );})}
              </AdminSection>
              <AdminSection title="📦 Inventar">
                {(!sp.gameState?.inventory||sp.gameState.inventory.length===0)&&<div style={{color:"rgba(255,255,255,0.3)",fontSize:12,textAlign:"center",padding:"10px 0"}}>Leer</div>}
                {(sp.gameState?.inventory||[]).map((item,i)=>{const g=getGrade(item.q);return(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <img src={customImgs[item.bud]||A[item.bud]} style={{width:30,height:30,objectFit:"contain"}}/>
                    <div style={{flex:1}}><div style={{color:"#fff",fontSize:12}}>{item.name}</div></div>
                    <span style={{background:g.color+"22",border:`1px solid ${g.color}55`,borderRadius:5,padding:"2px 7px",color:g.color,fontSize:10,fontWeight:700}}>{g.grade}</span>
                    <span style={{color:"#fbbf24",fontWeight:700,fontSize:12}}>${item.price}</span>
                  </div>
                );})}
              </AdminSection>
              <AdminSection title="🛠️ Aktionen">
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>resetTutorial(sp.username)} style={{background:"rgba(96,165,250,0.1)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:11,padding:"9px",color:"#60a5fa",fontSize:12,cursor:"pointer"}}>📖 Tutorial zurücksetzen</button>
                  <button onClick={()=>toggleLock(sp.username,sp.locked)} style={{background:sp.locked?"rgba(74,222,128,0.1)":"rgba(239,68,68,0.1)",border:`1px solid ${sp.locked?"rgba(74,222,128,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:11,padding:"9px",color:sp.locked?"#4ade80":"#f87171",fontSize:12,cursor:"pointer"}}>
                    {sp.locked?"🔓 Entsperren":"🔒 Sperren"}
                  </button>
                  <button onClick={()=>{if(window.confirm("Spielstand zurücksetzen?"))resetPlayer(sp.username);}} style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:11,padding:"9px",color:"rgba(239,68,68,0.7)",fontSize:12,cursor:"pointer"}}>💥 Spielstand zurücksetzen</button>
                </div>
              </AdminSection>
            </div>}
          </div>
        )}

        {/* ── DIALOGE ── */}
        {tab==="dialogs"&&(
          <div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:10}}>NPC-DIALOGE BEARBEITEN</div>
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
              {NPCS_BASE.map(n=>(
                <button key={n.id} onClick={()=>setEditDNpc(n.id)} style={{background:editDNpc===n.id?`${n.color}22`:"rgba(255,255,255,0.04)",border:`1.5px solid ${editDNpc===n.id?n.color+"55":"rgba(255,255,255,0.08)"}`,borderRadius:10,padding:"5px 10px",color:editDNpc===n.id?n.color:"rgba(255,255,255,0.45)",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                  <img src={customImgs[n.img]||A[n.img]} style={{width:18,height:18,borderRadius:4,objectFit:"cover"}}/>{n.name}
                </button>
              ))}
            </div>
            {editDLines.map((line,i)=>(
              <div key={i} style={{display:"flex",gap:7,marginBottom:7,alignItems:"flex-start"}}>
                <div style={{color:"rgba(255,255,255,0.2)",fontSize:10,fontWeight:700,paddingTop:10,width:16,flexShrink:0,textAlign:"center"}}>{i+1}</div>
                <textarea value={line} onChange={e=>{const n=[...editDLines];n[i]=e.target.value;setEditDL(n);}}
                  style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 11px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit",resize:"vertical",minHeight:44,lineHeight:1.5}}/>
                <button onClick={()=>setEditDL(p=>p.filter((_,j)=>j!==i))} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,width:28,height:28,color:"#f87171",fontSize:14,cursor:"pointer",flexShrink:0,marginTop:4}}>×</button>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button onClick={()=>setEditDL(p=>[...p,"Neue Zeile..."])} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:11,padding:"8px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer"}}>+ Zeile</button>
              <button onClick={saveDialogs} style={{flex:1.5,background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:11,padding:"8px",color:"#1a2e1a",fontWeight:800,fontSize:13,cursor:"pointer"}}>💾 Speichern</button>
            </div>
          </div>
        )}

{tab==="items"&&(
  <div>
    {/* Sub-tabs */}
    <div style={{display:"flex",gap:6,marginBottom:14}}>
      {[{id:"strains",l:"🌿 Sorten"},{id:"upgrades",l:"⚙️ Shop"},{id:"beach",l:"🏖️ Strand"}].map(s=>(
        <button key={s.id} onClick={()=>setItemSub(s.id)} style={{flex:1,background:itemSub===s.id?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.04)",border:`1.5px solid ${itemSub===s.id?"rgba(74,222,128,0.4)":"rgba(255,255,255,0.08)"}`,borderRadius:11,padding:"7px 4px",color:itemSub===s.id?"#4ade80":"rgba(255,255,255,0.4)",fontSize:12,fontWeight:itemSub===s.id?700:400,cursor:"pointer"}}>
          {s.l}
        </button>
      ))}
    </div>

    {/* ── STRAINS ── */}
    {itemSub==="strains"&&<div>
      <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,marginBottom:12,lineHeight:1.5}}>
        Sorten bearbeiten oder neue erstellen. Alle Änderungen wirken sich sofort auf neue Pflanzen aus.
      </div>

      {/* Strain list */}
      {editStrains.map((s,i)=>(
        <div key={s.id||i} style={{background:"rgba(255,255,255,0.03)",border:`1.5px solid ${RARITY_C[s.rarity]||"rgba(255,255,255,0.08)"}44`,borderRadius:16,padding:"12px 14px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:22}}>{s.emoji}</span>
              <div>
                <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{s.name}</div>
                <div style={{color:RARITY_C[s.rarity]||"#fff",fontSize:10}}>{s.rarity}</div>
              </div>
            </div>
            <button onClick={()=>setEditStrains(p=>p.filter((_,j)=>j!==i))} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:"4px 10px",color:"#f87171",fontSize:11,cursor:"pointer"}}>Löschen</button>
          </div>

          {/* Row 1: Name, Emoji */}
          <div style={{display:"grid",gridTemplateColumns:"3fr 1fr",gap:6,marginBottom:7}}>
            <FieldLabel label="Name">
              <input value={s.name} onChange={e=>updateStrain(i,"name",e.target.value)} style={iStyle}/>
            </FieldLabel>
            <FieldLabel label="Emoji">
              <input value={s.emoji} onChange={e=>updateStrain(i,"emoji",e.target.value)} style={iStyle}/>
            </FieldLabel>
          </div>

          {/* Row 2: Rarity, Bud-Bild, Preise */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:7}}>
            <FieldLabel label="Seltenheit">
              <select value={s.rarity} onChange={e=>updateStrain(i,"rarity",e.target.value)} style={iStyle}>
                <option value="Common">Common</option>
                <option value="Rare">Rare</option>
                <option value="Epic">Epic</option>
              </select>
            </FieldLabel>
            <FieldLabel label="Bud-Grafik">
              <select value={s.bud} onChange={e=>updateStrain(i,"bud",e.target.value)} style={iStyle}>
                {["bud_basic","bud_purple","bud_neon","bud_gold"].map(b=><option key={b} value={b}>{b.replace("bud_","")}</option>)}
              </select>
            </FieldLabel>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:7}}>
            <FieldLabel label="Basispreis $" hint="Verkaufswert bei Note B">
              <input type="number" value={s.basePrice} min="10" max="99999" onChange={e=>updateStrain(i,"basePrice",+e.target.value)} style={{...iStyle,color:"#4ade80",fontWeight:700}}/>
            </FieldLabel>
            <FieldLabel label="Samenpreis $" hint="Kosten (0 = gratis)">
              <input type="number" value={s.seedCost??0} min="0" max="9999" onChange={e=>updateStrain(i,"seedCost",+e.target.value)} style={{...iStyle,color:"#fbbf24",fontWeight:700}}/>
            </FieldLabel>
            <FieldLabel label="Qualitäts-Cap %" hint="Genetisches Maximum (65=B, 78=A, 92=A+)">
              <input type="number" value={s.qualityCap??100} min="10" max="100" onChange={e=>updateStrain(i,"qualityCap",Math.min(100,Math.max(10,+e.target.value)))} style={{...iStyle,color:"#a855f7",fontWeight:700}}/>
            </FieldLabel>
          </div>
          <div style={{background:"rgba(168,85,247,0.06)",border:"1px solid rgba(168,85,247,0.15)",borderRadius:8,padding:"6px 10px",marginBottom:7}}>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:4}}>MAXIMALE NOTE (bei Cap {s.qualityCap??100}%)</div>
            <div style={{display:"flex",gap:8}}>
              {[{min:0,grade:"D",color:"#ef4444"},{min:40,grade:"C",color:"#f97316"},{min:60,grade:"B",color:"#eab308"},{min:78,grade:"A",color:"#22c55e"},{min:92,grade:"A+",color:"#a855f7"}].map(g=>{
                const reachable=(s.qualityCap??100)>=g.min;
                return <div key={g.grade} style={{flex:1,background:reachable?`${g.color}15`:"rgba(255,255,255,0.03)",border:`1px solid ${reachable?g.color+"44":"rgba(255,255,255,0.08)"}`,borderRadius:7,padding:"3px 5px",textAlign:"center",opacity:reachable?1:0.35}}>
                  <div style={{color:reachable?g.color:"rgba(255,255,255,0.2)",fontWeight:700,fontSize:11}}>{g.grade}</div>
                  <div style={{color:"rgba(255,255,255,0.2)",fontSize:8}}>{g.min}%</div>
                </div>;
              })}
            </div>
          </div>

          {/* Difficulty params */}
          <div style={{background:"rgba(0,0,0,0.3)",borderRadius:10,padding:"10px",marginBottom:7}}>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:8}}>⚗️ SCHWIERIGKEIT & VERHALTEN</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:7}}>
              <FieldLabel label="Stresstoleranz %" hint="0=empfindlich · 100=robust">
                <div style={{display:"flex",gap:5}}>
                  <input type="number" min="0" max="100" value={s.stressTolerance??50}
                    onChange={e=>updateStrain(i,"stressTolerance",Math.min(100,Math.max(0,+e.target.value)))}
                    style={{...iStyle,width:70,color:"#4ade80",fontWeight:700,textAlign:"center"}}/>
                  <div style={{flex:1,background:"rgba(74,222,128,0.08)",borderRadius:8,padding:"4px 8px",display:"flex",alignItems:"center"}}>
                    <div style={{width:`${s.stressTolerance??50}%`,height:4,background:"#4ade80",borderRadius:2,transition:"width 0.3s"}}/>
                  </div>
                </div>
              </FieldLabel>
              <FieldLabel label="Wasserbedarf ×" hint="0.5=niedrig · 2.0=hoch">
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <input type="number" min="0.3" max="3.0" step="0.1" value={(s.waterNeeds||1).toFixed(1)}
                    onChange={e=>updateStrain(i,"waterNeeds",Math.min(3,Math.max(0.3,+e.target.value)))}
                    style={{...iStyle,width:70,color:"#38bdf8",fontWeight:700,textAlign:"center"}}/>
                  <span style={{color:"rgba(255,255,255,0.25)",fontSize:10}}>× normal</span>
                </div>
              </FieldLabel>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <FieldLabel label="Wachstum ×" hint="0.5=langsam · 2.0=schnell">
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <input type="number" min="0.3" max="3.0" step="0.05" value={(s.growSpeed||1).toFixed(2)}
                    onChange={e=>updateStrain(i,"growSpeed",Math.min(3,Math.max(0.3,+e.target.value)))}
                    style={{...iStyle,width:70,color:"#fbbf24",fontWeight:700,textAlign:"center"}}/>
                  <span style={{color:"rgba(255,255,255,0.25)",fontSize:10}}>× normal</span>
                </div>
              </FieldLabel>
              <FieldLabel label="Bonus-Wochentage" hint="+50% Preis an diesen Tagen">
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {["Mo","Di","Mi","Do","Fr","Sa","So"].map((d,di)=>{
                    const active=(s.sellDays||[]).includes(di);
                    return <button key={di} onClick={()=>{
                      const cur=s.bonusDays||[];
                      updateStrain(i,"sellDays",active?cur.filter(x=>x!==di):[...cur,di]);
                    }} style={{background:active?"rgba(251,191,36,0.25)":"rgba(255,255,255,0.06)",border:`1px solid ${active?"rgba(251,191,36,0.5)":"rgba(255,255,255,0.1)"}`,borderRadius:5,padding:"2px 5px",color:active?"#fbbf24":"rgba(255,255,255,0.3)",fontSize:9,cursor:"pointer",fontWeight:active?700:400}}>{d}</button>;
                  })}
                </div>
              </FieldLabel>
            </div>
          </div>

          {/* Difficulty preview */}
          <div style={{display:"flex",gap:5}}>
            {[
              {l:"Preis A+",v:(s.qualityCap??100)>=92?`$${Math.round(s.basePrice*2.8)}`:"–",c:"#a855f7"},
              {l:"Preis B", v:`$${Math.round(s.basePrice*1.0)}`,c:"#eab308"},
              {l:"Samen",   v:`$${s.seedCost??0}`,              c:"#fbbf24"},
              {l:"Wasser/s",v:`${(0.55*(s.waterNeeds||1)).toFixed(2)}%`,c:"#38bdf8"},
            ].map(x=>(
              <div key={x.l} style={{flex:1,background:"rgba(0,0,0,0.4)",borderRadius:8,padding:"4px 6px",textAlign:"center"}}>
                <div style={{color:"rgba(255,255,255,0.25)",fontSize:8}}>{x.l}</div>
                <div style={{color:x.c,fontWeight:700,fontSize:11}}>{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add new strain */}
      <button onClick={()=>setEditStrains(p=>[...p,{id:`custom_${Date.now()}`,name:"Neue Sorte",emoji:"🌿",rarity:"Common",basePrice:200,bud:"bud_basic",seedCost:50,qualityCap:70,stressTolerance:50,waterNeeds:1.0,growSpeed:1.0,sellDays:[],bonusPercent:50}])} style={{width:"100%",background:"rgba(74,222,128,0.07)",border:"2px dashed rgba(74,222,128,0.2)",borderRadius:14,padding:"11px",color:"#4ade80",fontSize:13,cursor:"pointer",marginBottom:10}}>
        + Neue Sorte hinzufügen
      </button>

      <button onClick={()=>saveItems("strains",editStrains)} style={{width:"100%",background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:13,padding:"12px",color:"#1a2e1a",fontWeight:800,fontSize:14,cursor:"pointer"}}>
        💾 Sorten speichern & aktivieren
      </button>
    </div>}

    {/* ── UPGRADES / SHOP ── */}
    {itemSub==="upgrades"&&<div>
      <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,marginBottom:12,lineHeight:1.5}}>
        Shop-Items bearbeiten: Preis, Beschreibung und Verfügbarkeit nach Wochentag.
      </div>
      {editUpgrades.map((u,i)=>(
        <div key={u.id||i} style={{background:"rgba(255,255,255,0.03)",border:"1.5px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"12px 14px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <img src={customImgs[u.img]||A[u.img]} style={{width:30,height:30,objectFit:"contain"}}/>
              <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{u.name}</div>
            </div>
            {!DEFAULT_UPGRADES.find(d=>d.id===u.id)&&
              <button onClick={()=>setEditUpgrades(p=>p.filter((_,j)=>j!==i))} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:"4px 10px",color:"#f87171",fontSize:11,cursor:"pointer"}}>Löschen</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"3fr 1fr",gap:6,marginBottom:7}}>
            <FieldLabel label="Name">
              <input value={u.name} onChange={e=>updateUpgrade(i,"name",e.target.value)} style={iStyle}/>
            </FieldLabel>
            <FieldLabel label="Preis $">
              <input type="number" value={u.cost} min="0" onChange={e=>updateUpgrade(i,"cost",+e.target.value)} style={iStyle}/>
            </FieldLabel>
          </div>
          <div style={{marginBottom:7}}>
            <FieldLabel label="Beschreibung">
              <input value={u.desc} onChange={e=>updateUpgrade(i,"desc",e.target.value)} style={iStyle}/>
            </FieldLabel>
          </div>
          <FieldLabel label="Nur an diesen Tagen verfügbar (leer = immer)" hint="Spieler können den Kauf nur an diesen Wochentagen tätigen">
            <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
              {["Mo","Di","Mi","Do","Fr","Sa","So"].map((d,di)=>{
                const active=(u.dayAvailability||[]).includes(di);
                return <button key={di} onClick={()=>{
                  const cur=u.dayAvailability||[];
                  updateUpgrade(i,"dayAvailability",active?cur.filter(x=>x!==di):[...cur,di]);
                }} style={{background:active?"rgba(251,191,36,0.25)":"rgba(255,255,255,0.06)",border:`1px solid ${active?"rgba(251,191,36,0.5)":"rgba(255,255,255,0.1)"}`,borderRadius:6,padding:"4px 8px",color:active?"#fbbf24":"rgba(255,255,255,0.3)",fontSize:10,cursor:"pointer",fontWeight:active?700:400}}>{d}</button>;
              })}
              {(u.dayAvailability||[]).length>0&&<button onClick={()=>updateUpgrade(i,"dayAvailability",[])} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"4px 8px",color:"rgba(255,255,255,0.25)",fontSize:10,cursor:"pointer"}}>✕ Immer</button>}
            </div>
            {(u.dayAvailability||[]).length>0&&(
              <div style={{marginTop:5,color:"rgba(251,191,36,0.6)",fontSize:10}}>
                ⏰ Nur verfügbar: {["Mo","Di","Mi","Do","Fr","Sa","So"].filter((_,di)=>(u.dayAvailability||[]).includes(di)).join(", ")}
              </div>
            )}
          </FieldLabel>
        </div>
      ))}
      <button onClick={()=>setEditUpgrades(p=>[...p,{id:`custom_${Date.now()}`,name:"Neues Item",img:"icon_gear",cost:500,desc:"Beschreibung...",dayAvailability:[]}])} style={{width:"100%",background:"rgba(251,191,36,0.07)",border:"2px dashed rgba(251,191,36,0.2)",borderRadius:14,padding:"11px",color:"#fbbf24",fontSize:13,cursor:"pointer",marginBottom:10}}>
        + Neues Shop-Item
      </button>
      <button onClick={()=>saveItems("upgrades",editUpgrades)} style={{width:"100%",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",border:"none",borderRadius:13,padding:"12px",color:"#1a1a2e",fontWeight:800,fontSize:14,cursor:"pointer"}}>
        💾 Shop speichern & aktivieren
      </button>
    </div>}

    {/* ── BEACH ITEMS ── */}
    {itemSub==="beach"&&<div>
      <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,marginBottom:12,lineHeight:1.5}}>
        Strand-Funde konfigurieren. Wahrscheinlichkeiten müssen sich auf 100% summieren.
      </div>
      {editBeach.map((b,i)=>(
        <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1.5px solid rgba(255,255,255,0.08)",borderRadius:14,padding:"12px 14px",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <img src={customImgs[b.img]||A[b.img]} style={{width:30,height:30,objectFit:"contain"}}/>
              <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{b.name}</div>
            </div>
            <button onClick={()=>setEditBeach(p=>p.filter((_,j)=>j!==i))} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:"4px 10px",color:"#f87171",fontSize:11,cursor:"pointer"}}>−</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:6,marginBottom:6}}>
            <FieldLabel label="Name">
              <input value={b.name} onChange={e=>updateBeach(i,"name",e.target.value)} style={iStyle}/>
            </FieldLabel>
            <FieldLabel label="Cash $">
              <input type="number" value={b.cash} min="0" onChange={e=>updateBeach(i,"cash",+e.target.value)} style={iStyle}/>
            </FieldLabel>
            <FieldLabel label={`Chance ${Math.round(b.prob*100)}%`}>
              <input type="range" min="1" max="80" value={Math.round(b.prob*100)} onChange={e=>updateBeach(i,"prob",+e.target.value/100)} style={{width:"100%",accentColor:"#60a5fa",marginTop:6}}/>
            </FieldLabel>
          </div>
        </div>
      ))}
      <div style={{background:`rgba(${Math.abs(editBeach.reduce((s,b)=>s+b.prob,0)-1)<0.01?"74,222,128":"239,68,68"},0.08)`,border:`1px solid rgba(${Math.abs(editBeach.reduce((s,b)=>s+b.prob,0)-1)<0.01?"74,222,128":"239,68,68"},0.25)`,borderRadius:10,padding:"7px 12px",marginBottom:10,display:"flex",justifyContent:"space-between"}}>
        <span style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>Gesamt-Wahrscheinlichkeit</span>
        <span style={{color:Math.abs(editBeach.reduce((s,b)=>s+b.prob,0)-1)<0.01?"#4ade80":"#f87171",fontWeight:700,fontSize:12}}>{Math.round(editBeach.reduce((s,b)=>s+b.prob,0)*100)}%</span>
      </div>
      <button onClick={()=>setEditBeach(p=>[...p,{name:"Neuer Fund",img:"item_coconut",cash:100,seeds:0,prob:0.1}])} style={{width:"100%",background:"rgba(96,165,250,0.07)",border:"2px dashed rgba(96,165,250,0.2)",borderRadius:14,padding:"11px",color:"#60a5fa",fontSize:13,cursor:"pointer",marginBottom:10}}>
        + Fund hinzufügen
      </button>
      <button onClick={()=>saveItems("beach",editBeach)} style={{width:"100%",background:"linear-gradient(135deg,#60a5fa,#3b82f6)",border:"none",borderRadius:13,padding:"12px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>
        💾 Strand-Items speichern
      </button>
    </div>}
  </div>
)}

        {/* ── BILDER ── */}
        {tab==="images"&&(
          <div>
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
              {Object.keys(ASSET_CATEGORIES).map(cat=>(
                <button key={cat} onClick={()=>setImgCat(cat)} style={{background:imgCat===cat?"rgba(168,85,247,0.15)":"rgba(255,255,255,0.04)",border:`1.5px solid ${imgCat===cat?"rgba(168,85,247,0.4)":"rgba(255,255,255,0.08)"}`,borderRadius:10,padding:"5px 10px",color:imgCat===cat?"#c084fc":"rgba(255,255,255,0.4)",fontSize:11,fontWeight:imgCat===cat?700:400,cursor:"pointer"}}>
                  {cat}
                </button>
              ))}
            </div>
            <div style={{color:"rgba(255,255,255,0.25)",fontSize:10,marginBottom:12,lineHeight:1.5}}>
              💡 Klicke auf ein Bild um es zu ersetzen. Eigene Bilder werden sofort für alle Spieler aktiv.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {ASSET_CATEGORIES[imgCat].map(asset=>{
                const isCustom = !!customized[asset.key];
                const src = customImgs[asset.key] || A[asset.key];
                return (
                  <div key={asset.key} style={{background:"rgba(255,255,255,0.03)",border:`1.5px solid ${isCustom?"rgba(168,85,247,0.35)":"rgba(255,255,255,0.07)"}`,borderRadius:14,padding:"10px",position:"relative"}}>
                    {isCustom&&<div style={{position:"absolute",top:6,right:6,background:"rgba(168,85,247,0.2)",border:"1px solid rgba(168,85,247,0.4)",borderRadius:5,padding:"1px 5px",color:"#c084fc",fontSize:8,fontWeight:700}}>CUSTOM</div>}
                    <img src={src} style={{width:"100%",height:72,objectFit:"contain",borderRadius:8,marginBottom:7,background:"rgba(0,0,0,0.2)",cursor:"pointer"}} onClick={()=>handleImgUpload(asset.key)} alt={asset.label}/>
                    <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,fontWeight:600,textAlign:"center",marginBottom:6}}>{asset.label}</div>
                    <div style={{color:"rgba(255,255,255,0.2)",fontSize:8,textAlign:"center",marginBottom:7,fontFamily:"monospace"}}>{asset.key}</div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>handleImgUpload(asset.key)} style={{flex:2,background:"rgba(168,85,247,0.12)",border:"1px solid rgba(168,85,247,0.25)",borderRadius:8,padding:"5px",color:"#c084fc",fontSize:10,cursor:"pointer",fontWeight:700}}>📤 Ersetzen</button>
                      {isCustom&&<button onClick={()=>resetImg(asset.key)} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"5px",color:"rgba(255,255,255,0.35)",fontSize:10,cursor:"pointer"}}>↩️</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ADMIN MAIL ── */}
        {tab==="mail"&&(
          <div>
            {adminCompose?(
              <div>
                <button onClick={()=>setAdminComp(false)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"5px 12px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer",marginBottom:12}}>← Zurück</button>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div>
                    <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,marginBottom:3}}>AN</div>
                    <select value={adminMailTo} onChange={e=>setAdminTo(e.target.value)}
                      style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:11,padding:"9px 12px",color:adminMailTo?"#fff":"rgba(255,255,255,0.35)",fontSize:12,outline:"none",fontFamily:"inherit"}}>
                      <option value="">Empfänger wählen...</option>
                      {allAccounts.filter(a=>a.username!=="admin").map(a=>(
                        <option key={a.username} value={a.username}>{a.displayName} (@{a.username})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,marginBottom:3}}>BETREFF</div>
                    <input value={adminMailSub} onChange={e=>setAdminSub(e.target.value)} placeholder="Betreff..."
                      style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:11,padding:"9px 12px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                  </div>
                  <div>
                    <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,marginBottom:3}}>NACHRICHT</div>
                    <textarea value={adminMailBody} onChange={e=>setAdminBody(e.target.value)} placeholder="Deine Nachricht..." rows={6}
                      style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:11,padding:"9px 12px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit",resize:"none",lineHeight:1.55}}/>
                  </div>
                  <button onClick={adminSendMail} style={{background:"linear-gradient(135deg,#f87171,#ef4444)",border:"none",borderRadius:12,padding:"11px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                    📬 Als Admin senden
                  </button>
                </div>
              </div>
            ):adminMailView?(
              <div>
                <button onClick={()=>setAMV(null)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"5px 12px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer",marginBottom:12}}>← Zurück</button>
                <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:"14px",marginBottom:10}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:14,marginBottom:6}}>{adminMailView.subject}</div>
                  <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                    <span style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:7,padding:"2px 8px",color:"#f87171",fontSize:10}}>Von: @{adminMailView.from}</span>
                    <span style={{background:"rgba(96,165,250,0.1)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:7,padding:"2px 8px",color:"#60a5fa",fontSize:10}}>An: @{adminMailView.recipientUser}</span>
                    <span style={{color:"rgba(255,255,255,0.2)",fontSize:10,padding:"2px 0"}}>{new Date(adminMailView.time).toLocaleString("de-DE")}</span>
                  </div>
                  <div style={{color:"rgba(255,255,255,0.7)",fontSize:12,lineHeight:1.65,whiteSpace:"pre-wrap",borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:10}}>{adminMailView.body}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{
                    // Reply to whoever sent this (if it came from a player, reply to them; if admin sent it, reply to recipient)
                    const replyTo=adminMailView.from==="admin"?adminMailView.recipientUser:adminMailView.from;
                    setAdminTo(replyTo);setAdminSub(`Re: ${adminMailView.subject}`);setAdminBody("");setAMV(null);setAdminComp(true);
                  }} style={{flex:1,background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:11,padding:"8px",color:"#4ade80",fontWeight:700,fontSize:12,cursor:"pointer"}}>↩️ Antworten</button>
                  <button onClick={()=>adminMarkRead(adminMailView.recipientUser,adminMailView.id,!adminMailView.read)} style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:11,padding:"8px",color:"rgba(255,255,255,0.45)",fontSize:12,cursor:"pointer"}}>{adminMailView.read?"◌ Ungelesen":"✓ Gelesen"}</button>
                  <button onClick={()=>adminDeleteMail(adminMailView.recipientUser,adminMailView.id)} style={{flex:1,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:11,padding:"8px",color:"rgba(239,68,68,0.7)",fontSize:12,cursor:"pointer"}}>🗑️</button>
                </div>
              </div>
            ):(
              <div>
                {/* Stats + compose button */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,letterSpacing:1}}>{adminMails.length} NACHRICHTEN</div>
                    <div style={{color:"rgba(239,68,68,0.6)",fontSize:9,marginTop:1}}>{adminMails.filter(m=>!m.read).length} ungelesen · {adminMails.filter(m=>m.deletedByPlayer).length} vom Spieler gelöscht</div>
                  </div>
                  <button onClick={()=>{setAdminComp(true);setAMV(null);}} style={{background:"linear-gradient(135deg,#f87171,#ef4444)",border:"none",borderRadius:9,padding:"6px 14px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>✏️ Neue Nachricht</button>
                </div>
                {/* Filter tabs */}
                <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>
                  <button onClick={()=>setAMF("all")} style={{background:adminMailFilter==="all"?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${adminMailFilter==="all"?"rgba(239,68,68,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:9,padding:"4px 10px",color:adminMailFilter==="all"?"#f87171":"rgba(255,255,255,0.4)",fontSize:11,cursor:"pointer",fontWeight:700}}>Alle</button>
                  <button onClick={()=>setAMF("unread")} style={{background:adminMailFilter==="unread"?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${adminMailFilter==="unread"?"rgba(239,68,68,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:9,padding:"4px 10px",color:adminMailFilter==="unread"?"#f87171":"rgba(255,255,255,0.4)",fontSize:11,cursor:"pointer"}}>Ungelesen</button>
                  {players.map(p=>(
                    <button key={p.username} onClick={()=>setAMF(p.username)} style={{background:adminMailFilter===p.username?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${adminMailFilter===p.username?"rgba(239,68,68,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:9,padding:"4px 10px",color:adminMailFilter===p.username?"#f87171":"rgba(255,255,255,0.4)",fontSize:11,cursor:"pointer"}}>@{p.username}</button>
                  ))}
                </div>
                {/* Message list */}
                {adminMails
                  .filter(m=>adminMailFilter==="all"?true:adminMailFilter==="unread"?!m.read:m.recipientUser===adminMailFilter||m.from===adminMailFilter)
                  .map(msg=>(
                  <div key={msg.id} onClick={()=>setAMV(msg)} style={{background:msg.deletedByPlayer?"rgba(100,100,100,0.06)":msg.read?"rgba(255,255,255,0.02)":"rgba(239,68,68,0.06)",border:`1px solid ${msg.deletedByPlayer?"rgba(100,100,100,0.15)":msg.read?"rgba(255,255,255,0.06)":"rgba(239,68,68,0.15)"}`,borderRadius:13,padding:"9px 12px",marginBottom:7,cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{color:msg.deletedByPlayer?"rgba(255,255,255,0.3)":msg.read?"rgba(255,255,255,0.5)":"#fff",fontWeight:msg.read?400:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{msg.subject}</span>
                      <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0,marginLeft:6}}>
                        {msg.deletedByPlayer&&<span style={{background:"rgba(100,100,100,0.3)",borderRadius:4,padding:"1px 5px",color:"rgba(255,255,255,0.3)",fontSize:8}}>gelöscht</span>}
                        <span style={{color:"rgba(255,255,255,0.2)",fontSize:9}}>{new Date(msg.time).toLocaleDateString("de-DE")}</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <span style={{color:"rgba(239,68,68,0.7)",fontSize:10}}>@{msg.from}</span>
                      <span style={{color:"rgba(255,255,255,0.2)",fontSize:10}}>→ @{msg.recipientUser}</span>
                    </div>
                    <div style={{color:"rgba(255,255,255,0.25)",fontSize:10,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{msg.body}</div>
                  </div>
                ))}
                {adminMails.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"rgba(255,255,255,0.2)"}}>📭 Keine Nachrichten</div>}
              </div>
            )}
          </div>
        )}
        {/* ── LOGS ── */}
        {tab==="logs"&&(
          <div>
            <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>
              <button onClick={()=>setLogF("all")} style={{background:logFilter==="all"?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${logFilter==="all"?"rgba(74,222,128,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:9,padding:"4px 10px",color:logFilter==="all"?"#4ade80":"rgba(255,255,255,0.4)",fontSize:11,cursor:"pointer",fontWeight:700}}>Alle</button>
              {players.map(p=>(
                <button key={p.username} onClick={()=>setLogF(p.username)} style={{background:logFilter===p.username?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${logFilter===p.username?"rgba(74,222,128,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:9,padding:"4px 10px",color:logFilter===p.username?"#4ade80":"rgba(255,255,255,0.4)",fontSize:11,cursor:"pointer"}}>@{p.username}</button>
              ))}
            </div>
            {(logFilter==="all"?logs:logs.filter(l=>l.username===logFilter)).slice(0,80).map((l,i)=>(
              <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",alignItems:"flex-start"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:l.action==="admin"?"#f87171":l.action==="harvest"?"#fbbf24":l.action==="sell"?"#4ade80":l.action==="login"?"#60a5fa":"#a855f7",marginTop:4,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:1}}>
                    <span style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:700}}>@{l.username}</span>
                    <span style={{background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"1px 5px",color:"rgba(255,255,255,0.3)",fontSize:8}}>{l.action}</span>
                  </div>
                  <div style={{color:"rgba(255,255,255,0.45)",fontSize:11}}>{l.detail}</div>
                </div>
                <div style={{color:"rgba(255,255,255,0.18)",fontSize:9,flexShrink:0}}>{fmtTime(l.time)}</div>
              </div>
            ))}
            {logs.length===0&&<div style={{textAlign:"center",padding:30,color:"rgba(255,255,255,0.2)"}}>Noch keine Logs</div>}
          </div>
        )}

        {/* ── SYSTEM ── */}
        {tab==="system"&&(
          <div>
            <AdminSection title="📢 Ankündigung">
              <textarea value={global.announcement} onChange={e=>setGlobal(g=>({...g,announcement:e.target.value}))} placeholder="Nachricht an alle Spieler beim nächsten Login..."
                style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:11,padding:"10px 12px",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit",resize:"vertical",minHeight:70,lineHeight:1.5,boxSizing:"border-box"}}/>
              <div style={{marginTop:8,display:"flex",gap:8}}>
                <button onClick={()=>setGlobal(g=>({...g,announcement:""}))} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer"}}>Löschen</button>
                <button onClick={saveGlobal} style={{flex:2,background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:10,padding:"8px",color:"#1a2e1a",fontWeight:800,fontSize:12,cursor:"pointer"}}>💾 Speichern</button>
              </div>
            </AdminSection>
            <AdminSection title="🚧 Wartungsmodus">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><div style={{color:"#fff",fontSize:13}}>Wartungsmodus</div><div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginTop:2}}>Spieler können sich nicht einloggen</div></div>
                <div onClick={()=>{setGlobal(g=>{const ng={...g,maintenanceMode:!g.maintenanceMode};store.set("settings:global",ng);return ng;});}} style={{width:44,height:24,borderRadius:12,background:global.maintenanceMode?"#ef4444":"rgba(255,255,255,0.12)",position:"relative",cursor:"pointer",transition:"background 0.25s"}}>
                  <div style={{position:"absolute",top:3,left:global.maintenanceMode?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.25s"}}/>
                </div>
              </div>
            </AdminSection>
            <AdminSection title="💥 Danger Zone">
              <button onClick={()=>{if(window.confirm("ALLE Spielstände zurücksetzen?"))resetAll();}} style={{width:"100%",background:"rgba(239,68,68,0.08)",border:"1.5px solid rgba(239,68,68,0.2)",borderRadius:12,padding:"11px",color:"#f87171",fontWeight:700,fontSize:13,cursor:"pointer"}}>💥 Alle Spielstände zurücksetzen</button>
            </AdminSection>
          </div>
        )}
        </>}
      </div>
    </div>
  );
}

function AdminSection({title, children}) {
  return (
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"12px 14px",marginBottom:10}}>
      <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:10}}>{title}</div>
      {children}
    </div>
  );
}
function FieldLabel({label,hint,children}) {
  return (
    <div>
      <div style={{color:"rgba(255,255,255,0.32)",fontSize:9,fontWeight:700,letterSpacing:0.5,marginBottom:3}}>
        {label}{hint&&<span style={{color:"rgba(255,255,255,0.2)",fontWeight:400,marginLeft:4}}>· {hint}</span>}
      </div>
      {children}
    </div>
  );
}


// ─── STORY MODAL ─────────────────────────────────────────────────────────────
function StoryModal({scenes,onDone}){
  const [idx,setIdx]=useState(0);
  const scene=scenes[idx];const mood=MOOD[scene.mood]||MOOD.dark;const isLast=idx===scenes.length-1;
  return(
    <div style={{position:"absolute",inset:0,zIndex:700,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {scene.bg&&A[scene.bg]&&<img src={A[scene.bg]} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",filter:"brightness(0.25)"}} alt=""/>}
      <div style={{position:"absolute",inset:0,background:mood.bg,opacity:0.9}}/>
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",height:"100%",padding:"28px 22px 24px"}}>
        <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:22}}>
          {scenes.map((_,i)=><div key={i} style={{width:i===idx?18:6,height:6,borderRadius:3,background:i<=idx?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.15)",transition:"all 0.3s"}}/>)}
        </div>
        {scene.img&&(
          <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",inset:-3,borderRadius:20,border:`2px solid ${mood.border}`,animation:"spin 5s linear infinite"}}/>
              <img src={A[scene.img]} style={{width:86,height:86,borderRadius:18,objectFit:"cover",position:"relative",border:`2px solid ${mood.border}`}}/>
            </div>
          </div>
        )}
        {scene.name&&<div style={{textAlign:"center",marginBottom:10}}><span style={{background:"rgba(0,0,0,0.5)",border:`1px solid ${mood.border}`,borderRadius:20,padding:"4px 16px",color:mood.text,fontWeight:800,fontSize:11,letterSpacing:1}}>{scene.name}</span></div>}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"rgba(0,0,0,0.42)",backdropFilter:"blur(16px)",border:`1px solid ${mood.border}`,borderRadius:20,padding:"18px 20px",maxWidth:310}}>
            <p style={{color:mood.text,fontSize:14,lineHeight:1.75,whiteSpace:"pre-line",fontStyle:scene.speaker?"italic":"normal",textAlign:"center",margin:0}}>{scene.speaker?`"${scene.text}"`:scene.text}</p>
          </div>
        </div>
        <div style={{marginTop:18,display:"flex",gap:10}}>
          {!isLast&&<button onClick={onDone} style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"11px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer"}}>Überspringen</button>}
          <button onClick={()=>isLast?onDone():setIdx(i=>i+1)} style={{flex:isLast?1:2,background:isLast?"linear-gradient(135deg,#4ade80,#22c55e)":"rgba(255,255,255,0.1)",border:isLast?"none":"1px solid rgba(255,255,255,0.15)",borderRadius:14,padding:"12px",color:isLast?"#1a2e1a":"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>
            {isLast?"⚡ Loslegen!":"Weiter →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TUTORIAL HINT ───────────────────────────────────────────────────────────
function TutorialHint({step,tutStep,onNext,onSkip}){
  if(!step)return null;
  return(
    <div style={{background:"rgba(4,18,10,0.97)",backdropFilter:"blur(16px)",border:"1.5px solid rgba(74,222,128,0.45)",borderRadius:18,padding:"14px 16px",marginBottom:4}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <img src={A.npc_mentor2} style={{width:38,height:38,borderRadius:9,border:"2px solid rgba(74,222,128,0.35)",flexShrink:0,objectFit:"cover"}}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{color:"#4ade80",fontWeight:800,fontSize:10}}>📖 PAPA VERDE · Schritt {tutStep+1}/6</span>
            <button onClick={onSkip} style={{background:"none",border:"none",color:"rgba(255,255,255,0.22)",fontSize:9,cursor:"pointer",textDecoration:"underline"}}>Überspringen</button>
          </div>
          <div style={{color:"#fff",fontWeight:700,fontSize:13,marginBottom:5}}>{step.title}</div>
          <div style={{color:"rgba(255,255,255,0.62)",fontSize:12,lineHeight:1.55,whiteSpace:"pre-line"}}>{step.text}</div>
        </div>
      </div>
      <div style={{marginTop:10,background:"rgba(255,255,255,0.06)",borderRadius:4,height:3}}><div style={{background:"linear-gradient(90deg,#4ade80,#34d399)",width:`${(tutStep/6)*100}%`,height:"100%",borderRadius:4}}/></div>
      {step.waitFor==="continue"&&<button onClick={onNext} style={{marginTop:10,width:"100%",background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:11,padding:"9px",color:"#1a2e1a",fontWeight:800,fontSize:13,cursor:"pointer"}}>Verstanden → Weiter</button>}
      {step.waitFor!=="continue"&&<div style={{marginTop:8,background:"rgba(74,222,128,0.08)",borderRadius:9,padding:"5px 10px",textAlign:"center"}}><span style={{color:"rgba(74,222,128,0.7)",fontSize:10}}>👆 Führe die Aktion durch um fortzufahren</span></div>}
    </div>
  );
}

// ─── PLANT SLOT ──────────────────────────────────────────────────────────────
function PlantSlot({plant,onWater,onHarvest,onPlant,strains,upgrades,isTutActive,tutWaitFor,settings}){
  const hasAuto=upgrades.includes("auto_water"),hasLamp=upgrades.includes("grow_lamp");
  const hlPlant=isTutActive&&tutWaitFor==="planted";
  const hlWater=isTutActive&&tutWaitFor==="watered";
  const hlHarvest=isTutActive&&tutWaitFor==="harvested";

  if(!plant) return(
    <div style={{background:"rgba(0,0,0,0.5)",backdropFilter:"blur(10px)",border:hlPlant?"2px solid #4ade80":"2px dashed rgba(255,255,255,0.12)",borderRadius:20,padding:16,boxShadow:hlPlant?"0 0 24px rgba(74,222,128,0.35)":undefined}}>
      <div style={{textAlign:"center",marginBottom:12}}>
        <img src={A.item_seeds} style={{width:36,height:36,opacity:0.45,marginBottom:5}}/>
        <div style={{color:"rgba(255,255,255,0.4)",fontSize:13}}>Sorte wählen</div>
        {hlPlant&&<div style={{color:"#4ade80",fontSize:11,marginTop:4,fontWeight:700}}>👇 Wähle eine Sorte</div>}
      </div>
      {strains.map(s=>(
        <button key={s.id} onClick={()=>onPlant(s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:`linear-gradient(135deg,${RARITY_C[s.rarity]}22,${RARITY_C[s.rarity]}08)`,border:`1.5px solid ${RARITY_C[s.rarity]}55`,borderRadius:12,padding:"8px 12px",color:"#fff",fontSize:13,cursor:"pointer",marginBottom:6}}>
          <div>
            <div>{s.emoji} {s.name}</div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,marginTop:1}}>
              Verkauf: ${s.basePrice} · {s.seedCost>0?<span style={{color:"#fbbf24"}}>Samen: ${s.seedCost}</span>:"Samen: gratis"}
            </div>
          </div>
          <span style={{color:RARITY_C[s.rarity],fontSize:10,fontWeight:700}}>{s.rarity}</span>
        </button>
      ))}
    </div>
  );

  const strainQ=plant.strain;const stage=STAGES[plant.stage],q=calcQ(plant.waterLog,strainQ.stressTolerance||50,strainQ.qualityCap||100),grade=getGrade(q),ready=plant.stage===3,wPct=plant.water,wColor=wPct>60?"#34d399":wPct>30?"#fbbf24":"#f87171";
  return(
    <div style={{background:"rgba(0,0,0,0.55)",backdropFilter:"blur(12px)",border:ready?"2px solid #fbbf24":hlHarvest?"2px solid #4ade80":"1.5px solid rgba(255,255,255,0.1)",borderRadius:20,padding:16,position:"relative",overflow:"hidden"}}>
      {ready&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,#fbbf2400,#fbbf24,#fbbf2400)",animation:"shimmer 1.5s infinite"}}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div><div style={{color:"#fff",fontWeight:700,fontSize:14}}>{plant.strain.emoji} {plant.strain.name}</div><div style={{color:RARITY_C[plant.strain.rarity],fontSize:10}}>{plant.strain.rarity}</div></div>
        <div style={{background:grade.color+"33",border:`1.5px solid ${grade.color}`,borderRadius:9,padding:"3px 10px",textAlign:"center"}}>
          <div style={{color:grade.color,fontWeight:800,fontSize:16}}>{grade.grade}</div>
          <div style={{color:grade.color,fontSize:8,opacity:0.7}}>{grade.label}</div>
          {plant.strain.qualityCap&&plant.strain.qualityCap<92&&(
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:7,marginTop:1}}>max {plant.strain.qualityCap<60?"B":plant.strain.qualityCap<78?"B":"A"}</div>
          )}
        </div>
      </div>
      {ready?(
        <div style={{textAlign:"center",marginBottom:10}}>
          <img src={A[plant.strain.bud]} style={{width:82,height:82,objectFit:"contain",filter:"drop-shadow(0 0 14px #fbbf24)",animation:"pulse 1.5s infinite"}}/>
          <div style={{color:"#fbbf24",fontSize:11,marginTop:3,fontWeight:700}}>🎉 Bereit zur Ernte!</div>
        </div>
      ):(
        <div style={{textAlign:"center",padding:"2px 0 8px"}}>
          <div style={{fontSize:44}}>{stage.emoji}</div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginTop:2}}>{stage.name}</div>
        </div>
      )}
      {!ready&&<>
        <div style={{marginBottom:7}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{color:"rgba(255,255,255,0.55)",fontSize:11}}>Phase {plant.stage+1}/3 {hasLamp&&"⚡"}</span>
            <span style={{fontSize:10}}>{STAGES.slice(0,3).map((_,i)=><span key={i} style={{color:i<=plant.stage?"#4ade80":"rgba(255,255,255,0.2)"}}>{i<plant.stage?"●":i===plant.stage?"◉":"○"}</span>)}</span>
          </div>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:6,height:5}}><div style={{background:stage.color,width:`${plant.progress}%`,height:"100%",borderRadius:6,transition:"width 0.5s"}}/></div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{color:"rgba(255,255,255,0.55)",fontSize:11}}>💧 Wasser {hasAuto&&<span style={{color:"#60a5fa",fontSize:10}}> 🤖</span>}</span>
            <span style={{color:wColor,fontSize:11,fontWeight:700}}>{Math.round(wPct)}%</span>
          </div>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:6,height:7}}><div style={{background:wColor,width:`${wPct}%`,height:"100%",borderRadius:6,transition:"width 0.5s"}}/></div>
          {settings?.waterWarning&&wPct<35&&<div style={{color:"#f87171",fontSize:9,fontWeight:700,marginTop:3}}>⚠️ Pflanze ist fast trocken!</div>}
        </div>
        <div style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"5px 10px",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
            <span style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>Qualität</span>
            <span style={{color:grade.color,fontWeight:700,fontSize:11}}>{q}% · {grade.grade} · {grade.label}</span>
          </div>
          <div style={{width:`${q}%`,height:3,background:grade.color,borderRadius:2,transition:"width 1s"}}/>
        </div>
      </>}
      {ready?(
        (()=>{const sd=plant.strain;const isBonus=isBonusDay(sd);const baseP=sellP(sd,q);return(
          <button onClick={onHarvest} style={{width:"100%",background:isBonus?"linear-gradient(135deg,#f59e0b,#fbbf24,#f59e0b)":"linear-gradient(135deg,#fbbf24,#f59e0b)",border:hlHarvest?"2px solid #fff":"none",borderRadius:13,padding:"11px",color:"#1a1a2e",fontWeight:800,fontSize:14,cursor:"pointer",boxShadow:`0 4px 20px ${isBonus?"#fbbf2488":"#fbbf2466"}`}}>
            ✂️ ERNTEN · ~${baseP.toLocaleString()}{isBonus?" 🌟":""}
          </button>
        );})()
      ):(
        <button onClick={onWater} disabled={wPct>=97} style={{width:"100%",background:wPct>=97?"rgba(255,255,255,0.05)":"linear-gradient(135deg,#38bdf8,#0ea5e9)",border:hlWater?"2px solid #fff":"none",borderRadius:13,padding:"11px",color:wPct>=97?"rgba(255,255,255,0.2)":"#fff",fontWeight:700,fontSize:13,cursor:wPct>=97?"default":"pointer",boxShadow:hlWater?"0 0 0 2px #4ade80,0 4px 20px rgba(74,222,128,0.35)":wPct>=97?"none":"0 3px 14px #0ea5e944",transition:"all 0.3s"}}>
          {wPct>=97?"💧 Bereits gegossen":"💧 GIESSEN +30%"}
        </button>
      )}
    </div>
  );
}

// ─── GAME SCREENS (Beach, NPC, Market, Shop, Trophies) ───────────────────────
function BeachScreen({onFind,lastBeach,setLastBeach,beachItems=BEACH_ITEMS}){
  const today=new Date().toDateString(),canSearch=lastBeach!==today;
  const bItems=beachItems||BEACH_ITEMS;
  const search=()=>{const roll=Math.random();let cum=0,found=bItems[0];for(const item of bItems){cum+=item.prob;if(roll<=cum){found=item;break;}}setLastBeach(today);onFind(found);};
  return(
    <div style={{padding:"0 4px"}}>
      <div style={{background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",borderRadius:18,padding:"14px 16px",marginBottom:14}}>
        <div style={{color:"#fff",fontWeight:700,fontSize:14,marginBottom:5}}>🌊 Täglicher Strand-Fund</div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:12,lineHeight:1.55}}>Die Gezeiten bringen täglich Überraschungen ans Ufer.</div>
      </div>
      <button onClick={search} disabled={!canSearch} style={{width:"100%",background:canSearch?"linear-gradient(135deg,#f59e0b,#fbbf24)":"rgba(255,255,255,0.06)",border:"none",borderRadius:16,padding:"15px",color:canSearch?"#1a1a2e":"rgba(255,255,255,0.25)",fontWeight:800,fontSize:15,cursor:canSearch?"pointer":"default",marginBottom:14}}>
        {canSearch?"🌊 STRAND ABSUCHEN":"✓ Heute bereits abgesucht"}
      </button>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
        {(bItems).map(item=>(
          <div key={item.name} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:"12px",textAlign:"center"}}>
            <img src={A[item.img]} style={{width:44,height:44,objectFit:"contain",marginBottom:6}}/>
            <div style={{color:"#fff",fontSize:12,fontWeight:600}}>{item.name}</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginTop:3}}>{item.cash>0?`+$${item.cash}`:"+1 Samen"}</div>
            <div style={{color:"rgba(255,255,255,0.18)",fontSize:9,marginTop:1}}>{Math.round(item.prob*100)}% Chance</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NpcScreen({onMsg,dialogs}){
  const [active,setActive]=useState(null);
  const talk=npc=>{
    if(!npc.unlocked){onMsg("🔒 Kontakt noch gesperrt","rgba(60,60,60,0.9)");return;}
    const msgs=dialogs[npc.id]||npc.msgs||["..."];
    setActive({...npc,msg:msgs[Math.floor(Math.random()*msgs.length)]});
  };
  return(
    <div style={{padding:"0 4px"}}>
      <div style={{background:"rgba(0,0,0,0.4)",borderRadius:14,padding:"10px 13px",marginBottom:12,fontSize:12,color:"rgba(255,255,255,0.4)",lineHeight:1.5}}>Deine Kontakte auf Isla Verde. Jeder hat seine Agenda.</div>
      {active&&(
        <div style={{background:`linear-gradient(135deg,${active.color}15,rgba(0,0,0,0.5))`,border:`1.5px solid ${active.color}44`,borderRadius:18,padding:14,marginBottom:12,animation:"slideIn 0.3s ease"}}>
          <div style={{display:"flex",gap:11}}>
            <img src={A[active.img]} style={{width:56,height:56,borderRadius:11,border:`2px solid ${active.color}55`,objectFit:"cover",flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{color:active.color,fontWeight:800,fontSize:12,marginBottom:2}}>{active.name}</div>
              <div style={{color:"rgba(255,255,255,0.7)",fontSize:12,lineHeight:1.55,fontStyle:"italic"}}>"{active.msg}"</div>
            </div>
          </div>
          <button onClick={()=>setActive(null)} style={{marginTop:8,width:"100%",background:"rgba(255,255,255,0.05)",border:"none",borderRadius:8,padding:"5px",color:"rgba(255,255,255,0.35)",fontSize:11,cursor:"pointer"}}>Gespräch beenden</button>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {NPCS_BASE.map(npc=>(
          <button key={npc.id} onClick={()=>talk(npc)} style={{background:npc.unlocked?`linear-gradient(135deg,${npc.color}10,rgba(0,0,0,0.4))`:"rgba(255,255,255,0.02)",border:`1.5px solid ${npc.unlocked?npc.color+"2e":"rgba(255,255,255,0.06)"}`,borderRadius:16,padding:12,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:7,filter:npc.unlocked?"none":"grayscale(1) opacity(0.38)"}}>
            <div style={{position:"relative"}}>
              <img src={A[npc.img]} style={{width:64,height:64,borderRadius:12,objectFit:"cover",border:`2px solid ${npc.unlocked?npc.color+"44":"rgba(255,255,255,0.05)"}`}}/>
              {!npc.unlocked&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,background:"rgba(0,0,0,0.5)",borderRadius:12}}>🔒</div>}
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{color:npc.unlocked?"#fff":"rgba(255,255,255,0.3)",fontWeight:700,fontSize:12}}>{npc.name}</div>
              <div style={{color:npc.unlocked?npc.color:"rgba(255,255,255,0.2)",fontSize:9,marginTop:1}}>{npc.title}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarketScreen({inventory,onSell,onSellAll,customImgs={}}){
  const total=inventory.reduce((s,i)=>s+i.price,0);
  if(!inventory.length)return(
    <div>
      <div style={{background:"rgba(0,0,0,0.4)",borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
        <img src={A.npc_tropical} style={{width:42,height:42,borderRadius:9,objectFit:"cover"}}/>
        <div><div style={{color:"#fff",fontWeight:700,fontSize:13}}>Don Carlos:</div><div style={{color:"rgba(255,255,255,0.4)",fontSize:11,fontStyle:"italic"}}>"Nichts da? Dann geh ernten."</div></div>
      </div>
      <div style={{textAlign:"center",padding:"30px 0",color:"rgba(255,255,255,0.25)",fontSize:13}}>Lager leer – zuerst ernten</div>
    </div>
  );
  return(
    <div style={{padding:"0 4px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(0,0,0,0.4)",border:"1.5px solid rgba(251,191,36,0.18)",borderRadius:15,padding:"10px 14px",marginBottom:12}}>
        <img src={A.npc_tropical} style={{width:36,height:36,borderRadius:9,objectFit:"cover"}}/>
        <div style={{flex:1}}><div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{inventory.length} Einheit{inventory.length!==1?"en":""}</div><div style={{color:"#fbbf24",fontWeight:800,fontSize:15}}>Gesamt: ${total.toLocaleString()}</div></div>
        <img src={A.icon_coin} style={{width:28,height:28}}/>
      </div>
      {inventory.length>1&&<button onClick={onSellAll} style={{width:"100%",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",border:"none",borderRadius:13,padding:"11px",color:"#1a1a2e",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:10}}>🤑 ALLES VERKAUFEN · ${total.toLocaleString()}</button>}
      {inventory.map((item,idx)=>{const g=getGrade(item.q);return(
        <div key={idx} style={{background:"rgba(0,0,0,0.4)",border:`1.5px solid ${g.color}33`,borderRadius:15,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <img src={customImgs?.[item.bud]||A[item.bud]} style={{width:44,height:44,objectFit:"contain",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontWeight:600,fontSize:13}}>{item.name}</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:2}}>
              <span style={{background:g.color+"22",border:`1px solid ${g.color}55`,borderRadius:5,padding:"1px 7px",color:g.color,fontSize:10,fontWeight:700}}>Note {g.grade}</span>
              {item.bonusDay&&<span style={{background:"rgba(251,191,36,0.2)",border:"1px solid rgba(251,191,36,0.4)",borderRadius:5,padding:"1px 7px",color:"#fbbf24",fontSize:10,fontWeight:700}}>🌟 Bonus-Tag!</span>}
            </div>
          </div>
          <button onClick={()=>onSell(idx)} style={{background:item.bonusDay?"linear-gradient(135deg,#fbbf24,#f59e0b)":"linear-gradient(135deg,#22c55e,#16a34a)",border:"none",borderRadius:11,padding:"7px 14px",color:item.bonusDay?"#1a1a2e":"#fff",fontWeight:700,fontSize:13,cursor:"pointer",flexShrink:0}}>${item.price}</button>
        </div>
      );})}
    </div>
  );
}

function ShopScreen({cash,upgrades,onBuyClick,allUpgrades=UPGRADES}){
  return(
    <div style={{padding:"0 4px"}}>
      <div style={{background:"rgba(0,0,0,0.4)",borderRadius:14,padding:"12px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"center"}}>
        <img src={A.icon_gear} style={{width:40,height:40,objectFit:"contain"}}/>
        <div><div style={{color:"#fff",fontWeight:700,fontSize:14}}>Upgrade Shop</div><div style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>Investiere in dein Imperium.</div></div>
      </div>
      {(allUpgrades||UPGRADES).map(u=>{const owned=upgrades.includes(u.id),afford=cash>=u.cost;const today=(new Date().getDay()+6)%7;const avail=!u.dayAvailability||!u.dayAvailability.length||u.dayAvailability.includes(today);return(
        <div key={u.id} style={{background:owned?"rgba(34,197,94,0.07)":"rgba(255,255,255,0.03)",border:owned?"1.5px solid rgba(34,197,94,0.28)":"1.5px solid rgba(255,255,255,0.07)",borderRadius:15,padding:"12px 14px",marginBottom:9,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
            <img src={A[u.img]} style={{width:38,height:38,objectFit:"contain",flexShrink:0}}/>
            <div style={{minWidth:0}}><div style={{color:"#fff",fontWeight:600,fontSize:13}}>{u.name}</div><div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginTop:2}}>{u.desc}</div></div>
          </div>
          {owned?<div style={{color:"#22c55e",fontSize:11,fontWeight:700,flexShrink:0}}>✓ Aktiv</div>:(
            <button onClick={()=>onBuyClick(u)} disabled={!afford} style={{background:afford?"linear-gradient(135deg,#fbbf24,#f59e0b)":"rgba(255,255,255,0.05)",border:"none",borderRadius:11,padding:"7px 12px",color:afford?"#1a1a2e":"rgba(255,255,255,0.2)",fontWeight:700,fontSize:12,cursor:afford?"pointer":"default",flexShrink:0,whiteSpace:"nowrap"}}>
              ${u.cost.toLocaleString()}
            </button>
          )}
        </div>
      );})}
    </div>
  );
}

function TrophiesScreen({stats}){
  const done=ACHIEVEMENTS.filter(a=>a.check(stats)),todo=ACHIEVEMENTS.filter(a=>!a.check(stats));
  return(
    <div style={{padding:"0 4px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <img src={A.statue_hof} style={{width:44,height:44,objectFit:"contain"}}/>
        <div><div style={{color:"#fff",fontWeight:700,fontSize:14}}>Green Almanac</div><div style={{color:"rgba(255,255,255,0.38)",fontSize:11}}>{done.length}/{ACHIEVEMENTS.length} freigeschaltet</div></div>
      </div>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,height:6,marginBottom:16}}><div style={{background:"linear-gradient(90deg,#4ade80,#a855f7)",width:`${(done.length/ACHIEVEMENTS.length)*100}%`,height:"100%",borderRadius:10}}/></div>
      {done.length>0&&<><div style={{color:"#4ade80",fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:9}}>✓ FREIGESCHALTET</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:14}}>{done.map(a=>(
        <div key={a.id} style={{background:"rgba(74,222,128,0.07)",border:"1.5px solid rgba(74,222,128,0.22)",borderRadius:15,padding:12,textAlign:"center"}}>
          <img src={A[a.img]} style={{width:50,height:50,marginBottom:5}}/><div style={{color:"#4ade80",fontWeight:700,fontSize:11}}>{a.name}</div><div style={{color:"rgba(255,255,255,0.33)",fontSize:9,marginTop:2}}>{a.desc}</div>
        </div>
      ))}</div></>}
      <div style={{color:"rgba(255,255,255,0.18)",fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:9}}>🔒 NOCH ZU ERREICHEN</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>{todo.map(a=>(
        <div key={a.id} style={{background:"rgba(255,255,255,0.02)",border:"1.5px solid rgba(255,255,255,0.05)",borderRadius:15,padding:12,textAlign:"center",opacity:0.35}}>
          <img src={A[a.img]} style={{width:50,height:50,marginBottom:5,filter:"grayscale(1)"}}/><div style={{color:"rgba(255,255,255,0.5)",fontWeight:700,fontSize:11}}>{a.name}</div><div style={{color:"rgba(255,255,255,0.3)",fontSize:9,marginTop:2}}>{a.desc}</div>
        </div>
      ))}</div>
    </div>
  );
}

function SettingsPanel({settings,onToggle,onClose}){
  const toggles=[
    {key:"confirmBuy",   label:"Kaufbestätigung",   desc:"Vor jedem Kauf nachfragen",    icon:"icon_coin"},
    {key:"showTutHints", label:"Tutorial-Hinweise",  desc:"Blaue Hinweis-Boxen anzeigen", icon:"icon_news"},
    {key:"missionBanner",label:"Mission-Banner",     desc:"Aktuelle Aufgabe anzeigen",    icon:"icon_map"},
    {key:"waterWarning", label:"Trocken-Warnung",    desc:"⚠️ bei wenig Wasser",         icon:"item_fertilizer"},
  ];
  return(
    <div style={{position:"absolute",inset:0,zIndex:750,display:"flex",flexDirection:"column"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)"}} onClick={onClose}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(170deg,#0f2027,#131c2b)",borderTop:"1.5px solid rgba(255,255,255,0.1)",borderRadius:"28px 28px 0 0",padding:"20px 20px 36px",animation:"slideUp 0.3s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}><img src={A.icon_gear} style={{width:24,height:24}}/><span style={{color:"#fff",fontWeight:800,fontSize:16}}>Einstellungen</span></div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,width:32,height:32,color:"rgba(255,255,255,0.5)",fontSize:16,cursor:"pointer"}}>×</button>
        </div>
        {toggles.map(t=>(
          <div key={t.key} onClick={()=>onToggle(t.key)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:"1px solid rgba(255,255,255,0.06)",cursor:"pointer"}}>
            <img src={A[t.icon]} style={{width:32,height:32,objectFit:"contain",flexShrink:0}}/>
            <div style={{flex:1}}><div style={{color:"#fff",fontWeight:600,fontSize:14}}>{t.label}</div><div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginTop:2}}>{t.desc}</div></div>
            <div style={{width:44,height:24,borderRadius:12,background:settings[t.key]?"#4ade80":"rgba(255,255,255,0.12)",position:"relative",transition:"background 0.25s",flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:settings[t.key]?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.25s"}}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── GAME WRAPPER (per player) ────────────────────────────────────────────────
function Game({username,displayName,initialState,dialogs,customImgs={},gameItems=null,onLogout}){
  const gs=initialState;
  const [screen,setScreen]=useState("grow");
  const [cash,setCash]=useState(gs.cash??420);
  const [plants,setPlants]=useState(gs.plants??[null,null]);
  const [inventory,setInventory]=useState(gs.inventory??[]);
  const [upgrades,setUpgrades]=useState(gs.upgrades??[]);
  const [earned,setEarned]=useState(gs.earned??0);
  const [harvests,setHarvests]=useState(gs.harvests??0);
  const [planted,setPlanted]=useState(gs.planted??false);
  const [mutations,setMutations]=useState(gs.mutations??0);
  const [bestGrade,setBestGrade]=useState(gs.bestGrade??"D");
  const [unlockedA,setUnlockedA]=useState(gs.unlockedAchievements??[]);
  const [seenCh,setSeenCh]=useState(gs.seenChapters??[]);
  const [tutStep,setTutStep]=useState(gs.tutStep??0);
  const [lastBeach,setLastBeach]=useState(gs.lastBeach??null);
  const [settings,setSettings]=useState(gs.settings??{confirmBuy:true,showTutHints:true,missionBanner:true,waterWarning:true});
  const [story,setStory]=useState(null);
  const [showSet,setShowSet]=useState(false);
  const [confirmItem,setConfirmI]=useState(null);
  const [toasts,setToasts]=useState([]);
  const [gameReady,setGameReady]=useState(false);
  const [announcement,setAnnouncement]=useState("");
  const [showMail,setShowMail]=useState(false);
  const [mailbox,setMailbox]=useState([]);
  const [mailCompose,setMailCompose]=useState(false);
  const [mailTo,setMailTo]=useState("");
  const [mailSubject,setMailSubject]=useState("");
  const [mailBody,setMailBody]=useState("");
  const [mailView,setMailView]=useState(null); // viewed message
  const tickRef=useRef(null);
  const stateRef=useRef({});

  // Dynamic game data (admin-configurable, passed from App)
  const activeStrains  = (gameItems?.strains  && gameItems.strains.length  > 0) ? gameItems.strains  : STRAINS;
  const activeUpgrades = (gameItems?.upgrades && gameItems.upgrades.length > 0) ? gameItems.upgrades : UPGRADES;
  const activeBeach    = (gameItems?.beach    && gameItems.beach.length    > 0) ? gameItems.beach    : BEACH_ITEMS;

  // Keep stateRef in sync
  useEffect(()=>{
    stateRef.current={cash,plants,inventory,upgrades,earned,harvests,planted,mutations,bestGrade,unlockedA,seenCh,tutStep,lastBeach,settings};
  },[cash,plants,inventory,upgrades,earned,harvests,planted,mutations,bestGrade,unlockedA,seenCh,tutStep,lastBeach,settings]);

  const saveState=useCallback(async()=>{
    const s=stateRef.current;
    const u=await store.get(`user:${username}`);
    if(u){u.gameState={...s,lastSeen:new Date().toISOString()};await store.set(`user:${username}`,u);}
  },[username]);

  const toast=useCallback((message,color,icon)=>{
    const id=Date.now()+Math.random();setToasts(p=>[...p,{id,message,color,icon}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),2800);
  },[]);

  const showChapter=useCallback((ch)=>{
    setStory({scenes:ch.scenes,onDone:()=>setStory(null)});
  },[]);

  // Announcement + mailbox on load
  useEffect(()=>{
    store.get("settings:global").then(g=>{
      if(g?.announcement)setAnnouncement(g.announcement);
    });
    loadMailbox();
  },[]);
  const loadMailbox=async()=>{
    const msgs=await store.get(`mail:${username}`)||[];
    // Player sees only their non-deleted messages
    setMailbox(msgs.filter(m=>!m.deletedByPlayer));
  };
  const sendMail=async()=>{
    if(!mailTo.trim()||!mailBody.trim()){toast("⚠️ Empfänger und Nachricht ausfüllen","rgba(239,68,68,0.9)");return;}
    const recipient=mailTo.trim().toLowerCase();
    const u=await store.get(`user:${recipient}`);
    if(!u){toast("⚠️ Spieler nicht gefunden","rgba(239,68,68,0.9)");return;}
    const msg={id:`msg_${Date.now()}`,from:username,fromName:displayName,to:recipient,
      subject:mailSubject.trim()||"Keine Betreff",body:mailBody.trim(),
      time:new Date().toISOString(),read:false};
    const inbox=await store.get(`mail:${recipient}`)||[];
    inbox.unshift(msg);
    await store.set(`mail:${recipient}`,inbox.slice(0,100));
    // Also store in sent (own inbox with flag)
    await addLog(username,"mail",`Nachricht an @${recipient}: ${msg.subject}`);
    setMailTo("");setMailSubject("");setMailBody("");setMailCompose(false);
    toast(`✉️ Gesendet an @${recipient}`,"rgba(74,222,128,0.9)");
  };
  const markRead=async(msgId)=>{
    const msgs=await store.get(`mail:${username}`)||[];
    const updated=msgs.map(m=>m.id===msgId?{...m,read:true}:m);
    await store.set(`mail:${username}`,updated);
    setMailbox(updated);
  };
  const deleteMail=async(msgId)=>{
    const msgs=await store.get(`mail:${username}`)||[];
    // Mark as deleted by player (not hard delete - admin still sees it)
    const updated=msgs.map(m=>m.id===msgId?{...m,deletedByPlayer:true}:m);
    await store.set(`mail:${username}`,updated);
    // Player only sees non-deleted messages
    setMailbox(updated.filter(m=>!m.deletedByPlayer));
    setMailView(null);
  };

  // Splash → story start
  useEffect(()=>{
    if(!gameReady)return;
    if(tutStep===0&&!seenCh.includes("intro")){
      setTimeout(()=>{setSeenCh(p=>[...p,"intro"]);showChapter(STORY_CHAPTERS[0]);},400);
    }
  },[gameReady]);

  // Chapter triggers
  useEffect(()=>{
    if(tutStep!==null&&tutStep<TUTORIAL_STEPS.length)return;
    CHAPTER_TRIGGERS.forEach(ch=>{
      if(seenCh.includes(ch.id))return;
      let trigger=false;
      if(ch.after==="harvest"&&harvests>=ch.count)trigger=true;
      if(ch.after==="earned"&&earned>=ch.threshold)trigger=true;
      if(trigger){setSeenCh(p=>[...p,ch.id]);showChapter(ch);}
    });
  },[harvests,earned,tutStep]);

  // Achievement check
  useEffect(()=>{
    ACHIEVEMENTS.forEach(a=>{
      if(!unlockedA.includes(a.id)&&a.check({harvests,earned,mutations,bestGrade})){
        setUnlockedA(p=>[...p,a.id]);
        toast(`🏆 ${a.name}!`,"rgba(168,85,247,0.93)",a.img);
      }
    });
  },[harvests,earned,mutations,bestGrade]);

  // Game tick
  const hasU=id=>upgrades.includes(id);
  useEffect(()=>{
    if(!gameReady)return;
    tickRef.current=setInterval(()=>{
      setPlants(prev=>prev.map(plant=>{
        if(!plant||plant.stage===3)return plant;
        const strainData=activeStrains.find(s=>s.id===plant.strain.id)||plant.strain;
        const wnMult=strainData.waterNeeds||1.0;
        const gsMult=strainData.growSpeed||1.0;
        const drainBase=hasU("auto_water")?0.25:0.55;
        const drain=drainBase*wnMult, speed=(hasU("grow_lamp")?1.3:1.0)*gsMult;
        const newW=Math.max(0,plant.water-drain),growth=(newW/100)*speed;
        const ppt=(100/STAGES[plant.stage].duration)*growth,newP=plant.progress+ppt;
        const newLog=[...plant.waterLog,newW].slice(-60);
        if(newP>=100)return{...plant,water:newW,progress:0,stage:plant.stage+1,waterLog:newLog};
        return{...plant,water:newW,progress:newP,waterLog:newLog};
      }));
    },1000);
    return()=>clearInterval(tickRef.current);
  },[gameReady,upgrades]);

  // Save every 15s
  useEffect(()=>{
    if(!gameReady)return;
    const id=setInterval(saveState,15000);
    return()=>clearInterval(id);
  },[gameReady,saveState]);

  const advanceTut=useCallback(()=>{
    const next=tutStep+1;
    if(next>=TUTORIAL_STEPS.length){setTutStep(null);toast("🎉 Tutorial fertig! Isla Verde gehört dir.","rgba(74,222,128,0.93)","badge_harvest");}
    else{const ns=TUTORIAL_STEPS[next];if(ns.screen&&ns.screen!==screen)setScreen(ns.screen);setTutStep(next);}
  },[tutStep,screen]);

  const doPlant=(idx,strain)=>{
    const strainData=activeStrains.find(s=>s.id===strain.id)||strain;
    const cost=strainData.seedCost||0;
    if(cost>0&&cash<cost){toast(`💸 Nicht genug! Samen kosten $${cost}`,"rgba(239,68,68,0.9)");return;}
    if(cost>0)setCash(c=>c-cost);
    setPlants(p=>{const n=[...p];n[idx]={strain,stage:0,progress:0,water:85,waterLog:[85]};return n;});
    setPlanted(true);
    toast(`🌱 ${strain.name} eingepflanzt!${cost>0?` (-$${cost})`:""}`,cost>0?"rgba(251,191,36,0.9)":"rgba(74,222,128,0.93)");
    addLog(username,"plant",`${strain.name} gepflanzt${cost>0?` ($${cost} Samen)`:""}`)
    setTimeout(saveState,500);
    if(tutStep===0)advanceTut();
  };
  const doWater=idx=>{
    setPlants(p=>{const n=[...p];if(n[idx])n[idx]={...n[idx],water:Math.min(100,n[idx].water+30)};return n;});
    toast("💧 +30%","rgba(56,189,248,0.88)");
    if(tutStep===1)advanceTut();
  };
  const doHarvest=idx=>{
    const plant=plants[idx];if(!plant||plant.stage!==3)return;
    const strainData=activeStrains.find(s=>s.id===plant.strain.id)||plant.strain;
    const q=calcQ(plant.waterLog,strainData.stressTolerance||50,strainData.qualityCap||100);
    const price=sellP(strainData,q),g=getGrade(q);
    const bonusD=isBonusDay(strainData);
    setInventory(p=>[...p,{name:plant.strain.name,bud:plant.strain.bud,q,price,bonusDay:bonusD,strainId:plant.strain.id}]);
    setPlants(p=>{const n=[...p];n[idx]=null;return n;});
    setHarvests(c=>c+1);
    if(["A","A+"].includes(g.grade))setBestGrade(prev=>g.grade==="A+"?"A+":prev==="A+"?"A+":"A");
    const bonus=isBonusDay(strainData);
    toast(`✂️ ${plant.strain.name} · Note ${g.grade}!${bonus?" 🌟 BONUS-TAG!":""}`,"rgba(251,191,36,0.93)","badge_harvest");
    addLog(username,"harvest",`${plant.strain.name} geerntet – Note ${g.grade} ($${price})${bonus?" [Bonus-Tag]":""}`);
    setTimeout(saveState,500);
    if(tutStep===3){
      // Show Don Carlos intro FIRST, then open market
      const ch1=CHAPTER_TRIGGERS.find(c=>c.id==="ch1");
      if(ch1&&!seenCh.includes("ch1")){
        setSeenCh(p=>[...p,"ch1"]);
        setStory({scenes:ch1.scenes,onDone:()=>{
          setStory(null);setScreen("market");advanceTut();
        }});
      } else {
        setScreen("market");advanceTut();
      }
    }
  };
  const doSell=idx=>{
    const item=inventory[idx];setCash(c=>c+item.price);setEarned(e=>e+item.price);
    setInventory(p=>p.filter((_,i)=>i!==idx));
    toast(`💰 +$${item.price.toLocaleString()}`,"rgba(34,197,94,0.93)","icon_coin");
    addLog(username,"sell",`${item.name} verkauft für $${item.price}`);
    setTimeout(saveState,500);
    if(tutStep===4)setTimeout(advanceTut,400);
    // ch2 trigger: show Sanchez scene when player hits $1000
    const newEarned=earned+item.price;
    const ch2=CHAPTER_TRIGGERS.find(c=>c.id==="ch2");
    if(ch2&&!seenCh.includes("ch2")&&newEarned>=ch2.threshold&&tutStep===null){
      setSeenCh(p=>[...p,"ch2"]);
      setTimeout(()=>setStory({scenes:ch2.scenes,onDone:()=>setStory(null)}),600);
    }
  };
  const doSellAll=()=>{
    const t=inventory.reduce((s,i)=>s+i.price,0);setCash(c=>c+t);setEarned(e=>e+t);setInventory([]);
    toast(`🤑 +$${t.toLocaleString()}`,"rgba(251,191,36,0.93)","icon_coin");
    addLog(username,"sell",`Alles verkauft für $${t}`);
    setTimeout(saveState,500);
    if(tutStep===4)setTimeout(advanceTut,400);
    const newEarned2=earned+inventory.reduce((s,i)=>s+i.price,0);
    const ch2b=CHAPTER_TRIGGERS.find(c=>c.id==="ch2");
    if(ch2b&&!seenCh.includes("ch2")&&newEarned2>=ch2b.threshold&&tutStep===null){
      setSeenCh(p=>[...p,"ch2"]);
      setTimeout(()=>setStory({scenes:ch2b.scenes,onDone:()=>setStory(null)}),600);
    }
  };
  const handleBuyClick=u=>{
    if(cash<u.cost){toast("💸 Nicht genug Geld","rgba(239,68,68,0.9)");return;}
    if(settings.confirmBuy)setConfirmI(u);else doBuy(u);
  };
  const doBuy=u=>{
    if(cash<u.cost)return;setCash(c=>c-u.cost);setUpgrades(p=>[...p,u.id]);setConfirmI(null);
    toast(`✓ ${u.name} aktiviert!`,"rgba(168,85,247,0.93)",u.img);
    addLog(username,"upgrade",`${u.name} gekauft ($${u.cost})`);
    setTimeout(saveState,500);
  };
  const doBeachFind=item=>{
    if(item.cash>0){setCash(c=>c+item.cash);toast(`🌊 ${item.name}! +$${item.cash}`,"rgba(56,189,248,0.9)",item.img);}
    else toast(`🌊 ${item.name}! +1 Samen`,"rgba(74,222,128,0.9)",item.img);
    addLog(username,"beach",`Gefunden: ${item.name}`);
    setTimeout(saveState,500);
  };

  const extraSlot=hasU("extra_slot"),visPlants=extraSlot?plants:[plants[0]];
  const invBadge=inventory.length;
  const bgKey=SCREEN_BG[screen];
  const curTutStep=tutStep!==null&&tutStep<TUTORIAL_STEPS.length?TUTORIAL_STEPS[tutStep]:null;
  const stats={harvests,earned,planted,mutations,bestGrade,upgrades};
  const missions=MISSIONS;

  if(!gameReady) return(
    <div style={{position:"relative",width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",overflow:"hidden"}}>
      <img src={A.bg_splash} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.96) 0%,rgba(0,0,0,0.2) 60%,transparent 100%)"}}/>
      <div style={{position:"relative",zIndex:2,padding:"0 26px 52px",textAlign:"center",width:"100%"}}>
        <div style={{fontFamily:"'Fredoka One',cursive",fontSize:32,background:"linear-gradient(135deg,#4ade80,#fbbf24)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:1,marginBottom:3}}>STICKY SYNDICATE</div>
        <div style={{color:"rgba(255,255,255,0.45)",fontSize:12,marginBottom:6}}>Willkommen zurück, <span style={{color:"#4ade80",fontWeight:700}}>{displayName}</span></div>
        {announcement&&<div style={{background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:12,padding:"8px 14px",color:"rgba(255,255,255,0.7)",fontSize:11,marginBottom:16,lineHeight:1.5}}>📢 {announcement}</div>}
        <button onClick={()=>setGameReady(true)} style={{width:"100%",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",border:"none",borderRadius:18,padding:"15px",color:"#1a1a2e",fontWeight:900,fontSize:17,cursor:"pointer",fontFamily:"'Fredoka One',cursive",letterSpacing:1,marginBottom:14,boxShadow:"0 6px 30px rgba(251,191,36,0.5)"}}>
          🌴 SPIELEN
        </button>
        <button onClick={async()=>{await saveState();onLogout();}} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:"9px 28px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer"}}>← Logout</button>
      </div>
    </div>
  );

  const tabs=[
    {id:"grow",    emoji:"🌿",label:"Grow"},
    {id:"beach",   emoji:"🏖️",label:"Strand"},
    {id:"market",  emoji:"💰",label:"Markt", badge:invBadge},
    {id:"npcs",    emoji:"👥",label:"NPCs"},
    {id:"shop",    emoji:"⚙️",label:"Shop"},
    {id:"trophies",emoji:"🏆",label:"HOF"},
  ];

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",position:"relative",background:bgKey?"none":"linear-gradient(160deg,#0f2027,#131c2b 50%,#0d1f1a)"}}>
      {bgKey&&<>
        <img src={A[bgKey]} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",zIndex:0}} alt=""/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.78) 0%,rgba(0,0,0,0.5) 50%,rgba(0,0,0,0.85) 100%)",zIndex:1}}/>
      </>}
      {story&&<StoryModal scenes={story.scenes} onDone={story.onDone}/>}
      {confirmItem&&<ConfirmModal item={confirmItem} onConfirm={()=>doBuy(confirmItem)} onCancel={()=>setConfirmI(null)}/>}
      {showMail&&<MailModal
        mailbox={mailbox} username={username} displayName={displayName}
        compose={mailCompose} setCompose={setMailCompose}
        mailTo={mailTo} setMailTo={setMailTo}
        mailSubject={mailSubject} setMailSubject={setMailSubject}
        mailBody={mailBody} setMailBody={setMailBody}
        onSend={sendMail} onClose={()=>{setShowMail(false);setMailCompose(false);setMailView(null);}}
        onRead={(msg)=>{setMailView(msg);markRead(msg.id);}} onDelete={deleteMail}
        mailView={mailView} setMailView={setMailView}
      />}
      {showSet&&<SettingsPanel settings={settings} onToggle={k=>setSettings(s=>({...s,[k]:!s[k]}))} onClose={()=>setShowSet(false)}/>}
      <Toast toasts={toasts}/>
      {/* Header */}
      <div style={{padding:"10px 14px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,0.07)",position:"relative",zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <img src={A.icon_badge} style={{width:24,height:24}}/>
          <span style={{fontFamily:"'Fredoka One',cursive",fontSize:14,background:"linear-gradient(135deg,#4ade80,#34d399)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>STICKY SYNDICATE</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:16,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
            <img src={A.icon_coin} style={{width:14,height:14}}/><span style={{color:"#fbbf24",fontWeight:800,fontSize:13}}>${cash.toLocaleString()}</span>
          </div>
          <div style={{background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:10,padding:"2px 8px",color:"#4ade80",fontSize:10,fontWeight:700}}>{displayName}</div>
          <button onClick={()=>{setShowMail(true);loadMailbox();}} style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:9,width:28,height:28,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            ✉️
            {mailbox.filter(m=>!m.read).length>0&&<div style={{position:"absolute",top:-3,right:-3,background:"#ef4444",color:"#fff",borderRadius:"50%",width:13,height:13,fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{mailbox.filter(m=>!m.read).length}</div>}
          </button>
          <button onClick={()=>setShowSet(true)} style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:9,width:28,height:28,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>⚙️</button>
          <button onClick={async()=>{await saveState();onLogout();}} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:9,width:28,height:28,cursor:"pointer",fontSize:11,color:"#f87171",display:"flex",alignItems:"center",justifyContent:"center"}}>⏏</button>
        </div>
      </div>
      {/* Stats */}
      <div style={{display:"flex",padding:"5px 12px",gap:6,borderBottom:"1px solid rgba(255,255,255,0.05)",position:"relative",zIndex:20}}>
        {[{l:"Ernten",v:harvests,img:"badge_harvest"},{l:"Verdient",v:`$${earned>=1000?(earned/1000).toFixed(1)+"k":earned}`,img:"icon_money"},{l:"Upgrades",v:`${upgrades.length}/${UPGRADES.length}`,img:"icon_gear"}].map(s=>(
          <div key={s.l} style={{flex:1,background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"4px 6px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <img src={A[s.img]} style={{width:14,height:14}}/><div style={{color:"rgba(255,255,255,0.28)",fontSize:7}}>{s.l}</div><div style={{color:"#fff",fontWeight:700,fontSize:10}}>{s.v}</div>
          </div>
        ))}
      </div>
      {/* Mission banner */}
      {tutStep===null&&settings.missionBanner&&(()=>{const cur=missions.find(m=>!m.check(stats));return cur?(
        <div style={{margin:"4px 14px",background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.15)",borderRadius:10,padding:"5px 11px",display:"flex",alignItems:"center",gap:8,position:"relative",zIndex:20}}>
          <img src={A[cur.icon]} style={{width:20,height:20,objectFit:"contain",flexShrink:0}}/>
          <div style={{color:"rgba(255,255,255,0.6)",fontSize:11,flex:1}}>{cur.desc}</div>
        </div>
      ):null;})()}
      {/* Screen label */}
      <div style={{padding:"6px 18px 2px",color:"rgba(255,255,255,0.3)",fontSize:9,fontWeight:700,letterSpacing:1.5,position:"relative",zIndex:20}}>
        {screen==="grow"&&"🌿 GROW-CONTROL"}{screen==="beach"&&"🏖️ STRAND"}{screen==="market"&&"💰 MARKT"}{screen==="npcs"&&"👥 NPCs"}{screen==="shop"&&"⚙️ SHOP"}{screen==="trophies"&&"🏆 HOF"}
      </div>
      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"4px 14px 14px",display:"flex",flexDirection:"column",gap:10,position:"relative",zIndex:20}}>
        {curTutStep&&settings.showTutHints&&!story&&<TutorialHint step={curTutStep} tutStep={tutStep} onNext={advanceTut} onSkip={()=>setTutStep(null)}/>}
        {screen==="grow"&&visPlants.map((p,i)=>(
          <PlantSlot key={i} plant={p} onWater={()=>doWater(i)} onHarvest={()=>doHarvest(i)} onPlant={s=>doPlant(i,s)} strains={activeStrains} upgrades={upgrades} isTutActive={!!curTutStep} tutWaitFor={curTutStep?.waitFor} settings={settings}/>
        ))}
        {screen==="beach"&&<BeachScreen onFind={doBeachFind} lastBeach={lastBeach} setLastBeach={setLastBeach} beachItems={activeBeach}/>}
        {screen==="market"&&<MarketScreen inventory={inventory} onSell={doSell} onSellAll={doSellAll} customImgs={customImgs}/>}
        {screen==="npcs"&&<NpcScreen onMsg={(m,c)=>toast(m,c)} dialogs={dialogs}/>}
        {screen==="shop"&&<ShopScreen cash={cash} upgrades={upgrades} onBuyClick={handleBuyClick} allUpgrades={activeUpgrades}/>}
        {screen==="trophies"&&<TrophiesScreen stats={stats}/>}
      </div>
      {/* Tab bar */}
      <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",background:"rgba(0,0,0,0.6)",backdropFilter:"blur(20px)",display:"flex",padding:"7px 0 17px",position:"relative",zIndex:20}}>
        {tabs.map(tab=>{const active=screen===tab.id;return(
          <button key={tab.id} onClick={()=>setScreen(tab.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"5px 0",position:"relative"}}>
            {tab.badge>0&&<div style={{position:"absolute",top:0,right:"8%",background:"#ef4444",color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{tab.badge}</div>}
            <span style={{fontSize:16}}>{tab.emoji}</span>
            <span style={{fontSize:8,fontWeight:active?800:400,color:active?"#4ade80":"rgba(255,255,255,0.28)"}}>{tab.label}</span>
            {active&&<div style={{position:"absolute",bottom:-7,width:16,height:2,background:"linear-gradient(90deg,#4ade80,#34d399)",borderRadius:2}}/>}
          </button>
        );})}
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [phase,setPhase]=useState("loading"); // loading | login | game | admin
  const [session,setSession]=useState(null);
  const [customImgs,setCustomImgs]=useState({});
  const [gameItems,setGameItems]=useState(null);  // {username, displayName, role, gameState}
  const [loginError,setLoginError]=useState("");
  const [loginLoading,setLoginLoading]=useState(false);
  const [dialogs,setDialogs]=useState(DEFAULT_DIALOGS);

  useEffect(()=>{
    seedAccounts().then(async()=>{
      // Load custom images
      try {
        const imgKeys = await store.list("img:");
        const imgs = {};
        for (const k of imgKeys) {
          const val = await store.get(k);
          if (val) imgs[k.replace("img:","")] = val;
        }
        if (Object.keys(imgs).length > 0) setCustomImgs(imgs);
      } catch {}
      // Load custom items
      try {
        const items = await store.get("settings:items");
        if (items) {
          setGameItems(items);
          if (items.strains) STRAINS = items.strains;
          if (items.upgrades) UPGRADES = items.upgrades;
          if (items.beach) BEACH_ITEMS = items.beach;
        }
      } catch {}
      store.get("settings:dialogs").then(d=>{if(d)setDialogs(d);});
      setPhase("login");
    });
  },[]);

  const handleLogin=async(username,password)=>{
    setLoginLoading(true);setLoginError("");
    const u=await store.get(`user:${username.trim().toLowerCase()}`);
    if(!u){setLoginError("Unbekannter Benutzername");setLoginLoading(false);return;}
    if(u.password!==password){setLoginError("Falsches Passwort");setLoginLoading(false);return;}
    if(u.locked){setLoginError("Dieses Konto ist gesperrt. Kontaktiere den Admin.");setLoginLoading(false);return;}
    const global=await store.get("settings:global");
    if(global?.maintenanceMode&&u.role!=="admin"){setLoginError("⚠️ Wartungsmodus aktiv – bitte später versuchen.");setLoginLoading(false);return;}
    const d=await store.get("settings:dialogs");if(d)setDialogs(d);
    await addLog(username,"login",`Login von ${username}`);
    u.gameState={...u.gameState,lastSeen:new Date().toISOString()};
    await store.set(`user:${username}`,u);
    setSession({username,displayName:u.displayName,role:u.role,gameState:u.gameState});
    setPhase(u.role==="admin"?"admin":"game");
    setLoginLoading(false);
  };

  const handleLogout=()=>{setSession(null);setPhase("login");setLoginError("");};

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#040c14;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:'Nunito',sans-serif;}
        input,textarea,button{font-family:'Nunito',sans-serif;}
        @keyframes shimmer{0%,100%{opacity:0.4}50%{opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
      `}</style>
      <div style={{width:"100vw",minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%,#1a4a2e,#0d2818 40%,#040c14)",display:"flex",justifyContent:"center",alignItems:"center",padding:16}}>
        <div style={{width:375,minHeight:720,maxHeight:"95vh",borderRadius:44,boxShadow:"0 0 0 2px #ffffff12,0 30px 80px rgba(0,0,0,0.9)",overflow:"hidden",display:"flex",flexDirection:"column",position:"relative"}}>
          {phase==="loading"&&(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:"#040c14"}}>
              <div style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>Lädt...</div>
            </div>
          )}
          {phase==="login"&&<LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading}/>}
          {phase==="admin"&&session&&<AdminPanel onLogout={handleLogout} customImgs={customImgs} setCustomImgs={setCustomImgs} setGameItems={setGameItems}/>}
          {phase==="game"&&session&&<Game username={session.username} displayName={session.displayName} initialState={session.gameState||EMPTY_GAME_STATE()} dialogs={dialogs} customImgs={customImgs} gameItems={gameItems} onLogout={handleLogout}/>}
        </div>
      </div>
    </>
  );
}

// ─── MAIL MODAL ───────────────────────────────────────────────────────────────
function MailModal({mailbox,username,displayName,compose,setCompose,mailTo,setMailTo,mailSubject,setMailSubject,mailBody,setMailBody,onSend,onClose,onRead,onDelete,mailView,setMailView}){
  const unread=mailbox.filter(m=>!m.read).length;
  const fmtT=iso=>{const d=new Date(iso);return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});};
  return(
    <div style={{position:"absolute",inset:0,zIndex:750,display:"flex",flexDirection:"column"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)"}} onClick={onClose}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(170deg,#0a1628,#111c2b)",borderTop:"1.5px solid rgba(255,255,255,0.1)",borderRadius:"28px 28px 0 0",padding:"18px 16px 36px",maxHeight:"80vh",display:"flex",flexDirection:"column",animation:"slideUp 0.3s ease"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <span style={{fontSize:20}}>✉️</span>
            <div>
              <div style={{color:"#fff",fontWeight:800,fontSize:15}}>Postfach</div>
              <div style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>{unread>0?`${unread} ungelesen`:"Alles gelesen"}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {!compose&&!mailView&&<button onClick={()=>setCompose(true)} style={{background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:10,padding:"6px 14px",color:"#1a2e1a",fontWeight:700,fontSize:12,cursor:"pointer"}}>✏️ Schreiben</button>}
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,width:30,height:30,color:"rgba(255,255,255,0.5)",fontSize:16,cursor:"pointer"}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {/* Compose view */}
          {compose&&(
            <div>
              <button onClick={()=>setCompose(false)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"5px 12px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer",marginBottom:12}}>← Zurück</button>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,fontWeight:700,marginBottom:3}}>AN (Username)</div>
                  <input value={mailTo} onChange={e=>setMailTo(e.target.value)} placeholder="z.B. admin, verde, ghost99..."
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:11,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                </div>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,fontWeight:700,marginBottom:3}}>BETREFF</div>
                  <input value={mailSubject} onChange={e=>setMailSubject(e.target.value)} placeholder="Betreff (optional)"
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:11,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                </div>
                <div>
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,fontWeight:700,marginBottom:3}}>NACHRICHT</div>
                  <textarea value={mailBody} onChange={e=>setMailBody(e.target.value)} placeholder="Deine Nachricht..." rows={5}
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:11,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit",resize:"none",lineHeight:1.55}}/>
                </div>
                <div style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.15)",borderRadius:10,padding:"7px 11px",color:"rgba(255,255,255,0.4)",fontSize:11}}>
                  💡 Schreibe an <strong style={{color:"rgba(255,255,255,0.6)"}}>admin</strong> für Support-Anfragen
                </div>
                <button onClick={onSend} style={{background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:13,padding:"12px",color:"#1a2e1a",fontWeight:800,fontSize:14,cursor:"pointer"}}>
                  ✉️ Senden
                </button>
              </div>
            </div>
          )}
          {/* Message view */}
          {!compose&&mailView&&(
            <div>
              <button onClick={()=>setMailView(null)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"5px 12px",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer",marginBottom:12}}>← Zurück</button>
              <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:"14px"}}>
                <div style={{marginBottom:12}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:15,marginBottom:5}}>{mailView.subject}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <span style={{background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:7,padding:"2px 8px",color:"#4ade80",fontSize:10}}>Von: {mailView.fromName||mailView.from}</span>
                    <span style={{color:"rgba(255,255,255,0.25)",fontSize:10,padding:"2px 0"}}>{fmtT(mailView.time)}</span>
                  </div>
                </div>
                <div style={{color:"rgba(255,255,255,0.75)",fontSize:13,lineHeight:1.65,whiteSpace:"pre-wrap",borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:12}}>{mailView.body}</div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={()=>{setMailTo(mailView.from);setMailSubject(`Re: ${mailView.subject}`);setMailView(null);setCompose(true);}} style={{flex:1,background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:11,padding:"9px",color:"#4ade80",fontWeight:700,fontSize:12,cursor:"pointer"}}>↩️ Antworten</button>
                <button onClick={()=>onDelete(mailView.id)} style={{flex:1,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:11,padding:"9px",color:"rgba(239,68,68,0.7)",fontWeight:700,fontSize:12,cursor:"pointer"}}>🗑️ Löschen</button>
              </div>
            </div>
          )}
          {/* Inbox */}
          {!compose&&!mailView&&(
            <div>
              {mailbox.length===0&&(
                <div style={{textAlign:"center",padding:"30px 0",color:"rgba(255,255,255,0.2)"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📭</div>
                  <div style={{fontSize:13}}>Postfach leer</div>
                  <div style={{fontSize:11,marginTop:4,color:"rgba(255,255,255,0.13)"}}>Schreibe jemanden an oder warte auf Post</div>
                </div>
              )}
              {mailbox.map(msg=>(
                <div key={msg.id} onClick={()=>onRead(msg)} style={{background:msg.read?"rgba(255,255,255,0.03)":"rgba(74,222,128,0.06)",border:`1px solid ${msg.read?"rgba(255,255,255,0.07)":"rgba(74,222,128,0.2)"}`,borderRadius:13,padding:"10px 13px",marginBottom:8,cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:msg.read?"rgba(255,255,255,0.1)":"#4ade80",flexShrink:0,marginTop:4}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{color:msg.read?"rgba(255,255,255,0.5)":"#fff",fontWeight:msg.read?400:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{msg.subject}</span>
                      <span style={{color:"rgba(255,255,255,0.2)",fontSize:9,flexShrink:0,marginLeft:6}}>{fmtT(msg.time)}</span>
                    </div>
                    <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>von {msg.fromName||msg.from}</div>
                    <div style={{color:"rgba(255,255,255,0.25)",fontSize:10,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{msg.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
