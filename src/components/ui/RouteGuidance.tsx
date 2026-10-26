import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flag, LocateFixed, Route, Volume2, VolumeX, X } from 'lucide-react';
import type { RouteStep, TurnKind } from '../../services/pathfinding';
import { metres, spaced, stepText, thenText, walkMinutes, type RouteNames } from './routeText';

type Glyph = TurnKind | 'depart' | 'arrive';

/** Maneuver glyphs in the style of turn-by-turn banners: the stem is where you come from. */
export const ManeuverIcon: React.FC<{ kind: Glyph; className?: string }> = ({ kind, className }) => {
  const paths: Record<Exclude<Glyph, 'arrive'>, string[]> = {
    depart: ['M12 17V5', 'M6.5 10.5 12 5l5.5 5.5'],
    straight: ['M12 21V5', 'M6.5 10.5 12 5l5.5 5.5'],
    right: ['M8 21v-7a4 4 0 0 1 4-4h8', 'M15.5 5.5 20 10l-4.5 4.5'],
    left: ['M16 21v-7a4 4 0 0 0-4-4H4', 'M8.5 5.5 4 10l4.5 4.5'],
    'slight-right': ['M9 21v-6.5L17.5 6', 'M11.5 6h6v6'],
    'slight-left': ['M15 21v-6.5L6.5 6', 'M12.5 6h-6v6'],
    'sharp-right': ['M8 21V8l10 10', 'M18 12v6h-6'],
    'sharp-left': ['M16 21V8L6 18', 'M6 12v6h6'],
    uturn: ['M16 21V10a5 5 0 0 0-10 0v8', 'M2.5 14.5 6 18l3.5-3.5'],
  };
  if (kind === 'arrive') return <Flag className={className} aria-hidden />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {kind === 'depart' && <circle cx="12" cy="20" r="2.2" fill="currentColor" stroke="none" />}
      {paths[kind].map((d) => <path key={d} d={d} />)}
    </svg>
  );
};

export const glyphOf = (step: RouteStep): Glyph => (step.kind === 'turn' ? step.turn ?? 'straight' : step.kind);

/** Voice prompts with the browser's own speech synthesis (Web Speech API). */
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const VOICE_KEY = 'mac_route_voice';
const readVoicePref = () => { try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; } };

const WELCOME = '欢迎使用MAC导航';
const FAREWELL = '导航结束，欢迎下次使用';

/** Speak `text`; by default it interrupts whatever is playing, `queue` plays it after. */
function speak(text: string, queue = false) {
  if (!canSpeak) return;
  const synth = window.speechSynthesis;
  if (!queue) synth.cancel(); // a new step interrupts the previous prompt
  const utterance = new SpeechSynthesisUtterance(text.replace(/\s+/g, ''));
  utterance.lang = 'zh-CN';
  utterance.rate = 1.05;
  const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase().startsWith('zh-cn'))
    ?? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('zh'));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}

interface RouteGuidanceProps {
  steps: RouteStep[];
  index: number;
  names: RouteNames;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onOverview: () => void;
  /** Whole route in view (toggle state of the overview button). */
  overview?: boolean;
  onRecenter: () => void;
  onShowDestination: () => void;
}

/**
 * Step-by-step guidance, after Apple / Google Maps walking navigation:
 * a maneuver banner (next turn, distance to it, landmark, and a "then …" preview
 * when the following turn comes soon) and a bottom bar with remaining distance,
 * progress and step controls. Swipe the banner or use ← / → to change step.
 */
export const RouteGuidance: React.FC<RouteGuidanceProps> = ({
  steps, index, names, onPrev, onNext, onEnd, onOverview, onRecenter, onShowDestination, overview = false,
}) => {
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const last = steps.length - 1;
  const arrived = index >= last;
  const current = steps[Math.min(index, last)];
  const next = steps[Math.min(index + 1, last)];
  const after = steps[index + 2];
  const nextText = stepText(next, names);
  const showThen = !arrived && after && next.legM < 18 && next.kind !== 'arrive' && !next.enteringDestination;
  const legs = last;
  const remaining = arrived ? 0 : current.remainingM;

  // Voice: read each step out when it comes up (on by default; the choice is remembered).
  const [voice, setVoice] = useState(readVoicePref);
  const spoken = arrived
    ? `已到达${names.to}`
    : `${index === 0 && current.heading ? `从${names.from}出发，向${current.heading}走。` : ''}${metres(current.legM)}后，${nextText.primary}`;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const arrivedRef = useRef(arrived);
  arrivedRef.current = arrived;
  const greeted = useRef(false);
  useEffect(() => {
    if (!voice) return;
    if (!greeted.current) {
      // Starting guidance: greet first, then the first step.
      greeted.current = true;
      speak(WELCOME);
      speak(spoken, true);
      return;
    }
    speak(spoken);
  }, [voice, spoken]);
  // Leaving guidance (✕, 完成, 查看房间, Esc): say goodbye instead of cutting off mid-sentence.
  useEffect(() => () => {
    if (!canSpeak) return;
    // After arriving, let "已到达…" finish first; mid-route, end at once.
    if (voiceRef.current) speak(FAREWELL, arrivedRef.current);
    else window.speechSynthesis.cancel();
  }, []);
  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    try { localStorage.setItem(VOICE_KEY, next ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (!next && canSpeak) window.speechSynthesis.cancel();
  };

  const onPointerDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? onNext : onPrev)();
  };

  return (
    <>
      {/* Maneuver banner */}
      <section
        data-route-banner
        aria-label="导航指引"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="animate-rise absolute z-40 touch-pan-y select-none overflow-hidden rounded-[22px] bg-ink text-white shadow-[0_24px_48px_-20px_rgb(24_32_46/0.7)]
          left-4 top-4 w-[420px] lg:left-6 lg:top-6 max-sm:inset-x-3 max-sm:top-3 max-sm:w-auto"
      >
        <div key={index} className="animate-fade flex items-center gap-4 py-4 pl-5 pr-12" aria-live="polite" aria-atomic="true">
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${arrived ? 'bg-flare' : 'bg-white/10'}`}>
            {arrived ? <Check className="h-8 w-8" aria-hidden /> : <ManeuverIcon kind={glyphOf(next)} className="h-9 w-9" />}
          </div>
          <div className="min-w-0 flex-1">
            {arrived ? (
              <>
                <p className="text-[13px] text-white/60">已到达</p>
                <p className="mt-0.5 text-[19px] font-semibold leading-snug">{names.to}</p>
              </>
            ) : (
              <>
                <p className="text-[26px] font-semibold leading-none tracking-[-0.02em]">
                  {metres(current.legM)}<span className="ml-1 text-[14px] font-medium tracking-normal text-white/60">后</span>
                </p>
                <p className="mt-1.5 text-[17px] font-semibold leading-snug">{nextText.primary}</p>
                {index === 0 && current.heading && (
                  <p className="mt-1 text-[12.5px] text-white/60">{`从${spaced(names.from)}出发，先向${current.heading}走${current.area === 'ring' ? '，沿环廊' : ''}`.trim()}</p>
                )}
                {index > 0 && current.area === 'ring' && <p className="mt-1 text-[12.5px] text-white/60">沿环廊走</p>}
              </>
            )}
          </div>
        </div>
        {canSpeak && (
          <button
            type="button"
            onClick={toggleVoice}
            onPointerDown={(e) => e.stopPropagation()}
            aria-pressed={voice}
            aria-label={voice ? '关闭语音播报' : '开启语音播报'}
            title={voice ? '关闭语音播报' : '开启语音播报'}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          >
            {voice ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
          </button>
        )}
        {showThen && (
          <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.06] px-5 py-2 text-[13px] text-white/80">
            <ManeuverIcon kind={glyphOf(after)} className="h-4 w-4" />
            {thenText(after, names)}
          </div>
        )}
      </section>

      {/* Progress and controls */}
      <section
        data-route-bar
        aria-label="导航控制"
        className="glass animate-rise absolute z-40 rounded-[22px] px-4 pb-4 pt-3.5
          bottom-6 left-1/2 w-[440px] -translate-x-1/2 max-sm:inset-x-3 max-sm:bottom-3 max-sm:w-auto max-sm:translate-x-0"
      >
        <div className="flex items-baseline justify-between gap-3 px-1">
          {arrived ? (
            <p className="text-[15px] font-semibold text-ink">路线结束</p>
          ) : (
            <p className="text-[15px] font-semibold text-ink">
              剩余 {metres(remaining)}<span className="mx-1.5 text-dust">·</span><span className="font-medium text-ink-soft">约 {walkMinutes(remaining)} 分钟</span>
            </p>
          )}
          <p className="text-[12px] tabular-nums text-crater">{arrived ? `共 ${legs} 段` : `第 ${index + 1} / ${legs} 段`}</p>
        </div>
        <div className="mt-2.5 flex gap-1 px-1" aria-hidden>
          {Array.from({ length: legs }, (_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < index ? 'bg-ink/35' : i === index ? 'bg-flare' : 'bg-ink/10'}`} />
          ))}
        </div>
        <div className="mt-3.5 flex items-center gap-2">
          <button type="button" onClick={onEnd} aria-label="结束导航" title="结束导航 (Esc)" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink-soft hover:text-ink">
            <X className="h-4.5 w-4.5" />
          </button>
          {arrived ? (
            <>
              <button type="button" onClick={onPrev} aria-label="上一步" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink-soft hover:text-ink"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={onShowDestination} className="h-11 flex-1 rounded-full bg-white text-[14px] font-medium text-ink hover:bg-white/80">查看房间</button>
              <button type="button" onClick={onEnd} className="h-11 flex-1 rounded-full bg-flare text-[14px] font-semibold text-white hover:bg-ember">完成</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onPrev} disabled={index === 0} aria-label="上一步" title="上一步 (←)" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink-soft hover:text-ink disabled:opacity-35">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={onNext} title="下一步 (→)" className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-flare text-[14px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(211_84_0/0.8)] hover:bg-ember">
                {index + 1 >= last ? '到达' : '下一步'}<ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={onRecenter} aria-label="回到当前这一段" title="回到当前这一段" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink-soft hover:text-ink">
                <LocateFixed className="h-4.5 w-4.5" />
              </button>
              <button type="button" onClick={onOverview} aria-pressed={overview} aria-label="查看全程" title={overview ? '回到当前这一段' : '查看全程'} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${overview ? 'bg-ink text-white' : 'bg-white text-ink-soft hover:text-ink'}`}>
                <Route className="h-4.5 w-4.5" />
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
};
