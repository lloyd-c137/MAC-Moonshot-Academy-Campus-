import React, { useEffect, useState } from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { saveMoment } from '../../data/mockMoments';
import type { CampusMoment } from '../../types/campus';
import { Dialog } from './Dialog';
import { displayCode, displayName } from './format';

interface AddMomentModalProps {
  isOpen: boolean;
  defaultSpaceId?: string;
  onClose: () => void;
  onMomentAdded: (newMoment: CampusMoment) => void;
}

const CATEGORIES: Array<{ id: CampusMoment['category']; label: string }> = [
  { id: 'memory', label: '一段回忆' },
  { id: 'student_project', label: '一个作品' },
  { id: 'daily_snap', label: '日常一刻' },
  { id: 'event_highlight', label: '活动现场' },
];

const field = 'w-full rounded-[12px] border hairline bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-shadow placeholder:text-dust focus:ring-2 focus:ring-flare/40';

export const AddMomentModal: React.FC<AddMomentModalProps> = ({ isOpen, defaultSpaceId, onClose, onMomentAdded }) => {
  const [spaceId, setSpaceId] = useState(defaultSpaceId || 'M104');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<CampusMoment['category']>('memory');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Each opening starts from the room it was opened for.
  useEffect(() => {
    if (!isOpen) return;
    setSpaceId(defaultSpaceId || 'M104');
    setContent('');
    setPreviewUrl(null);
    setSaved(false);
  }, [isOpen, defaultSpaceId]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    const space = CAMPUS_SPACES.find((s) => s.id === spaceId);
    const moment = saveMoment({
      spaceId,
      spaceName: space ? displayName(space) : spaceId,
      author: author.trim() || '探月学子',
      date: new Date().toISOString().split('T')[0],
      content: content.trim(),
      category,
      imageUrl: previewUrl || undefined,
    });
    setSaved(true);
    window.setTimeout(() => { onMomentAdded(moment); onClose(); }, 700);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title="留下回忆" description="写下在这里发生的事。回忆只保存在这台设备的浏览器里。" width="max-w-[560px]">
      <form onSubmit={submit} className="scroll-quiet flex-1 space-y-5 overflow-y-auto px-7 pb-6">
        <label className="block">
          <span className="text-[13px] font-medium text-ink">地点</span>
          <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={`${field} mt-1.5`}>
            {CAMPUS_SPACES.map((s) => (
              <option key={s.id} value={s.id}>{displayCode(s.id)}  {displayName(s)}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-[13px] font-medium text-ink">这是</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${category === c.id ? 'bg-ink text-white' : 'border hairline bg-white/70 text-ink-soft hover:bg-white'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-[13px] font-medium text-ink">内容</span>
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="那天在这里，我们……"
            required
            className={`${field} mt-1.5 resize-none leading-relaxed`}
          />
        </label>

        <div className="flex items-end gap-4">
          <label className="block flex-1">
            <span className="text-[13px] font-medium text-ink">署名 <span className="font-normal text-dust">可不填</span></span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="例如：2026 届 Alex" className={`${field} mt-1.5`} />
          </label>
          {previewUrl ? (
            <div className="relative h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[12px]">
              <img src={previewUrl} alt="已选图片" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setPreviewUrl(null)} aria-label="移除图片" className="absolute right-0.5 top-0.5 rounded-full bg-ink/70 p-0.5 text-white"><X className="h-3 w-3" /></button>
            </div>
          ) : (
            <label className="flex h-[46px] shrink-0 cursor-pointer items-center gap-2 rounded-[12px] border border-dashed border-haze px-3.5 text-[13px] text-ink-soft hover:bg-white">
              <ImagePlus className="h-4 w-4" />添加图片
              <input type="file" accept="image/*" onChange={onFile} className="sr-only" />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 rounded-full px-5 text-[14px] font-medium text-ink-soft hover:bg-white">取消</button>
          <button
            type="submit"
            disabled={saved || !content.trim()}
            className="flex h-11 items-center gap-2 rounded-full bg-flare px-6 text-[14px] font-semibold text-white transition-colors hover:bg-ember disabled:opacity-40"
          >
            {saved ? (<><Check className="h-4 w-4" />已保存</>) : '保存回忆'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
