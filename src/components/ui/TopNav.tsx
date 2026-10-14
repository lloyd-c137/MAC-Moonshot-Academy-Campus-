import React from 'react';
import { Search, Compass, Layers, Wind, Activity, Calendar, SlidersHorizontal, MapPin } from 'lucide-react';
import { MapLayerMode } from '../../types/campus';

interface TopNavProps {
  layerMode: MapLayerMode;
  searchQuery: string;
  reviewMode: boolean;
  onLayerChange: (mode: MapLayerMode) => void;
  onSearchChange: (query: string) => void;
  onOpenFindSpot: () => void;
  onToggleReviewMode: () => void;
  onOpenNavigation: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  layerMode,
  searchQuery,
  reviewMode,
  onLayerChange,
  onSearchChange,
  onOpenFindSpot,
  onToggleReviewMode,
  onOpenNavigation,
}) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-8 px-6 py-3 bg-white/85 backdrop-blur-md border-b border-neutral-200/80">
      {/* Zone 1: Single text element brand wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="/" className="text-base font-bold tracking-tight text-neutral-900 whitespace-nowrap">
          MAC <span className="font-normal text-neutral-400">·</span> 探月空间
        </a>
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="font-mono text-neutral-400">FF-01</span>
          <span aria-hidden="true">·</span>
          <span>北京探月学院</span>
        </div>
      </div>

      {/* Zone 2: Universal Search & Primary Layer Controls */}
      <div className="flex-1 max-w-2xl flex items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索教室、书院、餐厅、实验室或正在发生的事..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-neutral-100/80 hover:bg-neutral-100 focus:bg-white border border-transparent focus:border-neutral-300 rounded-lg outline-none transition-colors"
          />
        </div>

        {/* Map Layers Segmented Control */}
        <div className="hidden md:flex items-center gap-1 p-0.5 bg-neutral-100 rounded-lg border border-neutral-200/50">
          <button
            onClick={() => onLayerChange('explore')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              layerMode === 'explore'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            探索
          </button>
          <button
            onClick={() => onLayerChange('spaces')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              layerMode === 'spaces'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            空间
          </button>
          <button
            onClick={() => onLayerChange('temperature')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              layerMode === 'temperature'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            环境
          </button>
          <button
            onClick={() => onLayerChange('pulse')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              layerMode === 'pulse'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            脉动
          </button>
          <button
            onClick={() => onLayerChange('events')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              layerMode === 'events'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            活动
          </button>
        </div>
      </div>

      {/* Zone 3: Primary Action & Review Mode Trigger */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onOpenNavigation}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200/80 rounded-lg transition-colors whitespace-nowrap"
        >
          <MapPin className="w-3.5 h-3.5" />
          室内导航
        </button>

        <button
          onClick={onOpenFindSpot}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-sm transition-colors whitespace-nowrap"
        >
          寻找空间
        </button>

        <button
          onClick={onToggleReviewMode}
          title="图纸对照与几何校准模式"
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
            reviewMode
              ? 'bg-amber-50 text-amber-900 border-amber-300'
              : 'text-neutral-600 hover:text-neutral-900 border-neutral-200 hover:bg-neutral-100'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">图纸对照</span>
        </button>
      </div>
    </header>
  );
};
