import React, { useState } from 'react';
import { BookOpen, Coffee, Hammer, MessagesSquare, Search, Snowflake, VolumeX, Wind } from 'lucide-react';
import { recommendCampusSpots, RecommendationQuery, SpotRecommendation } from '../../services/recommendation';
import { Dialog } from './Dialog';
import { displayCode, displayName } from './format';

interface FindMySpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSpace: (spaceId: string) => void;
}

const INTENTS: Array<{ intent: RecommendationQuery['intent']; label: string; icon: typeof VolumeX }> = [
  { intent: 'quiet', label: '安静自习', icon: VolumeX },
  { intent: 'group', label: '小组讨论', icon: MessagesSquare },
  { intent: 'read', label: '一个人读书', icon: BookOpen },
  { intent: 'maker', label: '动手做东西', icon: Hammer },
  { intent: 'cool', label: '凉快一点', icon: Snowflake },
  { intent: 'ventilated', label: '空气好', icon: Wind },
  { intent: 'relax', label: '课间放松', icon: Coffee },
];

export const FindMySpotModal: React.FC<FindMySpotModalProps> = ({ isOpen, onClose, onSelectSpace }) => {
  const [intent, setIntent] = useState<RecommendationQuery['intent']>('quiet');
  const [text, setText] = useState('');
  const [results, setResults] = useState<SpotRecommendation[]>(() => recommendCampusSpots({ intent: 'quiet' }));

  const run = (next: RecommendationQuery['intent'], keyword?: string) => {
    setIntent(next);
    setResults(recommendCampusSpots({ intent: next, customKeyword: keyword }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title="找一个适合的地方" description="说说你想做什么，我们从开放的校园空间里挑出合适的。">
      <div className="px-7">
        <form
          onSubmit={(e) => { e.preventDefault(); if (text.trim()) run('custom', text.trim()); }}
          className="flex h-12 items-center gap-2 rounded-full border hairline bg-white pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-flare/40"
        >
          <Search className="h-4 w-4 shrink-0 text-dust" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例如：采光好、能做模型的地方"
            aria-label="描述你想找的地方"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-dust"
          />
          <button type="submit" className="h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink-soft disabled:opacity-40" disabled={!text.trim()}>
            匹配
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="常见需求">
          {INTENTS.map(({ intent: id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => run(id)}
              aria-pressed={intent === id}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                intent === id ? 'bg-flare text-white' : 'border hairline bg-white/70 text-ink-soft hover:bg-white hover:text-ink'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-quiet mt-5 flex-1 overflow-y-auto border-t hairline px-7 py-4">
        {results.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-ink-soft">没有找到合适的开放空间。换个说法，或者试试上面的常见需求。</p>
        ) : (
          <ol className="divide-y divide-ink/10">
            {results.map((r) => (
              <li key={r.space.id} className="flex items-start gap-4 py-4">
                <div className="w-16 shrink-0 pt-0.5">
                  <div className="wordmark text-[13px] font-semibold text-ink">{displayCode(r.space.id)}</div>
                  <div className="mt-2 h-1 rounded-full bg-regolith" aria-hidden="true">
                    <div className="h-1 rounded-full bg-flare" style={{ width: `${r.score}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-crater">匹配 {r.score}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink">{displayName(r.space)}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{r.matchReason}</p>
                  <p className="mt-1.5 text-[12px] text-crater">{r.environmentalHighlight}{r.featuresHighlight.length ? `；${r.featuresHighlight.join('、')}` : ''}</p>
                </div>
                <button
                  onClick={() => { onSelectSpace(r.space.id); onClose(); }}
                  className="shrink-0 rounded-full border hairline bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-white hover:text-ink"
                >
                  在地图上看
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="border-t hairline px-7 py-3 text-[12px] text-dust">推荐基于演示环境数据和房间设施，只包含开放空间。</p>
    </Dialog>
  );
};
