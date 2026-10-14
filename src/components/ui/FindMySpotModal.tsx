import React, { useState } from 'react';
import { X, Sparkles, MapPin, ArrowRight, Check, Compass } from 'lucide-react';
import { recommendCampusSpots, SpotRecommendation, RecommendationQuery } from '../../services/recommendation';
import { CampusSpace } from '../../types/campus';

interface FindMySpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSpace: (spaceId: string) => void;
}

const PRESET_QUERIES: { label: string; intent: RecommendationQuery['intent']; desc: string }[] = [
  { label: '寻找安静自习角落', intent: 'quiet', desc: '绝对安静自习室与专注学习区域' },
  { label: '三五好友小组研讨', intent: 'group', desc: '允许交流且配备白板的讨论室与书院' },
  { label: '找个温度偏凉爽的房间', intent: 'cool', desc: '实时温度在 22°C 左右的清爽环境' },
  { label: '新风与通风极佳的空间', intent: 'ventilated', desc: 'CO₂ 低于 550ppm 或天然露天中庭' },
  { label: '一个人静心阅读', intent: 'read', desc: '学术大阅览室与静谧阅读书架' },
  { label: '动手做实验与造物', intent: 'maker', desc: '配备仪器与原型的创客工坊与实验室' },
  { label: '课间身心放松', intent: 'relax', desc: '中庭阳光绿植与茶室小憩' },
];

export const FindMySpotModal: React.FC<FindMySpotModalProps> = ({ isOpen, onClose, onSelectSpace }) => {
  const [selectedIntent, setSelectedIntent] = useState<RecommendationQuery['intent']>('quiet');
  const [customQuery, setCustomQuery] = useState('');
  const [results, setResults] = useState<SpotRecommendation[]>(() =>
    recommendCampusSpots({ intent: 'quiet' })
  );

  if (!isOpen) return null;

  const handleQuery = (intent: RecommendationQuery['intent'], customKw?: string) => {
    setSelectedIntent(intent);
    const recs = recommendCampusSpots({ intent, customKeyword: customKw });
    setResults(recs);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuery.trim()) return;
    handleQuery('custom', customQuery.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-neutral-200/80">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
                <Compass className="w-4 h-4 text-neutral-700" />
                <span>智能空间意图匹配 · 仅基于真实图纸空间</span>
              </div>
              <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                寻找我的专属角落 (Find My Spot)
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Custom Search Form */}
          <form onSubmit={handleCustomSubmit} className="mt-4 flex gap-2">
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="用自然语言描述你想找什么地方（例如：“找个采光好可以做模型的工坊”）..."
              className="flex-1 px-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:border-neutral-400 outline-none transition-colors"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors whitespace-nowrap"
            >
              智能匹配
            </button>
          </form>

          {/* Preset Intent Chips */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset.intent}
                onClick={() => handleQuery(preset.intent)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  selectedIntent === preset.intent
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                    : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5 divide-y divide-neutral-100">
          <div className="text-xs font-medium text-neutral-500 pb-1">
            为你匹配到 {results.length} 个开放且符合物理条件的校园空间：
          </div>

          {results.map((item, idx) => (
            <div
              key={item.space.id}
              className="pt-3.5 first:pt-0 flex items-start justify-between gap-4 group"
            >
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-neutral-900">
                    {item.space.id}
                  </span>
                  <span aria-hidden="true" className="text-neutral-300">·</span>
                  <h3 className="text-sm font-bold text-neutral-900 group-hover:text-amber-700 transition-colors">
                    {item.space.name}
                  </h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    匹配度 {item.score}%
                  </span>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed">
                  <strong className="font-semibold text-neutral-800">推荐理由：</strong>
                  {item.matchReason}
                </p>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 pt-0.5">
                  <span>微气候: {item.environmentalHighlight}</span>
                  <span aria-hidden="true">·</span>
                  <span>设施: {item.featuresHighlight.join(' / ')}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  onSelectSpace(item.space.id);
                  onClose();
                }}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200/80 rounded-lg transition-colors whitespace-nowrap mt-1"
              >
                <span>在地图中查看</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {results.length === 0 && (
            <div className="p-8 text-center text-xs text-neutral-500">
              未找到匹配的开放空间，建议尝试切换其他筛选意图。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
