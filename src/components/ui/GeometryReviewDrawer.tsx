import React from 'react';
import { X, CheckCircle, AlertTriangle, Layers, Grid, Compass, FileText } from 'lucide-react';

interface GeometryReviewDrawerProps {
  isOpen: boolean;
  showNavGraph: boolean;
  showGrid: boolean;
  showSourceOverlay: boolean;
  onClose: () => void;
  onToggleNavGraph: () => void;
  onToggleGrid: () => void;
  onToggleSourceOverlay: () => void;
}

export const GeometryReviewDrawer: React.FC<GeometryReviewDrawerProps> = ({
  isOpen,
  showSourceOverlay,
  onClose,
  onToggleNavGraph,
  onToggleGrid,
  onToggleSourceOverlay,
}) => {
  if (!isOpen) return null;

  return (
    <aside className="absolute top-16 left-6 bottom-6 z-30 w-[420px] max-w-[calc(100vw-3rem)] bg-white/95 backdrop-blur-md border border-neutral-200/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left duration-200">
      {/* Header */}
      <div className="p-5 border-b border-neutral-200/80 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>空间事实校准审计 · GEOMETRY REVIEW</span>
          </div>
          <h2 className="text-base font-bold text-neutral-900 tracking-tight">
            图纸对照与空间几何校验
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-neutral-600">
        {/* Source Drawing Metadata */}
        <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-800">权威源图纸出处</span>
            <span className="font-mono text-[11px] text-neutral-400">FF-01 (1:300)</span>
          </div>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            广州亚泰建筑设计院有限公司 · 总平面布置图 (FIXTURE/FURNISHING PLAN)
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
            <div className="p-2 bg-white rounded border border-neutral-200">
              <span className="text-neutral-400 block">横向跨度 (1~18轴)</span>
              <strong className="text-neutral-800">134,100 mm</strong>
            </div>
            <div className="p-2 bg-white rounded border border-neutral-200">
              <span className="text-neutral-400 block">纵向跨度 (A~Q轴)</span>
              <strong className="text-neutral-800">115,800 mm</strong>
            </div>
          </div>
        </div>

        {/* Floor Integrity Rule (Strictly No Fabricated Floors) */}
        <div>
          <h3 className="font-semibold text-neutral-800 mb-2">楼层核验状态 (Floor Availability)</h3>
          <div className="space-y-1.5">
            <div className="p-2.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-semibold">FF-01 总平面布置层</div>
                  <div className="text-[11px] text-emerald-700">单层图纸已读取；房间锚点已提取，边界待校准</div>
                </div>
              </div>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-200/60 font-semibold">
                PARTIAL
              </span>
            </div>

            <div className="p-2.5 bg-neutral-100 text-neutral-500 border border-neutral-200 rounded-lg flex items-center justify-between opacity-75">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-neutral-400 shrink-0" />
                <div>
                  <div className="font-medium text-neutral-700">其他楼层 (F2 / F3 / B1)</div>
                  <div className="text-[11px]">本次图纸集未提供对应施工图，禁止凭空臆造</div>
                </div>
              </div>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">
                NOT AVAILABLE
              </span>
            </div>
          </div>
        </div>

        {/* Geometric Overlay Toggles */}
        <div>
          <h3 className="font-semibold text-neutral-800 mb-2">图纸源数据与空间状态</h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between p-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl border border-neutral-200 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <Grid className="w-4 h-4 text-neutral-600" />
                <div>
                  <div className="font-medium text-neutral-800">轴网尺寸链校验</div>
                  <div className="text-[11px] text-neutral-400">总尺寸比例已核对；外墙轮廓尚未描线</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked
                disabled
                onChange={onToggleGrid}
                className="w-4 h-4 accent-neutral-900 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl border border-neutral-200 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <Compass className="w-4 h-4 text-neutral-600" />
                <div>
                  <div className="font-medium text-neutral-800">室内导航暂停</div>
                  <div className="text-[11px] text-neutral-400">门洞和可通行区域尚未确认，暂不展示路线</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={false}
                disabled
                onChange={onToggleNavGraph}
                className="w-4 h-4 accent-neutral-900 rounded"
              />
            </label>
            <label className="flex items-center justify-between p-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl border border-neutral-200 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-neutral-600" />
                <div>
                  <div className="font-medium text-neutral-800">FF-01 原始图纸底图</div>
                  <div className="text-[11px] text-neutral-400">全页原图固定显示；尚未生成可比较的重建墙线</div>
                </div>
              </div>
              <input type="checkbox" checked disabled onChange={onToggleSourceOverlay} className="w-4 h-4 accent-neutral-900 rounded" />
            </label>
          </div>
        </div>

        {/* Audit Verification Log */}
        <div>
          <h3 className="font-semibold text-neutral-800 mb-2">空间审计核验清单</h3>
          <ul className="space-y-1.5 text-[11px] text-neutral-600">
            <li className="flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" /><span>莲花球场在源图中为矩形场地、两侧看台和不规则环状空间；当前 3D 尺寸尚未与图纸配准。</span></li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>房间编号锚点来自 PDF 文字位置；房间多边形、墙段及门洞目前仍为示意几何。</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>墙体高度为示意值；当前房间边界和通道未完成 CAD 线段追踪。</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>路网仍未验证连通性与穿墙情况，导航功能现已暂停。</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>隐私合规：护士站、心理咨询等非公共空间不公开实时人头数，守卫师生隐私。</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 bg-neutral-50 border-t border-neutral-200/80 flex items-center justify-between text-xs text-neutral-500">
        <span>编号锚点: Derived · 边界: Illustrative</span>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-700 font-medium transition-colors"
        >
          收起面板
        </button>
      </div>
    </aside>
  );
};
