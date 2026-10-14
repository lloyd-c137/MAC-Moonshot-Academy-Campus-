import React from 'react';
import { X, CheckCircle, AlertTriangle, Layers, Grid, Compass, FileText, ExternalLink } from 'lucide-react';

interface GeometryReviewDrawerProps {
  isOpen: boolean;
  showNavGraph: boolean;
  showGrid: boolean;
  onClose: () => void;
  onToggleNavGraph: () => void;
  onToggleGrid: () => void;
}

export const GeometryReviewDrawer: React.FC<GeometryReviewDrawerProps> = ({
  isOpen,
  showNavGraph,
  showGrid,
  onClose,
  onToggleNavGraph,
  onToggleGrid,
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
                  <div className="text-[11px] text-emerald-700">图纸事实已提取并完全重建</div>
                </div>
              </div>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-200/60 font-semibold">
                ACTIVE
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
          <h3 className="font-semibold text-neutral-800 mb-2">3D 视图校验图层叠加</h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between p-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl border border-neutral-200 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <Grid className="w-4 h-4 text-neutral-600" />
                <div>
                  <div className="font-medium text-neutral-800">1-18 轴 & A-Q 轴网线</div>
                  <div className="text-[11px] text-neutral-400">8.4m 建筑承重柱网参考基准</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={onToggleGrid}
                className="w-4 h-4 accent-neutral-900 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl border border-neutral-200 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <Compass className="w-4 h-4 text-neutral-600" />
                <div>
                  <div className="font-medium text-neutral-800">无阻挡室内导航路网 (Topology)</div>
                  <div className="text-[11px] text-neutral-400">验证走廊节点与出入口无穿墙连线</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={showNavGraph}
                onChange={onToggleNavGraph}
                className="w-4 h-4 accent-neutral-900 rounded"
              />
            </label>
          </div>
        </div>

        {/* Audit Verification Log */}
        <div>
          <h3 className="font-semibold text-neutral-800 mb-2">空间审计核验清单</h3>
          <ul className="space-y-1.5 text-[11px] text-neutral-600">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>中央莲花球场：八面多边形轮廓、看台阶梯与中央比赛场地真实几何保留。</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>西侧 M 系列：一小步空间 M104、创客空间 M103、设计工作室 M102 及实验室群组定位精准。</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>环形 S 系列：赤子书院、上善书院、绝对安静自习室 S404/S405 与对话空间 S202。</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>东侧 A 系列：509.8m² 大餐厅 A114、A217 多功能厅、黑匣子小剧场及中庭天井花园。</span>
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
        <span>数据可信级别: Verified From Architectural Plan</span>
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
