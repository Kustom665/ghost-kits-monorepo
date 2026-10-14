import { useState, useEffect } from "react";

const BEATS = [
  { id: 0, name: "BRAND_REVEAL", duration: 2500 },
  { id: 1, name: "LIVE_PAD_BEAT", duration: 4000 },
  { id: 2, name: "PLUG_INTO_LOGIC", duration: 3000 },
  { id: 3, name: "PACK_REVEAL", duration: 3500 },
  { id: 4, name: "LOGO_LOCKUP", duration: 3000 },
];

const PAD_LABELS = ["Grave Kick","Bone Snap","Phantom","Whisper","Air Leak","Body Drop","Haunt FX","Casket","Dead Air"];
const PAD_SEQ = [0, 4, 1, 6, 0, 2, 4, 7];

export default function GhostPromo() {
  const [beat, setBeat] = useState(0);
  const [glitch, setGlitch] = useState(false);
  const [activePad, setActivePad] = useState(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t1 = setTimeout(() => {
      setGlitch(true);
      const t2 = setTimeout(() => {
        setGlitch(false);
        setBeat(p => (p + 1) % BEATS.length);
      }, 250);
      return () => clearTimeout(t2);
    }, BEATS[beat].duration);
    return () => clearTimeout(t1);
  }, [beat, paused]);

  useEffect(() => {
    if (beat !== 1) { setActivePad(null); return; }
    let step = 0;
    let padTimeout;
    const iv = setInterval(() => {
      setActivePad(PAD_SEQ[step]);
      step = (step + 1) % PAD_SEQ.length;
      clearTimeout(padTimeout);
      padTimeout = setTimeout(() => setActivePad(null), 150);
    }, 500);
    return () => {
      clearInterval(iv);
      clearTimeout(padTimeout);
    };
  }, [beat]);

  const cyan = "#00f2fe";

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"1rem 0"}}>
      <div
        onClick={() => setPaused(p => !p)}
        style={{
          position:"relative",width:360,height:640,background:"#08090a",overflow:"hidden",
          color:"#fff",fontFamily:"'Courier New',monospace",userSelect:"none",display:"flex",
          flexDirection:"column",justifyContent:"space-between",padding:24,
          border:"1px solid #1a1d20",borderRadius:4,
          transform: glitch ? "scale(0.99)" : "scale(1)",transition:"transform 75ms",cursor:"pointer",
        }}
      >
        <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at center,rgba(0,242,254,0.09) 0%,transparent 70%)`,pointerEvents:"none",zIndex:0}} />
        <div style={{position:"absolute",inset:0,opacity:0.04,backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='1' height='1' fill='%23fff'/%3E%3C/svg%3E\")",backgroundRepeat:"repeat",pointerEvents:"none",zIndex:40}} />

        {glitch && (
          <div style={{position:"absolute",inset:0,background:"rgba(0,242,254,0.1)",mixBlendMode:"exclusion",zIndex:50,pointerEvents:"none"}}>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent,rgba(255,0,0,0.2),transparent)",transform:"translateX(2px)"}} />
            <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent,rgba(0,242,254,0.2),transparent)",transform:"translateX(-2px)"}} />
            <div style={{position:"absolute",inset:0,background:"rgba(24,24,27,0.4)",backdropFilter:"blur(1px)"}} />
          </div>
        )}

        <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",zIndex:10}}>
          {beat === 0 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:12}}>
              <p style={{fontSize:9,textTransform:"uppercase",letterSpacing:"0.4em",color:"#71717a",fontWeight:700}}>KUSTOM CASKETS PRESENTS</p>
              <h1 style={{fontSize:48,fontWeight:900,textTransform:"uppercase",fontFamily:"Arial Black,sans-serif",letterSpacing:"-0.04em",background:"linear-gradient(to bottom,#fff,#a1a1aa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",filter:`drop-shadow(0 0 20px rgba(0,242,254,0.35))`}}>
                GHOST KIT
              </h1>
              <div style={{height:2,width:48,background:cyan,boxShadow:`0 0 10px ${cyan}`}} />
            </div>
          )}

          {beat === 1 && (
            <div style={{width:"100%",padding:"0 4px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,padding:"0 4px"}}>
                <span style={{fontSize:9,letterSpacing:"0.15em",color:cyan,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{height:6,width:6,borderRadius:"50%",background:cyan,display:"inline-block"}} />
                  LIVE PERFORMANCE
                </span>
                <span style={{fontSize:9,color:"#52525b",letterSpacing:"0.1em"}}>BPM: 140</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {PAD_LABELS.map((label, i) => {
                  const active = activePad === i;
                  return (
                    <div key={i} style={{
                      height:80,border:`1px solid ${active ? cyan : "#27272a"}`,borderRadius:4,
                      display:"flex",flexDirection:"column",justifyContent:"space-between",padding:8,
                      background: active ? cyan : "#0d0f12",color: active ? "#000" : "#a1a1aa",
                      boxShadow: active ? `0 0 25px rgba(0,242,254,0.55)` : "none",
                      transform: active ? "scale(0.96)" : "scale(1)",transition:"all 75ms",
                    }}>
                      <span style={{fontSize:8,opacity:0.5,fontWeight:700}}>0{i+1}</span>
                      <span style={{fontSize:10,fontWeight:700,letterSpacing:"-0.02em",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {beat === 2 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:24,padding:"0 8px"}}>
              <div style={{position:"relative",border:`1px dashed rgba(0,242,254,0.3)`,borderRadius:12,padding:20,width:"100%",background:"#0c0e11",boxShadow:"inset 0 0 20px rgba(0,242,254,0.03)"}}>
                <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"#08090a",padding:"0 12px",fontSize:9,color:cyan,letterSpacing:"0.2em",textTransform:"uppercase",fontWeight:700}}>Connectivity</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"Arial,sans-serif",fontSize:12,fontWeight:700,letterSpacing:"-0.02em",margin:"12px 4px"}}>
                  <span style={{color:"#a1a1aa",textTransform:"uppercase"}}>WEB CONTROLLER</span>
                  <span style={{color:cyan,fontSize:16}}>➔</span>
                  <span style={{color:"#fff",textTransform:"uppercase",letterSpacing:"0.05em"}}>LOGIC PRO X</span>
                </div>
                <div style={{fontSize:10,color:"#a1a1aa",lineHeight:1.7,fontFamily:"monospace",textAlign:"left",background:"rgba(0,0,0,0.5)",padding:12,borderRadius:4,border:"1px solid rgba(39,39,42,0.6)"}}>
                  <p style={{color:cyan,fontWeight:700}}>✓ IAC BUS CONNECTED</p>
                  <p>✓ WEB MIDI PROTOCOL ACTIVE</p>
                  <p>✓ ZERO LATENCY ENGINE</p>
                </div>
              </div>
              <h2 style={{fontSize:20,textTransform:"uppercase",fontWeight:700,letterSpacing:"-0.02em",color:"#e4e4e7",lineHeight:1.3}}>
                Zero Installs.<br />
                <span style={{background:`linear-gradient(to right,${cyan},#67e8f9)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Direct DAW Routing.</span>
              </h2>
            </div>
          )}

          {beat === 3 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24}}>
              <div style={{position:"relative",width:176,height:176,background:"linear-gradient(135deg,#12151a,#0a0c0e)",border:"2px solid #27272a",borderRadius:8,display:"flex",flexDirection:"column",justifyContent:"space-between",padding:16,transform:"rotate(2deg)",boxShadow:"0 25px 50px rgba(0,0,0,0.8)"}}>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to top right,rgba(0,242,254,0.05),transparent)",pointerEvents:"none",borderRadius:8}} />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <span style={{fontSize:8,border:"1px solid #3f3f46",padding:"1px 4px",color:"#52525b",fontWeight:700}}>VOL. 1</span>
                  <span style={{fontSize:8,color:cyan,fontWeight:700,letterSpacing:"0.15em"}}>24-BIT WAV</span>
                </div>
                <div>
                  <h3 style={{fontSize:30,fontWeight:900,fontFamily:"Arial Black,sans-serif",lineHeight:1,letterSpacing:"-0.04em",color:"#e4e4e7"}}>DEAD AIR</h3>
                  <p style={{fontSize:9,letterSpacing:"0.2em",color:cyan,textTransform:"uppercase",fontWeight:700,marginTop:2}}>DRUM KIT</p>
                </div>
                <div style={{fontSize:8,color:"#3f3f46",borderTop:"1px solid rgba(39,39,42,0.8)",paddingTop:8,fontFamily:"monospace",letterSpacing:"0.1em"}}>KUSTOM CASKETS AUDIO LABS</div>
              </div>
              <div style={{textAlign:"center",display:"flex",flexDirection:"column",gap:4}}>
                <h2 style={{fontSize:18,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",color:"#e4e4e7"}}>GHOST KITS VOL. 1</h2>
                <p style={{fontSize:11,color:"#71717a",fontWeight:500}}>16 Premium Dark-Trap Elements</p>
              </div>
            </div>
          )}

          {beat === 4 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:32}}>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <h1 style={{fontSize:38,fontWeight:900,textTransform:"uppercase",fontFamily:"Arial Black,sans-serif",letterSpacing:"-0.04em",background:"linear-gradient(to bottom,#fff,#d4d4d8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",filter:"drop-shadow(0 0 15px rgba(0,242,254,0.25))"}}>
                  TRIGGER LAB
                </h1>
                <p style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.3em",color:"#52525b",fontWeight:700}}>BY KUSTOM CASKETS</p>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
                <div style={{border:`1px solid rgba(0,242,254,0.25)`,borderRadius:4,padding:"12px 16px",background:"rgba(0,242,254,0.04)"}}>
                  <p style={{fontSize:11,color:"#a1a1aa",letterSpacing:"0.05em"}}>DRUM KITS · SAMPLE PACKS · WEB MIDI</p>
                </div>
                <div style={{background:cyan,color:"#000",padding:"14px 24px",borderRadius:4,fontSize:12,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.15em",fontFamily:"Arial Black,sans-serif"}}>
                  GET THE KIT →
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:6,justifyContent:"center",zIndex:10,paddingTop:12}}>
          {BEATS.map((b, i) => (
            <div key={b.id} onClick={e => { e.stopPropagation(); setBeat(i); setGlitch(false); }}
              style={{height:2,width: i === beat ? 24 : 8,background: i === beat ? cyan : "#27272a",borderRadius:1,transition:"all 300ms",cursor:"pointer",boxShadow: i === beat ? `0 0 6px ${cyan}` : "none"}} />
          ))}
        </div>
      </div>
      <p style={{fontSize:12,color:"#71717a"}}>Click to pause · dots to jump</p>
    </div>
  );
}
