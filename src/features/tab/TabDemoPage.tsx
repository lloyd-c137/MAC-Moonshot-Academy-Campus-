import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { loadFixedScheduleAdapter } from './data/fixedSchedule';
import { TabScheduleWorkspace } from './TabScheduleWorkspace';
import type { FixedScheduleAdapter } from './schedule';

export const TabDemoPage: React.FC = () => {
  const [adapter, setAdapter] = useState<FixedScheduleAdapter | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadFixedScheduleAdapter().then((value) => { if (active) setAdapter(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : '演示课表数据暂时无法读取。');
    });
    return () => { active = false; };
  }, []);

  const room = new URLSearchParams(window.location.search).get('room');
  return (
    <main className="min-h-dvh bg-regolith px-4 pb-12 pt-5 text-ink sm:px-8 sm:pt-8">
      <div className="mx-auto max-w-[1440px]">
        <a href="/" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] text-crater transition-colors hover:bg-ink/[0.04] hover:text-ink">
          <ArrowLeft aria-hidden className="h-4 w-4" /> 回到校园地图
        </a>
        <header className="mt-6 max-w-3xl">
          <p className="text-[12px] font-semibold tracking-[0.12em] text-ember">DEMO · Asia/Shanghai · 2026-11-09—13</p>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.03em] sm:text-[42px]">Tab · AP 模拟课表</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-crater">固定演示数据用于验证课表状态与电子纸版式，不代表学校实际排课、实时占用或教室可用状态。</p>
        </header>
        {adapter ? <TabScheduleWorkspace data={adapter.data} initialRoomId={room} /> : (
          <section className="mt-8 rounded-[22px] border border-ink/10 bg-white p-6 sm:p-8" aria-live="polite">
            <p className="text-[12px] font-semibold text-crater">AP 演示课表数据</p>
            {error ? <><h2 className="mt-3 text-[20px] font-semibold">数据校验未通过</h2><pre className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-crater">{error}</pre></> : <p className="mt-3 text-[15px] text-ink-soft">正在加载并校验演示数据…</p>}
          </section>
        )}
        <footer className="mt-6 text-[11px] leading-relaxed text-dust">AP 模拟范围内外依据本演示文件标记。计划排课不代表实际有人；模拟状态不会修改 MAC 的传感器、占用或可预约数据。</footer>
      </div>
    </main>
  );
};
