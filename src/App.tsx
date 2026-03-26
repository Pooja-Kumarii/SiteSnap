/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Copy, Check, History, ExternalLink, Trash2, Loader2, ArrowRight,
  CheckCircle, XCircle, AlertTriangle, LogOut, Moon, Sun,
  Home, Zap, Bug, Send, Inbox,
} from 'lucide-react';
import { ClerkProvider, SignIn, SignUp, useAuth, useUser, useClerk } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
type NavPage = 'home' | 'deploy' | 'bug';
interface Site  { id: string; name: string; created_at: string; url: string; }
interface Toast { id: string; type: 'success'|'error'|'warning'; title: string; message: string; }

const DARK = {
  bg:'#0a0a0a',bg2:'#111111',bg3:'#1a1a1a',
  border:'#222222',border2:'#2a2a2a',
  text:'#f1f5f9',text2:'#ffffff',textMuted:'#94a3b8',textDim:'#475569',
  accent:'#0ea5e9',accentHover:'#0284c7',accentText:'#38bdf8',
  success:'#22c55e',successBg:'#052e16',successBorder:'#166534',
  error:'#ef4444',errorBg:'#1c0606',errorBorder:'#7f1d1d',
  warning:'#f59e0b',warningBg:'#1c1206',warningBorder:'#78350f',
  cardBg:'#111111',cardHover:'#161616',
  navBg:'rgba(10,10,10,0.92)',panelBg:'#111111',inputBg:'#0d0d0d',
  uploadBg:'#0d0d0d',uploadBorder:'#2a2a2a',
  depCard:'#0d0d0d',depUrl:'#080808',depUrlBorder:'#1e1e1e',
  depNum:'#0c1a2e',depNumBorder:'#0d3a5e',depNumText:'#38bdf8',
  depCopy:'#1a1a1a',depCopyBorder:'#2a2a2a',depCopyText:'#94a3b8',
  depCopyOk:'#052e16',depCopyOkBorder:'#166534',depCopyOkText:'#22c55e',
  depDel:'#1c0606',depDelBorder:'#7f1d1d',depDelText:'#ef4444',
  delAll:'#1c0606',delAllBorder:'#7f1d1d',delAllText:'#ef4444',
  scrollbar:'#2a2a2a',accentHoverBg:'#0284c7',
  cr:'14,165,233',emptyText:'#2a2a2a',toggleBg:'#1a1a1a',toggleText:'#64748b',
};
const LIGHT = {
  bg:'#f8fafc',bg2:'#f1f5f9',bg3:'#e2e8f0',
  border:'#e2e8f0',border2:'#cbd5e1',
  text:'#0f172a',text2:'#020617',textMuted:'#64748b',textDim:'#94a3b8',
  accent:'#0ea5e9',accentHover:'#0284c7',accentText:'#0284c7',
  success:'#16a34a',successBg:'#f0fdf4',successBorder:'#bbf7d0',
  error:'#dc2626',errorBg:'#fef2f2',errorBorder:'#fecaca',
  warning:'#d97706',warningBg:'#fffbeb',warningBorder:'#fde68a',
  cardBg:'#ffffff',cardHover:'#f8fafc',
  navBg:'rgba(248,250,252,0.92)',panelBg:'#ffffff',inputBg:'#f8fafc',
  uploadBg:'#f8fafc',uploadBorder:'#cbd5e1',
  depCard:'#ffffff',depUrl:'#f8fafc',depUrlBorder:'#e2e8f0',
  depNum:'#eff9ff',depNumBorder:'#bae6fd',depNumText:'#0284c7',
  depCopy:'#f1f5f9',depCopyBorder:'#e2e8f0',depCopyText:'#475569',
  depCopyOk:'#f0fdf4',depCopyOkBorder:'#bbf7d0',depCopyOkText:'#16a34a',
  depDel:'#fef2f2',depDelBorder:'#fecaca',depDelText:'#dc2626',
  delAll:'#fef2f2',delAllBorder:'#fecaca',delAllText:'#dc2626',
  scrollbar:'#e2e8f0',accentHoverBg:'#0284c7',
  cr:'14,165,233',emptyText:'#e2e8f0',toggleBg:'#e2e8f0',toggleText:'#64748b',
};

async function validateWordPressZip(file: File): Promise<{ valid: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target?.result as ArrayBuffer;
        if (!buf) { resolve({ valid: false, reason: 'Could not read file.' }); return; }
        const bytes = new Uint8Array(buf);
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) { resolve({ valid: false, reason: 'Not a valid ZIP file.' }); return; }
        let eocdOffset = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
          if (bytes[i]===0x50&&bytes[i+1]===0x4B&&bytes[i+2]===0x05&&bytes[i+3]===0x06) { eocdOffset = i; break; }
        }
        if (eocdOffset === -1) { resolve({ valid: false, reason: 'Could not read ZIP structure.' }); return; }
        const view = new DataView(buf);
        const cdOffset = view.getUint32(eocdOffset + 16, true);
        const cdSize   = view.getUint32(eocdOffset + 12, true);
        const decoder  = new TextDecoder('utf-8', { fatal: false });
        const fileNames: string[] = [];
        let pos = cdOffset;
        while (pos < cdOffset + cdSize && pos + 46 < bytes.length) {
          if (bytes[pos]!==0x50||bytes[pos+1]!==0x4B||bytes[pos+2]!==0x01||bytes[pos+3]!==0x02) break;
          const fnLen = view.getUint16(pos + 28, true);
          const exLen = view.getUint16(pos + 30, true);
          const cmLen = view.getUint16(pos + 32, true);
          const name  = decoder.decode(bytes.slice(pos + 46, pos + 46 + fnLen)).toLowerCase();
          fileNames.push(name);
          pos += 46 + fnLen + exLen + cmLen;
        }
        if (fileNames.length === 0) { resolve({ valid: false, reason: 'ZIP appears to be empty.' }); return; }
        const hasIndex      = fileNames.some(n => n === 'index.html' || n.endsWith('/index.html'));
        const hasWpContent  = fileNames.some(n => n.startsWith('wp-content/'));
        const hasWpIncludes = fileNames.some(n => n.startsWith('wp-includes/'));
        if (!hasIndex && !hasWpContent && !hasWpIncludes) { resolve({ valid: false, reason: 'No WordPress content found. Export using Simply Static plugin.' }); return; }
        resolve({ valid: true });
      } catch { resolve({ valid: false, reason: 'Could not read ZIP contents.' }); }
    };
    reader.onerror = () => resolve({ valid: false, reason: 'Failed to read file.' });
    reader.readAsArrayBuffer(file);
  });
}

function ConstellationCanvas({ isDark }: { isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDarkRef = useRef(isDark);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let W=0,H=0,animId=0;
    const mouse={x:-9999,y:-9999};
    let pts:any[]=[];
    const resize=()=>{W=canvas.width=window.innerWidth;H=canvas.height=window.innerHeight;};
    const init=()=>{pts=Array.from({length:60},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.3,r:Math.random()*1.2+0.5,base:Math.random()*0.3+0.1,a:0}));};
    const dist=(ax:number,ay:number,bx:number,by:number)=>Math.sqrt((ax-bx)**2+(ay-by)**2);
    const draw=()=>{
      const cr=isDarkRef.current?DARK.cr:LIGHT.cr;
      ctx.clearRect(0,0,W,H);
      for(const p of pts){p.x+=p.vx;p.y+=p.vy;if(p.x<-10)p.x=W+10;if(p.x>W+10)p.x=-10;if(p.y<-10)p.y=H+10;if(p.y>H+10)p.y=-10;const dx=p.x-mouse.x,dy=p.y-mouse.y,dd=Math.sqrt(dx*dx+dy*dy);if(dd<80&&dd>0){const f=(80-dd)/80;p.x+=dx/dd*f;p.y+=dy/dd*f;}p.a+=(p.base-p.a)*0.05;}
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const dd=dist(pts[i].x,pts[i].y,pts[j].x,pts[j].y);if(dd<120){const op=(1-dd/120)*0.12;const near=dist(pts[i].x,pts[i].y,mouse.x,mouse.y)<150||dist(pts[j].x,pts[j].y,mouse.x,mouse.y)<150;ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.strokeStyle=`rgba(${cr},${near?op*5:op})`;ctx.lineWidth=near?0.8:0.4;ctx.stroke();}}
      for(const p of pts){const near=dist(p.x,p.y,mouse.x,mouse.y)<150;ctx.beginPath();ctx.arc(p.x,p.y,near?p.r*2:p.r,0,Math.PI*2);ctx.fillStyle=`rgba(${cr},${near?Math.min(p.a*4,0.8):p.a})`;ctx.fill();}
      animId=requestAnimationFrame(draw);
    };
    const onMove=(e:MouseEvent)=>{mouse.x=e.clientX;mouse.y=e.clientY;};
    const onLeave=()=>{mouse.x=-9999;mouse.y=-9999;};
    window.addEventListener('mousemove',onMove);window.addEventListener('mouseleave',onLeave);
    window.addEventListener('resize',()=>{resize();init();});
    resize();init();draw();
    return()=>{cancelAnimationFrame(animId);window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseleave',onLeave);};
  },[]);
  return <canvas ref={canvasRef} style={{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0}}/>;
}

function ToastContainer({toasts,onRemove,isDark}:{toasts:Toast[];onRemove:(id:string)=>void;isDark:boolean}){
  const t=isDark?DARK:LIGHT;
  return(
    <div style={{position:'fixed',bottom:'1.5rem',right:'1.5rem',zIndex:9999,display:'flex',flexDirection:'column',gap:'0.6rem',maxWidth:'340px',width:'100%'}}>
      <AnimatePresence mode="popLayout">
        {toasts.map(toast=>{
          const cfg={success:{bg:t.successBg,border:t.successBorder,text:t.success,icon:<CheckCircle size={15}/>},error:{bg:t.errorBg,border:t.errorBorder,text:t.error,icon:<XCircle size={15}/>},warning:{bg:t.warningBg,border:t.warningBorder,text:t.warning,icon:<AlertTriangle size={15}/>}}[toast.type];
          return(
            <motion.div key={toast.id} layout initial={{opacity:0,y:20,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:10,scale:0.95}} transition={{type:'spring',damping:25,stiffness:400}} onClick={()=>onRemove(toast.id)}
              style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderLeft:`3px solid ${cfg.text}`,padding:'0.85rem 1rem',display:'flex',alignItems:'flex-start',gap:'0.65rem',cursor:'pointer',borderRadius:'6px',boxShadow:isDark?'0 8px 32px rgba(0,0,0,0.4)':'0 8px 32px rgba(0,0,0,0.1)'}}>
              <div style={{color:cfg.text,marginTop:1,flexShrink:0}}>{cfg.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:'0.78rem',fontWeight:600,color:cfg.text,marginBottom:'0.2rem'}}>{toast.title}</div>
                <div style={{fontSize:'0.78rem',color:t.textMuted,lineHeight:1.5}}>{toast.message}</div>
              </div>
              <div style={{fontSize:'0.65rem',color:t.textDim,flexShrink:0}}>x</div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function useScrollReveal(threshold=0.15){
  const ref=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVisible(true);obs.disconnect();}},{threshold});obs.observe(el);return()=>obs.disconnect();},[threshold]);
  return{ref,visible};
}
type RevealDir='up'|'down'|'left'|'right';
function Reveal({children,dir='up',delay=0,style}:{children:React.ReactNode;dir?:RevealDir;delay?:number;style?:React.CSSProperties}){
  const{ref,visible}=useScrollReveal();
  const tx:Record<RevealDir,string>={up:'translateY(32px)',down:'translateY(-32px)',left:'translateX(-40px)',right:'translateX(40px)'};
  return<div ref={ref} style={{transform:visible?'none':tx[dir],opacity:visible?1:0,transition:`transform 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}ms,opacity 0.8s ease ${delay}ms`,...style}}>{children}</div>;
}
function HeroReveal({children,delay=0,dir='up',style}:{children:React.ReactNode;delay?:number;dir?:RevealDir;style?:React.CSSProperties}){
  const[vis,setVis]=useState(false);
  useEffect(()=>{const id=setTimeout(()=>setVis(true),delay);return()=>clearTimeout(id);},[delay]);
  const tx:Record<RevealDir,string>={up:'translateY(32px)',down:'translateY(-32px)',left:'translateX(-40px)',right:'translateX(40px)'};
  return<div style={{transform:vis?'none':tx[dir],opacity:vis?1:0,transition:`transform 1s cubic-bezier(0.22,1,0.36,1),opacity 0.9s ease`,...style}}>{children}</div>;
}

function ThemeToggle({isDark,onToggle}:{isDark:boolean;onToggle:()=>void}){
  const t=isDark?DARK:LIGHT;
  return(
    <button onClick={onToggle} style={{display:'flex',alignItems:'center',gap:6,background:t.toggleBg,border:`1px solid ${t.border}`,padding:'0.4rem 0.85rem',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:'0.72rem',color:t.toggleText,borderRadius:'6px',transition:'all 0.2s'}}>
      {isDark?<Sun size={12} color={t.accent}/>:<Moon size={12} color={t.text}/>}
      {isDark?'Light':'Dark'}
    </button>
  );
}

function ChainLogo({size=32,color='#0ea5e9'}:{size?:number;color?:string}){
  const p=color;
  return(
    <svg width={size} height={Math.round(size*0.62)} viewBox="0 0 52 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="10" width="3" height="12" fill={p}/><rect x="3" y="5" width="3" height="5" fill={p}/><rect x="6" y="2" width="7" height="3" fill={p}/><rect x="13" y="5" width="3" height="5" fill={p}/><rect x="3" y="22" width="3" height="5" fill={p}/><rect x="6" y="27" width="7" height="3" fill={p}/><rect x="13" y="22" width="3" height="5" fill={p}/><rect x="16" y="10" width="3" height="4" fill={p}/><rect x="16" y="18" width="3" height="4" fill={p}/><rect x="16" y="14" width="3" height="4" fill={p}/><rect x="19" y="14" width="14" height="4" fill={p}/><rect x="33" y="10" width="3" height="4" fill={p}/><rect x="33" y="18" width="3" height="4" fill={p}/><rect x="33" y="14" width="3" height="4" fill={p}/><rect x="36" y="5" width="3" height="5" fill={p}/><rect x="39" y="2" width="7" height="3" fill={p}/><rect x="46" y="5" width="3" height="5" fill={p}/><rect x="36" y="22" width="3" height="5" fill={p}/><rect x="39" y="27" width="7" height="3" fill={p}/><rect x="46" y="22" width="3" height="5" fill={p}/><rect x="49" y="10" width="3" height="12" fill={p}/>
    </svg>
  );
}

// ── Logout Modal ──────────────────────────────────────────────────────────────
function LogoutModal({isDark,onConfirm,onCancel}:{isDark:boolean;onConfirm:()=>void;onCancel:()=>void}){
  const t=isDark?DARK:LIGHT;
  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}
      onClick={onCancel}>
      <motion.div initial={{opacity:0,scale:0.92,y:16}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.92}} transition={{type:'spring',damping:28,stiffness:380}}
        onClick={e=>e.stopPropagation()}
        style={{background:t.panelBg,border:`1px solid ${t.border}`,borderRadius:'16px',padding:'2rem',maxWidth:360,width:'100%',position:'relative',boxShadow:'0 24px 64px rgba(0,0,0,0.6)'}}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:`linear-gradient(90deg,transparent,${t.error},transparent)`,borderRadius:'16px 16px 0 0'}}/>
        <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
          <div style={{width:52,height:52,borderRadius:'12px',background:t.errorBg,border:`1px solid ${t.errorBorder}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1rem'}}>
            <LogOut size={22} color={t.error}/>
          </div>
          <h2 style={{fontSize:'1.1rem',fontWeight:700,color:t.text2,marginBottom:'0.4rem',fontFamily:"'Inter',sans-serif"}}>Sign out of SiteSnap?</h2>
          <p style={{fontSize:'0.83rem',color:t.textMuted,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>You'll need to sign back in to access your deployments.</p>
        </div>
        <div style={{display:'flex',gap:'0.6rem'}}>
          <button onClick={onCancel} style={{flex:1,background:'transparent',border:`1px solid ${t.border2}`,color:t.textMuted,padding:'0.7rem',fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:'0.85rem',cursor:'pointer',borderRadius:'8px'}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,background:t.error,border:`1px solid ${t.errorBorder}`,color:'#fff',padding:'0.7rem',fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:'0.85rem',cursor:'pointer',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <LogOut size={14}/> Yes, Sign Out
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Shared Nav ────────────────────────────────────────────────────────────────
function AppNav({isDark,onToggleTheme,page,onNav,onLogout}:{isDark:boolean;onToggleTheme:()=>void;page:NavPage;onNav:(p:NavPage)=>void;onLogout:()=>void}){
  const t=isDark?DARK:LIGHT;
  const items:[NavPage,React.ReactNode,string][]=[
    ['home',<Home size={14}/>, 'Home'],
    ['deploy',<Zap size={14}/>, 'Deploy'],
    ['bug',<Bug size={14}/>, 'Report Bug'],
  ];
  return(
    <nav style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.9rem 2.5rem',borderBottom:`1px solid ${t.border}`,background:t.navBg,backdropFilter:'blur(20px)',position:'sticky',top:0,zIndex:100,transition:'background 0.3s'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>onNav('home')}>
        <ChainLogo size={30} color={t.accent}/><span style={{fontSize:'0.95rem',fontWeight:700,color:t.text2,letterSpacing:'-0.03em'}}>SiteSnap</span>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:2,background:t.bg3,borderRadius:'8px',padding:'3px'}}>
        {items.map(([p,icon,label])=>{
          const active=page===p;
          return(
            <motion.button key={p} onClick={()=>onNav(p)} whileHover={{scale:1.02}} whileTap={{scale:0.97}}
              style={{display:'flex',alignItems:'center',gap:6,padding:'0.45rem 1rem',fontFamily:"'Inter',sans-serif",fontWeight:active?600:500,fontSize:'0.8rem',cursor:'pointer',border:'none',background:active?t.accent:'transparent',color:active?'#fff':t.textMuted,borderRadius:'6px',transition:'all 0.2s',position:'relative'}}>
              {icon}{label}
              {p==='bug'&&!active&&(
                <motion.span animate={{scale:[1,1.3,1],opacity:[1,0.6,1]}} transition={{repeat:Infinity,duration:2,ease:'easeInOut'}}
                  style={{width:5,height:5,borderRadius:'50%',background:t.error,display:'inline-block',marginLeft:2}}/>
              )}
            </motion.button>
          );
        })}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme}/>
        <button onClick={onLogout}
          style={{display:'inline-flex',alignItems:'center',gap:5,background:'transparent',color:t.textMuted,border:`1px solid ${t.border}`,padding:'0.4rem 0.9rem',fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:'0.78rem',cursor:'pointer',borderRadius:'6px',transition:'all 0.2s'}}
          onMouseOver={e=>{e.currentTarget.style.borderColor=t.error;e.currentTarget.style.color=t.error;}}
          onMouseOut={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.textMuted;}}>
          <LogOut size={12}/> Logout
        </button>
      </div>
    </nav>
  );
}

// ── Auth Page ─────────────────────────────────────────────────────────────────
function AuthPage({isDark,onToggleTheme}:{isDark:boolean;onToggleTheme:()=>void}){
  const t=isDark?DARK:LIGHT;
  const [mode,setMode]=useState<'signIn'|'signUp'>('signIn');
  const appearance={
    variables:{colorPrimary:'#0ea5e9',colorBackground:t.panelBg,colorText:t.text,colorTextSecondary:t.textMuted,colorInputBackground:t.inputBg,colorInputText:t.text,borderRadius:'8px',fontFamily:"'Inter', sans-serif"},
    elements:{
      card:{background:t.panelBg,border:`1px solid ${t.border}`,boxShadow:isDark?'0 24px 64px rgba(0,0,0,0.5)':'0 24px 64px rgba(0,0,0,0.08)',borderRadius:'16px'},
      headerTitle:{color:t.text2,fontWeight:800},headerSubtitle:{color:t.textMuted},
      formFieldLabel:{color:t.textMuted,fontSize:'0.75rem',fontWeight:500},
      formFieldInput:{background:t.inputBg,border:`1.5px solid ${t.border}`,color:t.text,borderRadius:'8px'},
      footerActionText:{color:t.textMuted},footerActionLink:{color:t.accent,fontWeight:600},
      formButtonPrimary:{background:t.accent,fontFamily:"'Inter',sans-serif",fontWeight:600,borderRadius:'8px',boxShadow:'none'},
      dividerLine:{background:t.border},dividerText:{color:t.textDim},
    },
  };
  return(
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',flexDirection:'column',fontFamily:"'Inter',sans-serif",transition:'background 0.3s'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');*{box-sizing:border-box;}`}</style>
      <ConstellationCanvas isDark={isDark}/>
      <nav style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'1.2rem 3rem',borderBottom:`1px solid ${t.border}`,background:t.navBg,backdropFilter:'blur(20px)',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}><ChainLogo size={32} color={t.accent}/><span style={{fontSize:'1rem',fontWeight:700,color:t.text2,letterSpacing:'-0.03em'}}>SiteSnap</span></div>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme}/>
      </nav>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'3rem 1.5rem',position:'relative',zIndex:1}}>
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5}} style={{width:'100%',maxWidth:480}}>
          <div style={{display:'flex',background:t.bg3,borderRadius:'10px',padding:'3px',marginBottom:'1.5rem'}}>
            {(['signIn','signUp'] as const).map((m,i)=>(
              <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'0.55rem',fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:'0.82rem',cursor:'pointer',border:'none',background:mode===m?t.accent:'transparent',color:mode===m?'#fff':t.textMuted,borderRadius:'7px',transition:'all 0.2s'}}>
                {i===0?'Sign In':'Sign Up'}
              </button>
            ))}
          </div>
          {mode==='signIn'?<SignIn appearance={appearance} routing="hash" afterSignInUrl="/"/>:<SignUp appearance={appearance} routing="hash" afterSignUpUrl="/"/>}
          <p style={{textAlign:'center',marginTop:'1rem',fontSize:'0.68rem',color:t.textDim}}>Secured by Clerk · Email verified · Data never sold</p>
        </motion.div>
      </div>
    </div>
  );
}

// ── Bug Report Page ───────────────────────────────────────────────────────────
function BugReportPage({isDark}:{isDark:boolean}){
  const t=isDark?DARK:LIGHT;
  const { user } = useUser();
  const [email,setEmail]=useState(user?.primaryEmailAddress?.emailAddress||'');
  const [details,setDetails]=useState('');
  const [sending,setSending]=useState(false);
  const [sent,setSent]=useState(false);
  const [error,setError]=useState('');
  const [focused,setFocused]=useState<string|null>(null);

  const handleSubmit=async()=>{
    setError('');
    if(!email.trim()||!email.includes('@')){setError('Please enter a valid email address.');return;}
    if(details.trim().length<20){setError('Please describe the bug in at least 20 characters.');return;}
    setSending(true);
    try{
      const res=await fetch('/api/bug-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),details:details.trim()})});
      if(!res.ok)throw new Error('Failed to send report.');
      setSent(true);setDetails('');
    }catch(e:any){setError(e.message||'Something went wrong. Please try again.');}
    setSending(false);
  };

  const inputBase:React.CSSProperties={width:'100%',background:t.inputBg,border:`1.5px solid ${t.border}`,padding:'0.75rem 1rem',fontFamily:"'Inter',sans-serif",fontSize:'0.88rem',color:t.text,outline:'none',borderRadius:'8px',transition:'border-color 0.2s',boxSizing:'border-box'};

  return(
    <div style={{maxWidth:600,margin:'0 auto',padding:'3rem 2rem',position:'relative',zIndex:1}}>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.4}}>
        <div style={{marginBottom:'2rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'0.8rem'}}>
            <motion.div animate={{rotate:[0,-8,8,-8,0]}} transition={{repeat:Infinity,duration:3,ease:'easeInOut'}}
              style={{width:42,height:42,borderRadius:'10px',background:isDark?'rgba(239,68,68,0.12)':'rgba(239,68,68,0.08)',border:`1px solid ${t.errorBorder}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Bug size={18} color={t.error}/>
            </motion.div>
            <div>
              <h1 style={{fontSize:'1.4rem',fontWeight:800,color:t.text2,letterSpacing:'-0.04em',margin:0}}>Report a Bug</h1>
              <p style={{fontSize:'0.78rem',color:t.textMuted,margin:0}}>Help us make SiteSnap better</p>
            </div>
          </div>
          <div style={{height:'1px',background:`linear-gradient(90deg,${t.error}50,transparent)`}}/>
        </div>

        <AnimatePresence>
          {sent&&(
            <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
              style={{background:t.successBg,border:`1px solid ${t.successBorder}`,borderRadius:'12px',padding:'2rem',marginBottom:'1.5rem',textAlign:'center'}}>
              <motion.div animate={{scale:[1,1.2,1]}} transition={{duration:0.5}} style={{display:'flex',justifyContent:'center',marginBottom:'0.8rem'}}>
                <CheckCircle size={36} color={t.success}/>
              </motion.div>
              <p style={{fontSize:'1rem',fontWeight:600,color:t.success,margin:'0 0 0.3rem'}}>Bug report sent!</p>
              <p style={{fontSize:'0.82rem',color:t.textMuted,margin:'0 0 1rem'}}>We'll look into this and get back to you if needed.</p>
              <button onClick={()=>setSent(false)} style={{background:'transparent',border:`1px solid ${t.successBorder}`,color:t.success,padding:'0.4rem 1.2rem',borderRadius:'6px',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:'0.8rem',fontWeight:500}}>Report another bug</button>
            </motion.div>
          )}
        </AnimatePresence>

        {!sent&&(
          <div style={{background:t.panelBg,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'2rem',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:`linear-gradient(90deg,transparent,${t.error},transparent)`}}/>
            <AnimatePresence>
              {error&&(
                <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                  style={{background:t.errorBg,border:`1px solid ${t.errorBorder}`,color:t.error,padding:'0.7rem 1rem',fontSize:'0.82rem',marginBottom:'1.2rem',display:'flex',alignItems:'center',gap:8,borderRadius:'8px'}}>
                  <XCircle size={14} style={{flexShrink:0}}/>{error}
                </motion.div>
              )}
            </AnimatePresence>
            <div style={{marginBottom:'1.2rem'}}>
              <label style={{display:'block',fontSize:'0.75rem',color:t.textMuted,marginBottom:'0.4rem',fontWeight:500}}>Your email address</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onFocus={()=>setFocused('email')} onBlur={()=>setFocused(null)}
                placeholder="you@example.com — we'll reply here if needed"
                style={{...inputBase,borderColor:focused==='email'?t.accent:t.border}}/>
            </div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{display:'block',fontSize:'0.75rem',color:t.textMuted,marginBottom:'0.4rem',fontWeight:500}}>Describe the bug in detail</label>
              <textarea value={details} onChange={e=>setDetails(e.target.value)} onFocus={()=>setFocused('details')} onBlur={()=>setFocused(null)}
                placeholder="What happened? What were you trying to do? What did you expect to happen? Include any error messages you saw on screen..."
                rows={6}
                style={{...inputBase,borderColor:focused==='details'?t.accent:t.border,resize:'vertical',minHeight:140,lineHeight:1.7}}/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.35rem'}}>
                <span style={{fontSize:'0.68rem',color:t.textDim}}>Be as specific as possible</span>
                <span style={{fontSize:'0.68rem',color:details.length<20?t.error:t.success}}>{details.length} chars{details.length<20?` · need ${20-details.length} more`:' · good to go'}</span>
              </div>
            </div>
            <motion.button onClick={handleSubmit} disabled={sending} whileHover={!sending?{scale:1.01}:{}} whileTap={!sending?{scale:0.98}:{}}
              style={{width:'100%',background:t.accent,color:'#fff',border:'none',padding:'0.85rem',fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:'0.88rem',cursor:sending?'not-allowed':'pointer',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:sending?0.7:1,transition:'background 0.2s'}}>
              {sending?<Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/>:<Send size={16}/>}
              {sending?'Sending report...':'Send Bug Report'}
            </motion.button>
            <p style={{textAlign:'center',marginTop:'0.8rem',fontSize:'0.7rem',color:t.textDim}}>Sent directly to the SiteSnap team · We read every report</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Home content ──────────────────────────────────────────────────────────────
function HomeContent({isDark,onDeploy}:{isDark:boolean;onDeploy:()=>void}){
  const t=isDark?DARK:LIGHT;
  const features=[
    {icon:<Zap size={20} color={t.accent}/>,title:'Instant Deploy',desc:'Drop your ZIP and go. No config, no CLI, no waiting.'},
    {icon:<ExternalLink size={20} color={t.accent}/>,title:'Permanent Links',desc:'Every deploy gets a URL that never expires or breaks.'},
    {icon:<History size={20} color={t.accent}/>,title:'Deploy History',desc:'All your deployments tracked in one clean dashboard.'},
    {icon:<CheckCircle size={20} color={t.accent}/>,title:'Secure by Default',desc:'Powered by Clerk. Encrypted, verified, trusted.'},
  ];
  return(
    <div style={{overflowX:'hidden'}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}`}</style>
      <section style={{minHeight:'82vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:'5rem 2rem 4rem',position:'relative',zIndex:1}}>
        <HeroReveal delay={0} dir="down">
          <div style={{display:'inline-flex',alignItems:'center',gap:8,background:isDark?'rgba(14,165,233,0.1)':'rgba(14,165,233,0.08)',border:`1px solid rgba(14,165,233,0.3)`,padding:'0.4rem 1rem',borderRadius:'100px',fontSize:'0.72rem',color:t.accentText,marginBottom:'2rem',letterSpacing:'0.04em',fontWeight:500}}>
            <motion.span animate={{scale:[1,1.4,1],opacity:[1,0.5,1]}} transition={{repeat:Infinity,duration:2}} style={{width:6,height:6,borderRadius:'50%',background:t.accent,display:'inline-block'}}/>
            No GitHub. No hosting. No drama.
          </div>
        </HeroReveal>
        <HeroReveal delay={100} dir="up">
          <h1 style={{fontSize:'clamp(2.8rem,7vw,5.5rem)',fontWeight:800,lineHeight:1.0,letterSpacing:'-0.05em',marginBottom:'1.5rem',maxWidth:800,color:t.text2}}>
            Your WordPress site,<br/><span style={{color:t.accent}}>live in seconds.</span>
          </h1>
        </HeroReveal>
        <HeroReveal delay={200} dir="up">
          <p style={{fontSize:'1.1rem',color:t.textMuted,maxWidth:480,lineHeight:1.8,marginBottom:'2.5rem'}}>Upload your WordPress ZIP and get a permanent shareable link — without touching a server.</p>
        </HeroReveal>
        <HeroReveal delay={320} dir="up">
          <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
            <motion.button onClick={onDeploy} whileHover={{scale:1.03,y:-2}} whileTap={{scale:0.97}}
              style={{background:t.accent,color:'#fff',border:'none',padding:'0.85rem 2rem',fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:'0.95rem',cursor:'pointer',borderRadius:'8px',display:'inline-flex',alignItems:'center',gap:8,boxShadow:`0 4px 24px rgba(14,165,233,0.3)`}}>
              <Upload size={16}/> Upload Your ZIP <ArrowRight size={16}/>
            </motion.button>
            <motion.button onClick={()=>document.getElementById('hp-how')?.scrollIntoView({behavior:'smooth'})} whileHover={{scale:1.02}} whileTap={{scale:0.97}}
              style={{background:'transparent',color:t.textMuted,border:`1px solid ${t.border2}`,padding:'0.85rem 2rem',fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:'0.95rem',cursor:'pointer',borderRadius:'8px'}}>
              See how it works
            </motion.button>
          </div>
        </HeroReveal>
        <HeroReveal delay={440} dir="up">
          <div style={{display:'flex',gap:'3rem',marginTop:'4rem',paddingTop:'3rem',borderTop:`1px solid ${t.border}`}}>
            {[['ZIP','One file to deploy'],['Permanent','Shareable links'],['Zero','Setup required']].map(([n,l])=>(
              <div key={l} style={{textAlign:'center'}}>
                <div style={{fontSize:'1.6rem',fontWeight:800,color:t.accent,letterSpacing:'-0.04em'}}>{n}</div>
                <div style={{fontSize:'0.75rem',color:t.textMuted,marginTop:4,fontWeight:500}}>{l}</div>
              </div>
            ))}
          </div>
        </HeroReveal>
      </section>
      <section style={{padding:'6rem 3rem',position:'relative',zIndex:1,borderTop:`1px solid ${t.border}`}}>
        <Reveal dir="up"><div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{fontSize:'0.72rem',color:t.accentText,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'0.6rem',fontWeight:600}}>Features</div>
          <h2 style={{fontSize:'clamp(1.8rem,4vw,2.8rem)',fontWeight:700,letterSpacing:'-0.04em',marginBottom:'3rem',color:t.text2}}>Everything you need. Nothing you don't.</h2>
        </div></Reveal>
        <div style={{maxWidth:1100,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:'1px',background:t.border,border:`1px solid ${t.border}`,borderRadius:'12px',overflow:'hidden'}}>
          {features.map((f,i)=>(
            <Reveal key={f.title} dir="up" delay={i*60}>
              <motion.div whileHover={{background:t.cardHover}} style={{background:t.cardBg,padding:'2rem 1.8rem',display:'flex',flexDirection:'column',gap:'0.8rem',height:'100%',transition:'background 0.2s'}}>
                <motion.div whileHover={{scale:1.15,rotate:5}} transition={{type:'spring',stiffness:300}}>{f.icon}</motion.div>
                <div style={{fontSize:'0.95rem',fontWeight:600,color:t.text2}}>{f.title}</div>
                <div style={{fontSize:'0.85rem',color:t.textMuted,lineHeight:1.6}}>{f.desc}</div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>
      <section id="hp-how" style={{padding:'6rem 3rem',borderTop:`1px solid ${t.border}`,position:'relative',zIndex:1}}>
        <div style={{maxWidth:700,margin:'0 auto'}}>
          <Reveal dir="up">
            <div style={{fontSize:'0.72rem',color:t.accentText,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'0.6rem',fontWeight:600}}>How it works</div>
            <h2 style={{fontSize:'clamp(1.8rem,4vw,2.8rem)',fontWeight:700,letterSpacing:'-0.04em',marginBottom:'3rem',color:t.text2}}>Three steps. That's it.</h2>
          </Reveal>
          {[{n:'01',title:'Export from WordPress',desc:'Use the Simply Static plugin to export your site as a ZIP file.'},{n:'02',title:'Upload to SiteSnap',desc:'Drop your ZIP. It goes directly to secure cloud storage.'},{n:'03',title:'Share your link',desc:'Get a permanent URL instantly. Share it with anyone, anytime.'}].map((s,idx,arr)=>(
            <Reveal key={s.n} dir="left" delay={idx*100}>
              <div style={{display:'flex',gap:'1.5rem',padding:'2rem 0',borderBottom:idx<arr.length-1?`1px solid ${t.border}`:'none'}}>
                <div style={{fontSize:'0.7rem',color:t.accent,minWidth:32,paddingTop:3,fontWeight:700,fontFamily:'monospace'}}>{s.n}</div>
                <div><div style={{fontSize:'1rem',fontWeight:600,marginBottom:'0.4rem',color:t.text2}}>{s.title}</div><div style={{fontSize:'0.88rem',color:t.textMuted,lineHeight:1.6}}>{s.desc}</div></div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      <section style={{padding:'7rem 3rem',textAlign:'center',position:'relative',zIndex:1,borderTop:`1px solid ${t.border}`}}>
        <Reveal dir="up">
          <div style={{maxWidth:560,margin:'0 auto',background:isDark?'rgba(14,165,233,0.05)':'rgba(14,165,233,0.04)',border:`1px solid rgba(14,165,233,0.2)`,borderRadius:'16px',padding:'4rem 3rem'}}>
            <h2 style={{fontSize:'clamp(1.8rem,4vw,2.5rem)',fontWeight:700,letterSpacing:'-0.04em',marginBottom:'1rem',color:t.text2}}>Ready to ship your first site?</h2>
            <p style={{color:t.textMuted,fontSize:'0.95rem',marginBottom:'2rem',lineHeight:1.7}}>Free account. No credit card. Just your ZIP and 30 seconds.</p>
            <motion.button onClick={onDeploy} whileHover={{scale:1.04,y:-2}} whileTap={{scale:0.97}}
              style={{background:t.accent,color:'#fff',border:'none',padding:'0.9rem 2.2rem',fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:'0.95rem',cursor:'pointer',borderRadius:'8px',display:'inline-flex',alignItems:'center',gap:8,boxShadow:`0 4px 24px rgba(14,165,233,0.3)`}}>
              <Zap size={16}/> Open SiteSnap <ArrowRight size={16}/>
            </motion.button>
          </div>
        </Reveal>
      </section>
      <footer style={{borderTop:`1px solid ${t.border}`,padding:'1.5rem 3rem',display:'flex',alignItems:'center',justifyContent:'space-between',position:'relative',zIndex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><ChainLogo size={22} color={t.accent}/><span style={{fontSize:'0.82rem',fontWeight:600,color:t.text2}}>SiteSnap</span></div>
        <div style={{fontSize:'0.72rem',color:t.textDim}}>© 2025 SiteSnap · Built by Pooja</div>
      </footer>
    </div>
  );
}

// ── Deploy content ────────────────────────────────────────────────────────────
function DeployContent({isDark}:{isDark:boolean}){
  const t=isDark?DARK:LIGHT;
  const { getToken } = useAuth();
  const [sites,setSites]=useState<Site[]>([]);
  const [isUploading,setIsUploading]=useState(false);
  const [uploadProgress,setUploadProgress]=useState(0);
  const [copiedId,setCopiedId]=useState<string|null>(null);
  const [toasts,setToasts]=useState<Toast[]>([]);
  const addToast=useCallback((type:Toast['type'],title:string,message:string,ms=6000)=>{const id=Math.random().toString(36).slice(7);setToasts(p=>[...p,{id,type,title,message}]);setTimeout(()=>setToasts(p=>p.filter(x=>x.id!==id)),ms);},[]);
  const removeToast=(id:string)=>setToasts(p=>p.filter(x=>x.id!==id));
  const authFetch=useCallback(async(url:string,options:RequestInit={})=>{const token=await getToken();return fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${token}` }});},[getToken]);
  useEffect(()=>{authFetch('/api/sites').then(r=>r.ok?r.json():[]).then(setSites).catch(()=>{});},[]);
  const deleteSite=async(id:string)=>{if(!window.confirm('Delete this site?'))return;try{const r=await authFetch(`/api/sites/${id}`,{method:'DELETE'});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Delete failed');}setSites(p=>p.filter(s=>s.id!==id));addToast('success','Site deleted','Removed from your deployments.');}catch(e:any){addToast('error','Delete failed',e.message||'Could not delete.');}};
  const onDrop=useCallback(async(accepted:File[],rejected:any[])=>{
    if(rejected.length>0||accepted.length===0){addToast('warning','Wrong file type','Only .zip files are accepted.',8000);return;}
    const file=accepted[0];
    if(!file.name.toLowerCase().endsWith('.zip')){addToast('warning','Wrong file type','Only .zip files are accepted.',8000);return;}
    if(file.size>5*1024*1024){addToast('error','File too large',`Max size is 5MB. Your file is ${(file.size/1024/1024).toFixed(1)}MB.`,10000);return;}
    const v=await validateWordPressZip(file);
    if(!v.valid){addToast('error','Not a WordPress ZIP',v.reason||'Use Simply Static plugin.',10000);return;}
    setIsUploading(true);setUploadProgress(0);
    try{
      const pr=await authFetch('/api/upload/presign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,fileSize:file.size})});
      if(!pr.ok)throw new Error('Could not start upload.');
      const{presignedUrl,r2Key}=await pr.json();
      const ur=await fetch(presignedUrl,{method:'PUT',body:file,headers:{'Content-Type':'application/zip'}});
      if(!ur.ok)throw new Error('Upload to storage failed.');
      setUploadProgress(80);
      const proc=await authFetch('/api/upload/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({r2Key,fileName:file.name})});
      const result=await proc.json();
      if(proc.status===413||result.error==='file_too_large'){setIsUploading(false);setUploadProgress(0);addToast('error','File too large','Max allowed is 5MB.',10000);return;}
      if(proc.status===422||result.error==='invalid_zip'){setIsUploading(false);setUploadProgress(0);addToast('warning','Not a WordPress ZIP',result.message||'Use Simply Static plugin.',10000);return;}
      if(!proc.ok)throw new Error(result.error||'Processing failed.');
      setUploadProgress(100);
      setSites(p=>[{id:result.id,name:result.name,created_at:new Date().toISOString(),url:result.url},...p]);
      setIsUploading(false);setUploadProgress(0);
      addToast('success','Site deployed!',`"${result.name}" is live. Copy the link and share it!`);
    }catch(e:any){setIsUploading(false);setUploadProgress(0);addToast('error','Upload failed',e.message||'Something went wrong.');}
  },[addToast,authFetch]);
  const{getRootProps,getInputProps,isDragActive}=useDropzone({onDrop,accept:{'application/zip':['.zip']},multiple:false});
  const copyLink=(url:string,id:string)=>{navigator.clipboard.writeText(url);setCopiedId(id);setTimeout(()=>setCopiedId(null),2000);};
  return(
    <div style={{maxWidth:1100,margin:'0 auto',padding:'3rem 2rem',position:'relative',zIndex:1}}>
      <style>{`.dep-list::-webkit-scrollbar{width:3px;}.dep-list::-webkit-scrollbar-thumb{background:${t.scrollbar};border-radius:4px;}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <ToastContainer toasts={toasts} onRemove={removeToast} isDark={isDark}/>
      <div style={{textAlign:'center',marginBottom:'2.5rem'}}>
        <div style={{fontSize:'0.72rem',color:t.accentText,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'0.6rem',fontWeight:600}}>Deploy</div>
        <h1 style={{fontSize:'clamp(2rem,4vw,3rem)',fontWeight:800,letterSpacing:'-0.05em',color:t.text2,lineHeight:1.05}}>Drop your ZIP. <span style={{color:t.accent}}>Own your link.</span></h1>
        <p style={{fontSize:'0.9rem',color:t.textDim,marginTop:'0.6rem'}}>No hosting setup. Just a permanent live URL for your WordPress site.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem'}}>
        <div style={{background:t.panelBg,border:`1px solid ${t.border}`,borderRadius:'12px',padding:'1.8rem'}}>
          <div style={{fontSize:'0.72rem',color:t.accentText,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'1.2rem',display:'flex',alignItems:'center',gap:6,fontWeight:600}}><Upload size={11}/> Upload</div>
          <div {...getRootProps()} style={{height:280,border:`2px dashed ${isDragActive?t.accent:t.uploadBorder}`,background:isDragActive?(isDark?'rgba(14,165,233,0.08)':'rgba(14,165,233,0.04)'):t.uploadBg,borderRadius:'10px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',position:'relative',overflow:'hidden',transition:'all 0.2s',boxShadow:isDragActive?`0 0 0 4px rgba(14,165,233,0.15)`:'none'}}>
            <input {...getInputProps()}/>
            {isUploading&&<div style={{position:'absolute',bottom:0,left:0,height:'3px',background:t.border,width:'100%'}}><motion.div initial={{width:0}} animate={{width:`${uploadProgress}%`}} style={{height:'100%',background:`linear-gradient(90deg,${t.accent},#38bdf8)`,borderRadius:'0 2px 2px 0'}}/></div>}
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0.8rem'}}>
              <motion.div animate={isDragActive?{scale:1.1}:{scale:1}} style={{width:52,height:52,background:isDragActive?t.accent:(isDark?'rgba(14,165,233,0.15)':'rgba(14,165,233,0.1)'),borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                {isUploading?<Loader2 size={22} color={t.accent} style={{animation:'spin 1s linear infinite'}}/>:<Upload size={22} color={isDragActive?'#fff':t.accent}/>}
              </motion.div>
              <div style={{textAlign:'center'}}>
                <p style={{fontSize:'0.9rem',fontWeight:600,color:t.text2}}>{isUploading?`Uploading... ${uploadProgress}%`:(isDragActive?'Drop it here!':'Drop your ZIP here')}</p>
                <p style={{fontSize:'0.75rem',color:t.textDim,marginTop:'0.3rem'}}>{isUploading?'Please wait — do not close this tab':'or click to browse files'}</p>
                {!isUploading&&<p style={{fontSize:'0.68rem',color:t.textDim,marginTop:'0.8rem',background:isDark?'#1a1a1a':'#f1f5f9',padding:'0.25rem 0.8rem',borderRadius:'100px',display:'inline-block'}}>WordPress ZIP only · Max 5MB</p>}
              </div>
            </div>
          </div>
        </div>
        <div style={{background:t.panelBg,border:`1px solid ${t.border}`,borderRadius:'12px',padding:'1.8rem'}}>
          <div style={{fontSize:'0.72rem',color:t.accentText,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'1.2rem',display:'flex',alignItems:'center',gap:6,fontWeight:600}}>
            <History size={11}/> Your Deploys
            {sites.length>0&&<span style={{marginLeft:'auto',color:t.textDim,fontWeight:400,fontSize:'0.68rem'}}>{sites.length} site{sites.length!==1?'s':''}</span>}
            {sites.length>0&&<button onClick={async()=>{if(!window.confirm('Delete all sites?'))return;await Promise.all(sites.map(s=>authFetch(`/api/sites/${s.id}`,{method:'DELETE'}).catch(()=>null)));setSites([]);addToast('success','All deleted','Your deploy history is now empty.');}} style={{marginLeft:4,padding:'0.2rem 0.5rem',fontSize:'0.62rem',fontWeight:500,background:t.delAll,color:t.delAllText,border:`1px solid ${t.delAllBorder}`,borderRadius:'4px',cursor:'pointer',fontFamily:"'Inter',sans-serif",display:'flex',alignItems:'center',gap:3}}><Trash2 size={9}/> All</button>}
          </div>
          <div className="dep-list" style={{display:'flex',flexDirection:'column',gap:'0.65rem',maxHeight:440,overflowY:'auto',paddingRight:2}}>
            {sites.length===0
              ?<div style={{textAlign:'center',padding:'3rem 1rem',fontSize:'0.82rem',lineHeight:2.2}}>
                <motion.div animate={{y:[0,-5,0]}} transition={{repeat:Infinity,duration:2.5,ease:'easeInOut'}} style={{display:'inline-block',marginBottom:'0.5rem'}}>
                  <Inbox size={32} color={t.emptyText}/>
                </motion.div>
                <br/><span style={{color:t.emptyText}}>No deploys yet.</span><br/><span style={{color:t.textDim}}>Upload your first ZIP to get started.</span>
              </div>
              :<AnimatePresence mode="popLayout">
                {sites.map((site,i)=>(
                  <motion.div key={site.id} layout initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
                    style={{background:t.depCard,border:`1px solid ${t.border}`,borderRadius:'10px',padding:'1rem 1.1rem'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.65rem'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontFamily:'monospace',fontSize:'0.62rem',color:t.depNumText,background:t.depNum,border:`1px solid ${t.depNumBorder}`,padding:'0.12rem 0.45rem',borderRadius:'4px'}}>{String(i+1).padStart(2,'0')}</span>
                        <span style={{fontSize:'0.82rem',fontWeight:600,color:t.text,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{site.name}</span>
                      </div>
                      <motion.a href={site.url} target="_blank" rel="noreferrer" whileHover={{scale:1.1}} style={{width:28,height:28,background:t.accent,borderRadius:'6px',display:'flex',alignItems:'center',justifyContent:'center',textDecoration:'none'}}>
                        <ExternalLink size={12} color="#fff"/>
                      </motion.a>
                    </div>
                    <div style={{background:t.depUrl,border:`1px solid ${t.depUrlBorder}`,padding:'0.4rem 0.7rem',fontFamily:'monospace',fontSize:'0.62rem',color:t.textDim,marginBottom:'0.65rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',borderRadius:'6px'}}>{site.url}</div>
                    <div style={{display:'flex',gap:'0.45rem'}}>
                      <button onClick={()=>copyLink(site.url,site.id)} style={{flex:1,background:copiedId===site.id?t.depCopyOk:t.depCopy,border:`1px solid ${copiedId===site.id?t.depCopyOkBorder:t.depCopyBorder}`,padding:'0.45rem',fontFamily:"'Inter',sans-serif",fontSize:'0.68rem',color:copiedId===site.id?t.depCopyOkText:t.depCopyText,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5,borderRadius:'6px',fontWeight:500,transition:'all 0.2s'}}>
                        {copiedId===site.id?<><Check size={10}/> Copied!</>:<><Copy size={10}/> Copy Link</>}
                      </button>
                      <button onClick={()=>deleteSite(site.id)} style={{background:t.depDel,border:`1px solid ${t.depDelBorder}`,padding:'0.45rem 0.8rem',fontFamily:"'Inter',sans-serif",fontSize:'0.68rem',color:t.depDelText,cursor:'pointer',display:'flex',alignItems:'center',gap:4,borderRadius:'6px',fontWeight:500}}>
                        <Trash2 size={10}/> Delete
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Signed-in shell ───────────────────────────────────────────────────────────
function SignedInApp({isDark,onToggleTheme}:{isDark:boolean;onToggleTheme:()=>void}){
  const t=isDark?DARK:LIGHT;
  const { signOut } = useClerk();
  const [page,setPage]=useState<NavPage>('home');
  const [showLogout,setShowLogout]=useState(false);
  const handleLogout=async()=>{setShowLogout(false);await signOut();};
  const handleNav=(p:NavPage)=>setPage(p);
  return(
    <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'Inter',sans-serif",transition:'background 0.3s'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');*{box-sizing:border-box;}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <AnimatePresence>{showLogout&&<LogoutModal isDark={isDark} onConfirm={handleLogout} onCancel={()=>setShowLogout(false)}/>}</AnimatePresence>
      <ConstellationCanvas isDark={isDark}/>
      <AppNav isDark={isDark} onToggleTheme={onToggleTheme} page={page} onNav={handleNav} onLogout={()=>setShowLogout(true)}/>
      <AnimatePresence mode="wait">
        <motion.div key={page} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.22}}>
          {page==='home'&&<HomeContent isDark={isDark} onDeploy={()=>handleNav('deploy')}/>}
          {page==='deploy'&&<DeployContent isDark={isDark}/>}
          {page==='bug'&&<BugReportPage isDark={isDark}/>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
function AppInner(){
  const { isSignedIn, isLoaded } = useAuth();
  const [isDark,setIsDark]=useState<boolean>(()=>{const s=localStorage.getItem('sitesnap-theme');return s===null?true:s==='dark';});
  const toggleTheme=()=>setIsDark(p=>{const n=!p;localStorage.setItem('sitesnap-theme',n?'dark':'light');return n;});
  if(!isLoaded){const t=isDark?DARK:LIGHT;return(<div style={{minHeight:'100vh',background:t.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Loader2 size={32} color={t.accent} style={{animation:'spin 1s linear infinite'}}/><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>);}
  if(!isSignedIn)return <AuthPage isDark={isDark} onToggleTheme={toggleTheme}/>;
  return <SignedInApp isDark={isDark} onToggleTheme={toggleTheme}/>;
}

export default function App(){
  if(!PUBLISHABLE_KEY)return <div style={{color:'red',padding:32,fontFamily:'monospace'}}>Missing VITE_CLERK_PUBLISHABLE_KEY in .env</div>;
  return <ClerkProvider publishableKey={PUBLISHABLE_KEY}><AppInner/></ClerkProvider>;
}
