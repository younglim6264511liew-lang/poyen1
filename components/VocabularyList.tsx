
import React from 'react';
import { VocabularyItem } from '../types';

interface VocabularyListProps {
  items: VocabularyItem[];
  onSelect: (item: VocabularyItem) => void;
  selectedId: string | null;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
  isSelectionMode?: boolean;
}

const VocabularyList: React.FC<VocabularyListProps> = ({ 
  items, 
  onSelect, 
  selectedId, 
  selectedIds = [], 
  onToggleSelect,
  onLongPress,
  isSelectionMode = false
}) => {
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  const handleStart = (id: string) => {
    if (isSelectionMode) return;
    longPressTimer.current = setTimeout(() => {
      if (onLongPress) onLongPress(id);
    }, 600);
  };

  const handleEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2">
          {isSelectionMode && onToggleSelect && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(item.id);
              }}
              className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                selectedIds.includes(item.id) 
                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                  : 'border-slate-200 hover:border-indigo-300'
              }`}
            >
              {selectedIds.includes(item.id) && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={4} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
            </button>
          )}
          <button
            onMouseDown={() => handleStart(item.id)}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={() => handleStart(item.id)}
            onTouchEnd={handleEnd}
            onClick={(e) => {
              e.stopPropagation();
              if (isSelectionMode && onToggleSelect) onToggleSelect(item.id);
              else onSelect(item);
            }}
            className={`flex-1 text-left p-4 rounded-xl transition-all duration-200 border-2 flex items-start gap-3 ${
              selectedId === item.id && !isSelectionMode
                ? 'border-indigo-500 bg-indigo-50 shadow-md'
                : selectedIds.includes(item.id) && isSelectionMode
                ? 'border-indigo-300 bg-indigo-50/50'
                : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
            }`}
          >
          <span className="text-[10px] font-black text-slate-300 mt-1.5 min-w-[1.25rem] text-right shrink-0">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0"> {/* min-w-0 helps with text truncation inside flex */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="flex-1 min-w-0">
                <span className="text-lg font-bold text-slate-800 block truncate">{item.word}</span>
                {item.pronunciation && (
                  <span className="text-xs text-slate-400 font-mono block truncate">[{item.pronunciation}]</span>
                )}
              </div>
              <span className="shrink-0 px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 uppercase font-bold">
                {item.partOfSpeech || 'n.'}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1 truncate">{item.chineseTranslation}</p>
          </div>
        </button>
      </div>
      ))}
    </div>
  );
};

export default VocabularyList;
