/** Fades out the static startup screen written in index.html. */
export function dismissBootSplash() {
  const el = document.getElementById('boot-splash');
  if (!el || el.dataset.state === 'gone') return;
  el.dataset.state = 'gone';
  window.setTimeout(() => el.remove(), 650);
}
