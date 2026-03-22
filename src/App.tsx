/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Copy, Check, History, ExternalLink, Trash2, Loader2, ArrowRight, CheckCircle, XCircle, AlertTriangle, Sun, Moon, LogOut, User } from 'lucide-react';

interface Site {
  id: string;
  name: string;
  created_at: string;
  url: string;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}

// ── Theme tokens ──────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0a0a0b', bg2: '#0e0e11', bg3: '#141418', bg4: '#080810',
  border: '#1e1e24', border2: '#2a2a32',
  text: '#e8e6df', text2: '#f0ede4', textMuted: '#9a98a0', textDim: '#6a6870',
  accent: '#ffe17c', accentText: '#b8a84a',
  cardBg: '#0e0e11', cardHover: '#131318',
  navBg: 'rgba(10,10,11,0.92)',
  panelBg: '#0e0e11',
  uploadBg: '#080810', uploadBorder: '#2a2a34',
  depCard: '#080810', depUrl: '#050508', depUrlBorder: '#181820',
  depNum: '#181400', depNumBorder: '#252000', depNumText: '#ffe17c',
  depCopy: '#131318', depCopyBorder: '#1e1e24', depCopyText: '#c8c6bf',
  depCopyOk: '#0a1e0a', depCopyOkBorder: '#152015', depCopyOkText: '#6ae88a',
  depDel: '#160808', depDelBorder: '#241010', depDelText: '#ff8080',
  delAll: '#1a0a0a', delAllBorder: '#2e1515', delAllText: '#ff8080',
  toastBg: '#0e0e11',
  toastSuccessBorder: '#1a3a1a', toastSuccessText: '#6ae88a',
  toastErrorBorder: '#2e1515', toastErrorText: '#ff8080',
  toastWarnBorder: '#2a2000', toastWarnText: '#ffe17c',
  toastMsg: '#9a98a0',
  stepBorder: '#1e1e24', stepTag: '#141418', stepTagBorder: '#1e1e24', stepTagText: '#9a98a0',
  ctaBox: '#0e0e11', ctaBoxBorder: '#1e1e24',
  statText: '#f0ede4', statLabel: '#7a7880',
  scrollbar: '#222228',
  logoIcon: '#ffe17c', logoBorder: '#000',
  btnPrimary: '#ffe17c', btnPrimaryText: '#0a0a0b', btnPrimaryShadow: '#000',
  btnGhostText: '#c0bdb6', btnGhostBorder: '#2a2a32',
  cr: '180,175,200', cn: '255,225,124', cd: '255,225,124',
  upIcon: '#000', upTxt: '#d0cec8', upSub: '#6a6870',
  progressBg: 'rgba(255,225,124,0.05)',
  toggleBg: '#1e1e24', toggleText: '#9a98a0',
  emptyText: '#3a3848',
};

const LIGHT = {
  bg: '#f5f4e8', bg2: '#edeadb', bg3: '#e8e5d5', bg4: '#f0eddf',
  border: '#ccc9b8', border2: '#b8b5a4',
  text: '#2d2b26', text2: '#2d2b26', textMuted: '#6b6860', textDim: '#8a8778',
  accent: '#ffe17c', accentText: '#8a7a20',
  cardBg: '#f5f4e8', cardHover: '#edeadb',
  navBg: 'rgba(245,244,232,0.92)',
  panelBg: '#edeadb',
  uploadBg: '#f5f4e8', uploadBorder: '#b8b5a4',
  depCard: '#f5f4e8', depUrl: '#f0eddf', depUrlBorder: '#ccc9b8',
  depNum: '#faf7e8', depNumBorder: '#d8d0a0', depNumText: '#8a7a20',
  depCopy: '#edeadb', depCopyBorder: '#ccc9b8', depCopyText: '#4a4840',
  depCopyOk: '#d8f0d8', depCopyOkBorder: '#b8d8b8', depCopyOkText: '#2a7a2a',
  depDel: '#f5e8e8', depDelBorder: '#d8b8b8', depDelText: '#aa3030',
  delAll: '#f5e8e8', delAllBorder: '#d8b8b8', delAllText: '#aa3030',
  toastBg: '#f0eddf',
  toastSuccessBorder: '#b8d8b8', toastSuccessText: '#2a7a2a',
  toastErrorBorder: '#d8b8b8', toastErrorText: '#aa3030',
  toastWarnBorder: '#d8cfa0', toastWarnText: '#7a6010',
  toastMsg: '#6b6860',
  stepBorder: '#ccc9b8', stepTag: '#f5f4e8', stepTagBorder: '#ccc9b8', stepTagText: '#8a8778',
  ctaBox: '#edeadb', ctaBoxBorder: '#ccc9b8',
  statText: '#2d2b26', statLabel: '#8a8778',
  scrollbar: '#ccc9b8',
  logoIcon: '#ffe17c', logoBorder: '#2d2b26',
  btnPrimary: '#2d2b26', btnPrimaryText: '#f5f4e8', btnPrimaryShadow: '#ffe17c',
  btnGhostText: '#6b6860', btnGhostBorder: '#ccc9b8',
  cr: '45,43,38', cn: '45,43,38', cd: '45,43,38',
  upIcon: '#2d2b26', upTxt: '#2d2b26', upSub: '#8a8778',
  progressBg: 'rgba(45,43,38,0.06)',
  toggleBg: '#ccc9b8', toggleText: '#6b6860',
  emptyText: '#b0ad9c',
};

// ── Pixel Chain Logo SVG ──────────────────────────────────────────────────────
function ChainLogo({ size = 32, color = '#2d2b26' }: { size?: number; color?: string }) {
  const p = color;
  // 52×32 grid pixel-art chain — two oval links connected by a bar
  return (
    <svg width={size} height={Math.round(size * 0.62)} viewBox="0 0 52 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left link */}
      <rect x="0" y="10" width="3" height="12" fill={p}/>
      <rect x="3" y="5"  width="3" height="5"  fill={p}/>
      <rect x="6" y="2"  width="7" height="3"  fill={p}/>
      <rect x="13" y="5" width="3" height="5"  fill={p}/>
      <rect x="3" y="22" width="3" height="5"  fill={p}/>
      <rect x="6" y="27" width="7" height="3"  fill={p}/>
      <rect x="13" y="22" width="3" height="5" fill={p}/>
      <rect x="16" y="10" width="3" height="4" fill={p}/>
      <rect x="16" y="18" width="3" height="4" fill={p}/>
      <rect x="16" y="14" width="3" height="4" fill={p}/>
      {/* connector */}
      <rect x="19" y="14" width="14" height="4" fill={p}/>
      {/* Right link */}
      <rect x="33" y="10" width="3" height="4" fill={p}/>
      <rect x="33" y="18" width="3" height="4" fill={p}/>
      <rect x="33" y="14" width="3" height="4" fill={p}/>
      <rect x="36" y="5"  width="3" height="5" fill={p}/>
      <rect x="39" y="2"  width="7" height="3" fill={p}/>
      <rect x="46" y="5"  width="3" height="5" fill={p}/>
      <rect x="36" y="22" width="3" height="5" fill={p}/>
      <rect x="39" y="27" width="7" height="3" fill={p}/>
      <rect x="46" y="22" width="3" height="5" fill={p}/>
      <rect x="49" y="10" width="3" height="12" fill={p}/>
    </svg>
  );
}

// ── Scroll reveal hook ────────────────────────────────────────────────────────
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

type RevealDir = 'up' | 'down' | 'left' | 'right' | 'fade';

// Scroll-triggered reveal for sections below the fold
function Reveal({ children, dir = 'up', delay = 0, style }: { children: React.ReactNode; dir?: RevealDir; delay?: number; style?: React.CSSProperties }) {
  const { ref, visible } = useScrollReveal();
  const tx: Record<RevealDir, string> = { up: 'translateY(40px)', down: 'translateY(-40px)', left: 'translateX(-50px)', right: 'translateX(50px)', fade: 'none' };
  return (
    <div ref={ref} style={{ transform: visible ? 'none' : tx[dir], opacity: visible ? 1 : 0, transition: `transform 1.2s cubic-bezier(0.22,1,0.36,1) ${delay}ms, opacity 1.1s ease ${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

// Mount-triggered reveal for hero (fires immediately on load)
function HeroReveal({ children, dir = 'up', delay = 0, style }: { children: React.ReactNode; dir?: RevealDir; delay?: number; style?: React.CSSProperties }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const id = setTimeout(() => setVis(true), delay); return () => clearTimeout(id); }, [delay]);
  const tx: Record<RevealDir, string> = { up: 'translateY(42px)', down: 'translateY(-42px)', left: 'translateX(-56px)', right: 'translateX(56px)', fade: 'none' };
  return (
    <div style={{ transform: vis ? 'none' : tx[dir], opacity: vis ? 1 : 0, transition: `transform 1.3s cubic-bezier(0.22,1,0.36,1), opacity 1.1s ease`, ...style }}>
      {children}
    </div>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────
function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const t = isDark ? DARK : LIGHT;
  return (
    <button onClick={onToggle} title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.toggleBg, border: `1px solid ${t.border}`, padding: '0.38rem 0.8rem', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: t.toggleText, letterSpacing: '0.06em', transition: 'all 0.2s', textTransform: 'uppercase' }}>
      {isDark ? <Sun size={13} color={t.accent} /> : <Moon size={13} color={t.text} />}
      {isDark ? 'Light' : 'Dark'}
    </button>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onRemove, isDark }: { toasts: Toast[]; onRemove: (id: string) => void; isDark: boolean }) {
  const t = isDark ? DARK : LIGHT;
  return (
    <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '380px', width: '100%' }}>
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          const borderC = toast.type === 'success' ? t.toastSuccessBorder : toast.type === 'error' ? t.toastErrorBorder : t.toastWarnBorder;
          const textC = toast.type === 'success' ? t.toastSuccessText : toast.type === 'error' ? t.toastErrorText : t.toastWarnText;
          return (
            <motion.div key={toast.id} layout initial={{ opacity: 0, x: 60, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60, scale: 0.95 }} transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              style={{ background: t.toastBg, border: `1px solid ${borderC}`, padding: '1rem 1.1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', boxShadow: `4px 4px 0 ${borderC}` }}
              onClick={() => onRemove(toast.id)}>
              <div style={{ marginTop: 1, flexShrink: 0 }}>
                {toast.type === 'success' && <CheckCircle size={16} color={textC} />}
                {toast.type === 'error' && <XCircle size={16} color={textC} />}
                {toast.type === 'warning' && <AlertTriangle size={16} color={textC} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: textC, marginBottom: '0.25rem' }}>{toast.title}</div>
                <div style={{ fontSize: '0.82rem', color: t.toastMsg, lineHeight: 1.5 }}>{toast.message}</div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: t.textDim, flexShrink: 0, marginTop: 2 }}>✕</div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Constellation ─────────────────────────────────────────────────────────────
function ConstellationCanvas({ isDark }: { isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDarkRef = useRef(isDark);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let W = 0, H = 0, animId = 0;
    const mouse = { x: -9999, y: -9999 };
    let pts: any[] = [];
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    const init = () => { pts = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.5 + 0.8, base: Math.random() * 0.4 + 0.2, a: 0 })); };
    const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
    const draw = () => {
      const d = isDarkRef.current;
      const cr = d ? DARK.cr : LIGHT.cr;
      const cn = d ? DARK.cn : LIGHT.cn;
      const cd = d ? DARK.cd : LIGHT.cd;
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 60 && dd > 0) { const f = (60 - dd) / 60 * 1.2; p.x += dx / dd * f; p.y += dy / dd * f; }
        p.a += (p.base - p.a) * 0.05;
      }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dd = dist(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
        if (dd < 140) {
          const op = (1 - dd / 140) * 0.18;
          const near = dist(pts[i].x, pts[i].y, mouse.x, mouse.y) < 180 || dist(pts[j].x, pts[j].y, mouse.x, mouse.y) < 180;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = near ? `rgba(${cn},${op * 4.5})` : `rgba(${cr},${op})`; ctx.lineWidth = near ? 0.8 : 0.5; ctx.stroke();
        }
      }
      for (const p of pts) {
        const near = dist(p.x, p.y, mouse.x, mouse.y) < 180;
        ctx.beginPath(); ctx.arc(p.x, p.y, near ? p.r * 1.6 : p.r, 0, Math.PI * 2);
        ctx.fillStyle = near ? `rgba(${cn},${Math.min(p.a * 3, 1)})` : `rgba(${cr},${p.a})`; ctx.fill();
      }
      if (mouse.x > 0) {
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2); ctx.fillStyle = `rgba(${cd},0.6)`; ctx.fill();
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 10, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${cd},0.12)`; ctx.lineWidth = 1; ctx.stroke();
      }
      animId = requestAnimationFrame(draw);
    };
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', () => { resize(); init(); });
    resize(); init(); draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseleave', onLeave); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />;
}

// ── Home Page ─────────────────────────────────────────────────────────────────
function HomePage({ onEnterApp, isDark, onToggleTheme }: { onEnterApp: () => void; isDark: boolean; onToggleTheme: () => void }) {
  const t = isDark ? DARK : LIGHT;
  const enter = () => { sessionStorage.setItem('inApp', '1'); onEnterApp(); };
  const btnHover = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => {
    e.currentTarget.style.transform = on ? 'translate(2px,2px)' : '';
    e.currentTarget.style.boxShadow = on ? `2px 2px 0 ${t.btnPrimaryShadow}` : `4px 4px 0 ${t.btnPrimaryShadow}`;
  };
  return (
    <div style={{ background: t.bg, minHeight: '100vh', color: t.text, fontFamily: "'Outfit', sans-serif", overflowX: 'hidden', transition: 'background 0.3s,color 0.3s' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;}@keyframes hpPulse{0%,100%{opacity:1;}50%{opacity:.35;}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <ConstellationCanvas isDark={isDark} />

      {/* NAV */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.4rem 3rem', borderBottom: `1px solid ${t.border}`, position: 'sticky', top: 0, background: t.navBg, backdropFilter: 'blur(16px)', zIndex: 100, transition: 'background 0.3s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ChainLogo size={38} color={isDark ? '#e8e6df' : '#2d2b26'} />
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: t.text2, letterSpacing: '-.02em' }}>SiteSnap</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          <button onClick={enter} style={{ background: t.btnPrimary, color: t.btnPrimaryText, border: 'none', padding: '.55rem 1.3rem', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em' }}>Launch App</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '88vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 2rem 4rem', position: 'relative', zIndex: 1 }}>
        <HeroReveal dir="down" delay={0}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: t.bg3, border: `1px solid ${t.border}`, padding: '.4rem 1rem', fontFamily: "'DM Mono',monospace", fontSize: '.72rem', color: t.accentText, marginBottom: '2rem', letterSpacing: '.06em' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, display: 'inline-block', animation: 'hpPulse 2s ease-in-out infinite' }} />
            No GitHub. No hosting. No drama.
          </div>
        </HeroReveal>
        <HeroReveal dir="left" delay={120}>
          <h1 style={{ fontSize: 'clamp(3rem,7vw,5.8rem)', fontWeight: 800, lineHeight: .98, letterSpacing: '-.05em', marginBottom: '1.6rem', maxWidth: 820, color: t.text2 }}>
            Your WordPress site,<br />
            <span style={{ textDecoration: 'underline', textDecorationColor: t.accent, textUnderlineOffset: 6, textDecorationThickness: 4 }}>live in seconds.</span>
          </h1>
        </HeroReveal>
        <HeroReveal dir="up" delay={220}>
          <p style={{ fontSize: '1.15rem', color: t.textMuted, maxWidth: 500, lineHeight: 1.75, marginBottom: '3rem' }}>Upload your WordPress ZIP and get a permanent shareable link — without touching a server.</p>
        </HeroReveal>
        <HeroReveal dir="up" delay={340}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={enter} onMouseOver={e => btnHover(e, true)} onMouseOut={e => btnHover(e, false)}
              style={{ background: t.btnPrimary, color: t.btnPrimaryText, border: `2px solid ${t.logoBorder}`, padding: '.85rem 2.2rem', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: '1rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em', boxShadow: `4px 4px 0 ${t.btnPrimaryShadow}`, transition: 'transform .1s,box-shadow .1s', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Upload Your ZIP <ArrowRight size={16} />
            </button>
            <button onClick={() => document.getElementById('hp-how')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ background: 'transparent', color: t.btnGhostText, border: `1px solid ${t.btnGhostBorder}`, padding: '.85rem 2.2rem', fontFamily: "'Outfit',sans-serif", fontWeight: 500, fontSize: '1rem', cursor: 'pointer' }}>
              See how it works
            </button>
          </div>
        </HeroReveal>
        <HeroReveal dir="right" delay={460}>
          <div style={{ display: 'flex', gap: '3.5rem', marginTop: '4.5rem' }}>
            {[['ZIP', 'Just one file'], ['∞', 'Permanent links'], ['0', 'Setup required']].map(([n, l]) => (
              <div key={l}><div style={{ fontSize: '1.8rem', fontWeight: 800, color: t.statText, letterSpacing: '-.04em' }}>{n}</div><div style={{ fontSize: '.75rem', color: t.statLabel, marginTop: 3, fontFamily: "'DM Mono',monospace", letterSpacing: '.04em' }}>{l}</div></div>
            ))}
          </div>
        </HeroReveal>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '6rem 3rem', position: 'relative', zIndex: 1 }}>
        <Reveal dir="up" delay={0}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: t.accentText, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '.8rem' }}>// Features</div>
          <h2 style={{ fontSize: 'clamp(1.9rem,4vw,2.9rem)', fontWeight: 700, letterSpacing: '-.04em', marginBottom: '1rem', lineHeight: 1.08, color: t.text2 }}>Everything you need.<br />Nothing you don't.</h2>
          <p style={{ color: t.textMuted, fontSize: '1.02rem', lineHeight: 1.75, maxWidth: 500, marginBottom: '3.5rem' }}>Built for freelancers, students, and agencies who want to showcase WordPress work — fast.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 1, border: `1px solid ${t.border}`, background: t.border }}>
          {[{ icon: '⚡', title: 'Instant Deploy', desc: 'Drop your ZIP and go. No config files, no CLI, no servers.' }, { icon: '🔗', title: 'Permanent Links', desc: 'Every deploy gets a URL that never expires.' }, { icon: '📁', title: 'Deploy History', desc: 'All deployments in one place. Copy links, open sites, delete old ones.' }, { icon: '🚫', title: 'No GitHub Needed', desc: 'For designers, students, freelancers — not just developers.' }].map((f, i) => (
            <Reveal key={f.title} dir="up" delay={i * 80}>
              <div style={{ background: t.cardBg, padding: '2rem 1.8rem', display: 'flex', flexDirection: 'column', gap: '.9rem', transition: 'background .2s', cursor: 'default', height: '100%' }}
                onMouseOver={e => (e.currentTarget.style.background = t.cardHover)} onMouseOut={e => (e.currentTarget.style.background = t.cardBg)}>
                <div style={{ width: 40, height: 40, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: t.bg3 }}>{f.icon}</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: t.text }}>{f.title}</div>
                <div style={{ fontSize: '.9rem', color: t.textDim, lineHeight: 1.68 }}>{f.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="hp-how" style={{ padding: '6rem 3rem', background: t.bg2, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Reveal dir="up">
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: t.accentText, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '.8rem' }}>// How it works</div>
            <h2 style={{ fontSize: 'clamp(1.9rem,4vw,2.9rem)', fontWeight: 700, letterSpacing: '-.04em', marginBottom: '1rem', lineHeight: 1.08, color: t.text2 }}>Three steps.<br />That's literally it.</h2>
          </Reveal>
          {[{ n: '01', title: 'Export your WordPress site', desc: 'Use Simply Static plugin to export your full site as a ZIP.', tag: 'your-site.zip' }, { n: '02', title: 'Drop it in SiteSnap', desc: 'Drag and drop your ZIP. Chunked upload handles even large files.', tag: 'uploading... 87%' }, { n: '03', title: 'Share your permanent link', desc: 'Get a permanent URL instantly. Share with clients or add to your CV.', tag: 'sitesnap.app/s/xk29ma' }].map((s, idx, arr) => (
            <Reveal key={s.n} dir="left" delay={idx * 120}>
              <div style={{ display: 'flex', gap: '2rem', padding: '2.2rem 0', borderBottom: idx < arr.length - 1 ? `1px solid ${t.stepBorder}` : 'none' }}>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: t.accentText, minWidth: 36, paddingTop: 4 }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: '1.08rem', fontWeight: 600, marginBottom: '.4rem', color: t.text }}>{s.title}</div>
                  <div style={{ fontSize: '.9rem', color: t.textDim, lineHeight: 1.68 }}>{s.desc}</div>
                  <div style={{ display: 'inline-block', background: t.stepTag, border: `1px solid ${t.stepTagBorder}`, fontFamily: "'DM Mono',monospace", fontSize: '.68rem', color: t.stepTagText, padding: '.25rem .7rem', marginTop: '.7rem' }}>{s.tag}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '7rem 3rem', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Reveal dir="up">
          <div style={{ display: 'inline-block', background: t.ctaBox, border: `1px solid ${t.ctaBoxBorder}`, padding: '4rem 5rem', position: 'relative', maxWidth: 640, width: '100%' }}>
            <div style={{ position: 'absolute', top: -1, left: '10%', right: '10%', height: 1, background: `linear-gradient(90deg,transparent,${t.accentText},transparent)` }} />
            <h2 style={{ fontSize: 'clamp(1.9rem,4vw,2.7rem)', fontWeight: 700, letterSpacing: '-.04em', marginBottom: '1rem', color: t.text2 }}>Ready to ship<br />your first site?</h2>
            <p style={{ color: t.textMuted, fontSize: '.98rem', marginBottom: '2.4rem', lineHeight: 1.75 }}>Free account. No credit card. Just your ZIP and 30 seconds.</p>
            <button onClick={enter} onMouseOver={e => btnHover(e, true)} onMouseOut={e => btnHover(e, false)}
              style={{ background: t.btnPrimary, color: t.btnPrimaryText, border: `2px solid ${t.logoBorder}`, padding: '.85rem 2.2rem', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: '1rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em', boxShadow: `4px 4px 0 ${t.btnPrimaryShadow}`, transition: 'transform .1s,box-shadow .1s', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Open SiteSnap <ArrowRight size={16} />
            </button>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${t.border}`, padding: '1.8rem 3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChainLogo size={26} color={isDark ? '#e8e6df' : '#2d2b26'} />
          <span style={{ fontSize: '.85rem', fontWeight: 700, color: t.text2 }}>SiteSnap</span>
        </div>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.68rem', color: t.textDim }}>© 2025 SiteSnap. Built for builders.</div>
      </footer>
    </div>
  );
}

// ── Auth Pages ────────────────────────────────────────────────────────────────
interface AuthUser { id: string; email: string; }

function AuthPage({ mode, isDark, onToggleTheme, onAuth }: { mode: 'login' | 'signup'; isDark: boolean; onToggleTheme: () => void; onAuth: (user: AuthUser, token: string) => void }) {
  const t = isDark ? DARK : LIGHT;
  const [isLogin, setIsLogin] = useState(mode === 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError('');
    // Client-side validation first
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }
    if (!isLogin && password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); setLoading(false); return; }
      localStorage.setItem('sitesnap-token', data.token);
      localStorage.setItem('sitesnap-user', JSON.stringify(data.user));
      onAuth(data.user, data.token);
    } catch { setError('Cannot connect to server. Make sure your server is running.'); }
    setLoading(false);
  };

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%', background: isDark ? '#080810' : '#faf9f4',
    border: `1.5px solid ${focusedField === field ? t.accent : t.border}`,
    padding: '0.8rem 1rem', fontFamily: "'Outfit',sans-serif", fontSize: '0.95rem',
    color: t.text, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Outfit',sans-serif", transition: 'background 0.3s' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
        input::placeholder{color:${isDark ? '#3a3848' : '#b0ad9c'};}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px ${isDark ? '#080810' : '#faf9f4'} inset !important;-webkit-text-fill-color:${t.text} !important;}
      `}</style>
      <ConstellationCanvas isDark={isDark} />

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.2rem 3rem', borderBottom: `1px solid ${t.border}`, background: t.navBg, backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ChainLogo size={34} color={isDark ? '#e8e6df' : '#2d2b26'} />
          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: t.text2, letterSpacing: '-.02em' }}>SiteSnap</span>
        </div>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </nav>

      {/* Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem', position: 'relative', zIndex: 1 }}>
        <div style={{ width: '100%', maxWidth: 440, animation: 'slideUp 0.6s cubic-bezier(0.22,1,0.36,1)' }}>

          {/* Card */}
          <div style={{ background: t.panelBg, border: `1px solid ${t.border}`, padding: '2.8rem 2.5rem', position: 'relative', boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.4)' : '0 24px 64px rgba(0,0,0,0.08)' }}>
            {/* Top accent line */}
            <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: 2, background: `linear-gradient(90deg,transparent,${t.accent},transparent)` }} />

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.2rem' }}>
                <ChainLogo size={48} color={isDark ? '#e8e6df' : '#2d2b26'} />
              </div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.68rem', color: t.accentText, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '.5rem' }}>
                {isLogin ? '// Welcome back' : '// Get started free'}
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: t.text2, letterSpacing: '-.04em', margin: 0 }}>
                {isLogin ? 'Sign in to SiteSnap' : 'Create your account'}
              </h1>
              <p style={{ fontSize: '.88rem', color: t.textMuted, marginTop: '.5rem', lineHeight: 1.6 }}>
                {isLogin ? 'Access your deployed WordPress sites.' : 'Free forever. No credit card required.'}
              </p>
            </div>

            {/* Toggle tabs */}
            <div style={{ display: 'flex', background: isDark ? '#050508' : '#ece9d8', border: `1px solid ${t.border}`, marginBottom: '1.8rem' }}>
              {(['Sign In', 'Sign Up'] as const).map((label, i) => {
                const active = (i === 0) === isLogin;
                return (
                  <button key={label} onClick={() => { setIsLogin(i === 0); setError(''); setEmail(''); setPassword(''); }}
                    style={{ flex: 1, padding: '.6rem', fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', border: 'none', background: active ? t.accent : 'transparent', color: active ? (isDark ? '#000' : '#000') : t.textMuted, transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  style={{ background: isDark ? '#160808' : '#fef2f2', border: `1px solid ${isDark ? '#3a1515' : '#fca5a5'}`, color: isDark ? '#ff9090' : '#dc2626', padding: '0.75rem 1rem', fontSize: '.84rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.4 }}>
                  <XCircle size={15} style={{ flexShrink: 0 }} /> {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Fields */}
            <div style={{ marginBottom: '.8rem' }}>
              <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: '.65rem', color: t.accentText, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.45rem', fontWeight: 500 }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                placeholder="you@example.com" style={inputStyle('email')}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>

            <div style={{ marginBottom: '1.6rem' }}>
              <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: '.65rem', color: t.accentText, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.45rem', fontWeight: 500 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                placeholder={isLogin ? '••••••••' : 'At least 8 characters'}
                style={inputStyle('password')}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              {!isLogin && password.length > 0 && (
                <div style={{ marginTop: '.4rem', display: 'flex', gap: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex: 1, height: 3, background: password.length >= i * 2 ? (password.length >= 8 ? '#6ae88a' : t.accent) : t.border, transition: 'background 0.3s' }} />
                  ))}
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '.6rem', color: t.textDim, marginLeft: 4 }}>
                    {password.length < 4 ? 'Weak' : password.length < 8 ? 'Almost' : 'Good'}
                  </span>
                </div>
              )}
            </div>

            {/* Submit */}
            <button onClick={handleSubmit} disabled={loading}
              style={{ width: '100%', background: t.btnPrimary, color: t.btnPrimaryText, border: `2px solid ${t.logoBorder}`, padding: '0.9rem', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: '.95rem', cursor: loading ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.75 : 1, boxShadow: loading ? 'none' : `4px 4px 0 ${t.btnPrimaryShadow}`, transition: 'all 0.15s' }}>
              {loading ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {loading ? 'Please wait...' : (isLogin ? 'Sign In →' : 'Create Account →')}
            </button>

            {/* Switch mode */}
            <p style={{ textAlign: 'center', marginTop: '1.4rem', fontSize: '.85rem', color: t.textMuted }}>
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={() => { setIsLogin(!isLogin); setError(''); setEmail(''); setPassword(''); }}
                style={{ background: 'none', border: 'none', color: t.text2, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit',sans-serif", fontSize: '.85rem' }}>
                {isLogin ? 'Sign up free →' : 'Sign in →'}
              </button>
            </p>
          </div>

          {/* Footer note */}
          <p style={{ textAlign: 'center', marginTop: '1.2rem', fontFamily: "'DM Mono',monospace", fontSize: '.62rem', color: t.textDim, letterSpacing: '.04em' }}>
            🔒 PASSWORDS ENCRYPTED · DATA NEVER SOLD
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('sitesnap-theme');
    return saved === null ? true : saved === 'dark';
  });
  const toggleTheme = () => setIsDark(prev => { const n = !prev; localStorage.setItem('sitesnap-theme', n ? 'dark' : 'light'); return n; });
  const t = isDark ? DARK : LIGHT;

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try { const u = localStorage.getItem('sitesnap-user'); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('sitesnap-token'));

  const handleAuth = (user: AuthUser, token: string) => { setAuthUser(user); setAuthToken(token); };
  const handleLogout = () => { localStorage.removeItem('sitesnap-token'); localStorage.removeItem('sitesnap-user'); setAuthUser(null); setAuthToken(null); setSites([]); sessionStorage.removeItem('inApp'); setShowHome(true); };

  // Authenticated fetch helper
  const authFetch = useCallback((url: string, options: RequestInit = {}) => {
    return fetch(url, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${authToken}` } });
  }, [authToken]);

  const [showHome, setShowHome] = useState(() => !sessionStorage.getItem('inApp'));
  const [sites, setSites] = useState<Site[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast['type'], title: string, message: string, durationMs = 7000) => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), durationMs);
  }, []);
  const removeToast = (id: string) => setToasts(prev => prev.filter(x => x.id !== id));

  const loadSites = async () => {
    try { const res = await authFetch('/api/sites'); if (res.ok) setSites(await res.json()); } catch (e) { console.error(e); }
  };
  useEffect(() => { loadSites(); }, []);

  const deleteSite = async (id: string) => {
    if (!window.confirm('Delete this site? This cannot be undone.')) return;
    try {
      const res = await authFetch(`/api/sites/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setSites(prev => prev.filter(s => s.id !== id));
      addToast('success', 'Site Deleted', 'The deployed site has been permanently removed.');
    } catch { addToast('error', 'Delete Failed', 'Could not delete the site. Please try again.'); }
  };

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0 || acceptedFiles.length === 0) { addToast('warning', 'Invalid File Type', 'Only .zip files are accepted. Please export your site as a ZIP using the Simply Static plugin and try again.', 10000); return; }
    const file = acceptedFiles[0];
    if (!file.name.toLowerCase().endsWith('.zip')) { addToast('warning', 'Invalid File Type', 'Only .zip files are accepted.', 10000); return; }
    setIsUploading(true); setUploadProgress(0);
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks for Vercel
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = Math.random().toString(36).substring(7);
    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
        // Convert chunk to base64 for Vercel JSON body
        const arrayBuffer = await chunk.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const res = await authFetch('/api/upload/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkData: base64, uploadId, chunkIndex: i, totalChunks, fileName: file.name })
        });
        const result = await res.json();
        if (res.status === 422 || result.error === 'invalid_zip') {
          setIsUploading(false); setUploadProgress(0);
          addToast('warning', 'Invalid ZIP — No Site Found', 'Your ZIP does not contain a valid static site. Please use the Simply Static plugin to export your WordPress site correctly, then try again.', 10000);
          return;
        }
        if (!res.ok) throw new Error(result.error || 'Upload failed');
        if (result.completed) {
          setUploadProgress(100);
          setSites(prev => [{ id: result.id, name: result.name, created_at: new Date().toISOString(), url: result.url }, ...prev]);
          setIsUploading(false); setUploadProgress(0);
          addToast('success', 'Site Deployed!', `"${result.name}" is now live. Copy the link and share it!`);
          return;
        }
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    } catch { setIsUploading(false); setUploadProgress(0); addToast('error', 'Upload Failed', 'Something went wrong. Try again or check your connection.'); }
  }, [addToast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/zip': ['.zip'] }, multiple: false });
  const copyToClipboard = (url: string, id: string) => { navigator.clipboard.writeText(`${window.location.origin}${url}`); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };

  if (!authUser) return <AuthPage mode="login" isDark={isDark} onToggleTheme={toggleTheme} onAuth={handleAuth} />;

  if (showHome) return <HomePage onEnterApp={() => { sessionStorage.setItem('inApp', '1'); setShowHome(false); }} isDark={isDark} onToggleTheme={toggleTheme} />;

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'Outfit',sans-serif", transition: 'background 0.3s,color 0.3s' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.dep-list::-webkit-scrollbar{width:3px;}.dep-list::-webkit-scrollbar-thumb{background:${t.scrollbar};border-radius:4px;}`}</style>
      <ConstellationCanvas isDark={isDark} />
      <ToastContainer toasts={toasts} onRemove={removeToast} isDark={isDark} />

      {/* NAV */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 3rem', borderBottom: `1px solid ${t.border}`, background: t.navBg, backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 50, transition: 'background 0.3s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => { sessionStorage.removeItem('inApp'); setShowHome(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: t.textMuted, border: `1px solid ${t.border2}`, padding: '.4rem 1rem', fontFamily: "'Outfit',sans-serif", fontSize: '.82rem', fontWeight: 500, cursor: 'pointer' }}>← Back</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ChainLogo size={30} color={isDark ? '#e8e6df' : '#2d2b26'} />
            <span style={{ fontSize: '.95rem', fontWeight: 700, color: t.text2, letterSpacing: '-.02em' }}>SiteSnap</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          {authUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'DM Mono',monospace", fontSize: '.68rem', color: t.textMuted }}>
              <User size={12} />{authUser.email}
            </div>
          )}
          {sites.length > 0 && (
            <button onClick={async () => {
              if (!window.confirm('Delete ALL deployed sites? This cannot be undone.')) return;
              try { await Promise.all(sites.map(s => authFetch(`/api/sites/${s.id}`, { method: 'DELETE' }).catch(() => null))); setSites([]); addToast('success', 'All Sites Deleted', 'All deployed sites have been permanently removed.'); }
              catch (e: any) { addToast('error', 'Delete Failed', `Could not delete all sites. ${e?.message || ''}`); }
            }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '.4rem 1rem', fontSize: '.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', background: t.delAll, color: t.delAllText, border: `1px solid ${t.delAllBorder}`, borderRadius: 9999, cursor: 'pointer', fontFamily: "'Outfit',sans-serif" }}>
              <Trash2 size={12} /> Delete All
            </button>
          )}
          <button onClick={handleLogout} title="Log out"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '.4rem 1rem', fontSize: '.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', background: 'transparent', color: t.textMuted, border: `1px solid ${t.border}`, cursor: 'pointer', fontFamily: "'Outfit',sans-serif" }}>
            <LogOut size={12} /> Logout
          </button>
        </div>
      </nav>

      {/* BODY */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: t.accentText, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '.7rem' }}>// Deploy</div>
          <h1 style={{ fontSize: 'clamp(2.2rem,4vw,3.2rem)', fontWeight: 800, letterSpacing: '-.05em', lineHeight: 1.0, color: t.text2 }}>
            Drop your ZIP.<br /><span style={{ textDecoration: 'underline', textDecorationColor: t.accent, textUnderlineOffset: 5, textDecorationThickness: 3 }}>Own your link.</span>
          </h1>
          <p style={{ fontSize: '.95rem', color: t.textDim, marginTop: '.7rem' }}>No hosting setup. No GitHub. Just a permanent live URL for your WordPress site.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* UPLOAD */}
          <div style={{ background: t.panelBg, border: `1px solid ${t.border}`, padding: '2rem' }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: t.accentText, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}><Upload size={12} /> Upload</div>
            <div {...getRootProps()} style={{ height: 290, border: `1.5px dashed ${isDragActive ? t.text : t.uploadBorder}`, background: isDragActive ? t.bg4 : t.uploadBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'border-color .2s,background .2s' }}>
              <input {...getInputProps()} />
              {isUploading && <motion.div initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }} style={{ position: 'absolute', inset: 0, background: t.progressBg, zIndex: 0, transformOrigin: 'left' }} />}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 54, height: 54, background: t.accent, border: `2px solid ${t.logoBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  {isUploading ? <Loader2 size={22} color={t.upIcon} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={22} color={t.upIcon} />}
                </div>
                <p style={{ fontSize: '.9rem', fontWeight: 600, color: t.upTxt, letterSpacing: '.05em', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace" }}>{isUploading ? `Uploading... ${uploadProgress}%` : 'Drop ZIP here'}</p>
                <p style={{ fontSize: '.72rem', color: t.upSub, marginTop: '.35rem', fontFamily: "'DM Mono',monospace" }}>{isUploading ? 'Please wait — do not close this page' : 'or click to browse files'}</p>
                {!isUploading && <p style={{ fontSize: '.65rem', color: t.textDim, marginTop: '.25rem', fontFamily: "'DM Mono',monospace", letterSpacing: '.04em' }}>Max file size: 500MB</p>}
                {!isUploading && <p style={{ fontSize: '.65rem', color: t.textDim, marginTop: '.5rem', fontFamily: "'DM Mono',monospace", background: t.bg3, border: `1px solid ${t.border}`, padding: '.2rem .6rem' }}>Max file size: 500MB</p>}
              </div>
            </div>
          </div>

          {/* DEPLOYS */}
          <div style={{ background: t.panelBg, border: `1px solid ${t.border}`, padding: '2rem' }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: t.accentText, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={12} /> Your Deploys
              {sites.length > 0 && <span style={{ marginLeft: 'auto', color: t.textDim, fontWeight: 400 }}>{sites.length} site{sites.length !== 1 ? 's' : ''}</span>}
            </div>
            <div className="dep-list" style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
              {sites.length === 0
                ? <div style={{ textAlign: 'center', padding: '3rem 1rem', color: t.emptyText, fontFamily: "'DM Mono',monospace", fontSize: '.8rem', lineHeight: 2.2 }}>📭<br />No deploys yet.<br />Upload your first ZIP to get started.</div>
                : <AnimatePresence mode="popLayout">
                  {sites.map((site, i) => (
                    <motion.div key={site.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      style={{ background: t.depCard, border: `1px solid ${t.border}`, padding: '1rem 1.1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '.65rem', color: t.depNumText, background: t.depNum, border: `1px solid ${t.depNumBorder}`, padding: '.15rem .5rem' }}>{String(i + 1).padStart(2, '0')}</span>
                          <span style={{ fontSize: '.85rem', fontWeight: 600, color: t.text, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</span>
                        </div>
                        <a href={`${window.location.origin}${site.url}`} target="_blank" rel="noreferrer"
                          style={{ width: 28, height: 28, background: t.btnPrimary, border: `1.5px solid ${t.logoBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                          <ExternalLink size={12} color={t.btnPrimaryText} />
                        </a>
                      </div>
                      <div style={{ background: t.depUrl, border: `1px solid ${t.depUrlBorder}`, padding: '.45rem .75rem', fontFamily: "'DM Mono',monospace", fontSize: '.65rem', color: t.textDim, marginBottom: '.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {window.location.origin}{site.url}
                      </div>
                      <div style={{ display: 'flex', gap: '.5rem' }}>
                        <button onClick={() => copyToClipboard(site.url, site.id)}
                          style={{ flex: 1, background: copiedId === site.id ? t.depCopyOk : t.depCopy, border: `1px solid ${copiedId === site.id ? t.depCopyOkBorder : t.depCopyBorder}`, padding: '.5rem', fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: copiedId === site.id ? t.depCopyOkText : t.depCopyText, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          {copiedId === site.id ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy Link</>}
                        </button>
                        <button onClick={() => deleteSite(site.id)}
                          style={{ background: t.depDel, border: `1px solid ${t.depDelBorder}`, padding: '.5rem .9rem', fontFamily: "'DM Mono',monospace", fontSize: '.7rem', color: t.depDelText, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          <Trash2 size={11} /> Delete
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
    </div>
  );
}
