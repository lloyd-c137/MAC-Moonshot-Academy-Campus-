import type { DisplayViewModel } from './model';
import type { DisplayProfile } from './profiles';

const esc = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const stateText: Record<DisplayViewModel['state'], string> = {
  before: '课前', in_class: '正在上课', between: '课间', finished: '今日课程结束', no_classes: '今日无模拟排课',
  out_of_scope: '不在模拟范围', unavailable: '数据不可用', stale: '数据已过期',
};

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const part of text.split(/\s+/)) {
    const candidate = line ? `${line} ${part}` : part;
    if (candidate.length <= maxChars) line = candidate;
    else {
      if (line) lines.push(line);
      if (part.length > maxChars) {
        for (let i = 0; i < part.length; i += maxChars) lines.push(part.slice(i, i + maxChars));
        line = '';
      } else line = part;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export function renderDisplaySvg(view: DisplayViewModel, profile: DisplayProfile): string {
  const { width: w, height: h } = profile;
  const pad = Math.round(w * 0.035);
  const headerBottom = Math.round(h * 0.19);
  const footerTop = h - Math.round(h * 0.075);
  const warning = view.dataState !== 'valid';
  const multi = view.rows.length > 8;
  const columnCount = multi ? 2 : 1;
  const colGap = Math.round(w * 0.035);
  const colWidth = (w - pad * 2 - colGap * (columnCount - 1)) / columnCount;
  const rowsPerColumn = Math.ceil(view.rows.length / columnCount);
  const availableH = footerTop - headerBottom - 14;
  const rowH = view.rows.length ? Math.min(multi ? 56 : 48, availableH / rowsPerColumn) : 52;
  const rowFont = multi ? Math.max(13, Math.min(18, rowH * 0.29)) : Math.max(16, Math.min(22, rowH * 0.39));
  const timeFont = Math.max(12, Math.min(16, rowFont * 0.78));
  const children: string[] = [];
  children.push(`<rect width="${w}" height="${h}" fill="#fff"/>`);
  children.push(`<text x="${pad}" y="${Math.round(h * .085)}" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="${Math.round(h * .074)}" font-weight="700" fill="#000">${esc(view.roomId)}</text>`);
  const dateText = `${view.date} · Asia/Shanghai`;
  children.push(`<text x="${pad}" y="${Math.round(h * .14)}" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="${Math.round(h * .032)}" fill="#000">${esc(dateText)}</text>`);
  const badgeW = Math.round(w * .13);
  children.push(`<rect x="${w - pad - badgeW}" y="${Math.round(h * .047)}" width="${badgeW}" height="${Math.round(h * .055)}" fill="#000"/>`);
  children.push(`<text x="${w - pad - badgeW / 2}" y="${Math.round(h * .086)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(h * .031)}" font-weight="700" fill="#fff">${view.sourceMode === 'demo' ? 'DEMO' : 'LIVE'}</text>`);
  children.push(`<text x="${w - pad}" y="${Math.round(h * .14)}" text-anchor="end" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="${Math.round(h * .031)}" font-weight="700" fill="#000">${esc(stateText[view.state])}</text>`);
  if (warning) children.push(`<text x="${pad}" y="${headerBottom - 7}" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="14" fill="#000">⚠ ${esc(view.message ?? (view.state === 'stale' ? '请核对缓存数据' : '课程数据暂不可用'))}</text>`);
  children.push(`<path d="M${pad} ${headerBottom}H${w - pad}" stroke="#000" stroke-width="2"/>`);

  if (!view.rows.length) {
    const label = view.state === 'no_classes' ? '今日无 AP 模拟排课' : stateText[view.state];
    children.push(`<text x="${w / 2}" y="${(headerBottom + footerTop) / 2}" text-anchor="middle" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="26" font-weight="600" fill="#000">${esc(label)}</text>`);
  } else {
    view.rows.forEach((row, index) => {
      const col = multi ? Math.floor(index / rowsPerColumn) : 0;
      const rowIndex = multi ? index % rowsPerColumn : index;
      const x = pad + col * (colWidth + colGap);
      const y = headerBottom + 8 + rowIndex * rowH;
      const inset = Math.max(3, rowH * .08);
      if (row.emphasis === 'current') children.push(`<rect x="${x}" y="${y}" width="${colWidth}" height="${rowH - 2}" fill="#000"/>`);
      else if (row.emphasis === 'next') children.push(`<rect x="${x}" y="${y}" width="${colWidth}" height="${rowH - 2}" fill="#fff" stroke="#000" stroke-width="2"/>`);
      const color = row.emphasis === 'current' ? '#fff' : '#000';
      const baseline = y + Math.max(timeFont + inset, rowH * .42);
      children.push(`<text x="${x + inset}" y="${baseline}" font-family="Arial,sans-serif" font-size="${timeFont}" font-weight="700" fill="${color}">${esc(row.start)}–${esc(row.end)}</text>`);
      const note = row.noteText ? ` · ${row.noteText}` : '';
      const title = `${row.title}${note}`;
      const textX = x + inset;
      let titleFont = rowFont;
      let maxChars = Math.max(8, Math.floor((colWidth - inset * 2) / (titleFont * .92)));
      let titleLines = wrap(title, maxChars);
      while (titleLines.length * titleFont * 1.02 > rowH * .54 && titleFont > 9) {
        titleFont -= 1;
        maxChars = Math.max(8, Math.floor((colWidth - inset * 2) / (titleFont * .92)));
        titleLines = wrap(title, maxChars);
      }
      titleLines.forEach((line, lineIndex) => children.push(`<text x="${textX}" y="${baseline + titleFont * (lineIndex + 1.02)}" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="${titleFont}" font-weight="${row.emphasis === 'current' ? 700 : 500}" fill="${color}">${esc(line)}</text>`));
      children.push(`<path d="M${x} ${y + rowH - 1}H${x + colWidth}" stroke="#000" stroke-opacity=".26"/>`);
    });
  }
  children.push(`<path d="M${pad} ${footerTop}H${w - pad}" stroke="#000" stroke-width="2"/>`);
  const footer = view.dataState === 'valid' ? `FIXED DEMO · ${view.lastSuccessfulSync ? `同步 ${view.lastSuccessfulSync}` : '模拟课表 · 非实时占用'}` : `DATA ${view.dataState.toUpperCase()} · ${view.message ?? '未验证数据不作为实时课表'}`;
  children.push(`<text x="${pad}" y="${h - Math.round(h * .028)}" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="${Math.round(h * .025)}" fill="#000">${esc(footer)}</text>`);
  children.push(`<text x="${w - pad}" y="${h - Math.round(h * .028)}" text-anchor="end" font-family="Arial,'Noto Sans CJK SC',sans-serif" font-size="${Math.round(h * .025)}" fill="#000">不代表实际占用</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${children.join('')}</svg>`;
}
