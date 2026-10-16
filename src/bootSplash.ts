declare global {
  interface Window { __bootNameAt?: number }
}

/** Status line of the startup screen (read by screen readers; not shown). */
export function setBootStage(text: string) {
  const hint = document.querySelector<HTMLElement>('#boot-splash .hint');
  if (hint && hint.textContent !== text) hint.textContent = text;
}

/** How long the name gets to fade in before the screen may leave, so a fast load never just flashes it. */
const NAME_MIN_MS = 900;

/** Dissolves the startup screen into the page underneath. Resolves when the fade begins. */
export function dismissBootSplash(): Promise<void> {
  const el = document.getElementById('boot-splash');
  if (!el || el.dataset.state === 'gone') return Promise.resolve();
  if (leaving) return leaving;
  el.dataset.state = 'leaving';
  const started = window.__bootNameAt ?? performance.now();
  const wait = Math.max(0, started + NAME_MIN_MS - performance.now());
  leaving = new Promise((resolve) => {
    window.setTimeout(() => {
      el.dataset.state = 'gone';
      window.setTimeout(() => el.remove(), 750);
      resolve();
    }, wait);
  });
  return leaving;
}
let leaving: Promise<void> | null = null;
