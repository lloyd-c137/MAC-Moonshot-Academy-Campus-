import React, { useState } from 'react';
import { X, Image as ImageIcon, CheckCircle, Info } from 'lucide-react';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { saveMoment } from '../../data/mockMoments';
import { CampusMoment } from '../../types/campus';

interface AddMomentModalProps {
  isOpen: boolean;
  defaultSpaceId?: string;
  onClose: () => void;
  onMomentAdded: (newMoment: CampusMoment) => void;
}

export const AddMomentModal: React.FC<AddMomentModalProps> = ({
  isOpen,
  defaultSpaceId,
  onClose,
  onMomentAdded,
}) => {
  const [spaceId, setSpaceId] = useState<string>(defaultSpaceId || 'M104');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<CampusMoment['category']>('memory');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const targetSpace = CAMPUS_SPACES.find((s) => s.id === spaceId);
    const saved = saveMoment({
      spaceId,
      spaceName: targetSpace?.name || spaceId,
      author: author.trim() || '探月学子',
      date: new Date().toISOString().split('T')[0],
      content: content.trim(),
      category,
      imageUrl: previewUrl || undefined,
    });

    setIsSuccess(true);
    setTimeout(() => {
      onMomentAdded(saved);
      setIsSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-neutral-200/80 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-neutral-900">
              为校园空间留下记忆 (Campus Time Capsule)
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              分享你的项目故事、自习灵感或温暖瞬间
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Local Storage Disclosure Banner */}
        <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-200/60 flex items-center gap-2 text-xs text-neutral-500">
          <Info className="w-4 h-4 text-neutral-400 shrink-0" />
          <span>保存范围提示：第一阶段记忆内容持久化在当前浏览器本地存储 (LocalStorage)。</span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-neutral-700 mb-1 block">
              关联空间地点
            </label>
            <select
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
            >
              {CAMPUS_SPACES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-700 mb-1 block">
                你的称呼 (选填)
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="例如: 2026届 Alex"
                className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-700 mb-1 block">
                记忆类别
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
              >
                <option value="memory">校园记忆 (Memory)</option>
                <option value="student_project">项目造物 (Project)</option>
                <option value="daily_snap">日常打卡 (Daily)</option>
                <option value="event_highlight">活动高光 (Event)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 mb-1 block">
              故事与短注 (Short Note)
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="记录在这个空间发生的事情、讨论的课题或留下的情绪..."
              required
              className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 mb-1 block">
              上传图片/作品实拍 (Photo / Video Preview)
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer transition-colors">
                <ImageIcon className="w-4 h-4" />
                <span>选择本地图片</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {previewUrl && (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-neutral-200">
                  <img src={previewUrl} alt="预览" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPreviewUrl(null)}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-800 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSuccess || !content.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
            >
              {isSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>已保存到本地记忆库</span>
                </>
              ) : (
                <span>存入时光胶囊</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
