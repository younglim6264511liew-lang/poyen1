
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { VocabularyItem } from '../types';

interface TestModeProps {
  items: VocabularyItem[];
  speak: (text: string, lang?: string, cancel?: boolean) => void;
  onUpdateWord: (updated: VocabularyItem) => void;
  mode?: 'en-zh' | 'zh-en';
}

const TestMode: React.FC<TestModeProps> = ({ items, speak, onUpdateWord, mode = 'en-zh' }) => {
  // 範圍選擇與設定狀態
  const [isRangeSet, setIsRangeSet] = useState(false);
  const [fromRange, setFromRange] = useState<string>(() => localStorage.getItem('lastFromRange') || '');
  const [toRange, setToRange] = useState<string>(() => localStorage.getItem('lastToRange') || '');
  const [scoreMode, setScoreMode] = useState<'default' | 'continue' | 'custom'>('default');
  const [customInitialScore, setCustomInitialScore] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);

  // 測驗 Session 狀態
  const [sessionPool, setSessionPool] = useState<(VocabularyItem & { sentences: { text: string, translation: string }[] })[]>([]);
  const [currentItem, setCurrentItem] = useState<(VocabularyItem & { sentences: { text: string, translation: string }[] }) | null>(null);
  const [revealStep, setRevealStep] = useState(0); // 0: 隱藏, 1: 單字+翻譯, 2+: 例句索引
  const [history, setHistory] = useState<string[]>([]); // 追蹤出題歷史
  const [lastFeedback, setLastFeedback] = useState<{ id: string, isCorrect: boolean } | null>(null); // 紀錄上一次的反饋以供撤銷
  const [isJustMastered, setIsJustMastered] = useState(false); // 是否剛好達到通關

  // 計算尚未達標的單字 (score <= 90)
  const pendingWords = useMemo(() => sessionPool.filter(w => w.score <= 90), [sessionPool]);
  const totalInPool = sessionPool.length;
  const masteredCount = totalInPool - pendingWords.length;

  // 進度百分比：以「全數達到 90 分」為 100% 目標
  const progressPercent = useMemo(() => {
    if (totalInPool === 0) return 0;
    const totalCurrentProgress = sessionPool.reduce((acc, i) => acc + Math.min(i.score, 90), 0);
    const targetProgress = totalInPool * 90;
    return Math.floor((totalCurrentProgress / targetProgress) * 100);
  }, [sessionPool, totalInPool]);

  // 抽題邏輯
  const pickNextWord = useCallback((pool: VocabularyItem[], currentHistory: string[]) => {
    const stillPending = pool.filter(w => w.score <= 90);
    
    if (stillPending.length === 0 && pool.length > 0) {
      setCurrentItem(null);
      return;
    }
    
    // 排除「最近 4 次」出現過的 ID
    const recentIds = currentHistory.slice(-4);
    let candidates = stillPending.filter(w => !recentIds.includes(w.id));
    
    if (candidates.length === 0) candidates = stillPending;

    // 加權隨機：分數越低權重越高
    const totalWeight = candidates.reduce((acc, w) => acc + (101 - w.score), 0);
    let random = Math.random() * totalWeight;
    
    let selected = candidates[0];
    for (const w of candidates) {
      const weight = 101 - w.score;
      if (random < weight) {
        selected = w;
        break;
      }
      random -= weight;
    }

    setCurrentItem(selected);
    setRevealStep(0);
    setIsJustMastered(false);
  }, []);

  const startTest = () => {
    const fromVal = fromRange === '' ? 1 : parseInt(fromRange);
    const toVal = toRange === '' ? items.length : parseInt(toRange);

    const from = Math.max(1, isNaN(fromVal) ? 1 : fromVal);
    const to = Math.min(items.length, isNaN(toVal) ? items.length : toVal);

    // 儲存本次使用的範圍
    localStorage.setItem('lastFromRange', from.toString());
    localStorage.setItem('lastToRange', to.toString());

    if (from > to) {
      setError("起始編號不可大於結束編號");
      return;
    }

    let slicedItems = items.slice(from - 1, to);
    
    // 根據選擇的模式處理分數
    if (scoreMode === 'default') {
      slicedItems = slicedItems.map(item => {
        const resetItem = { ...item, score: 60 };
        onUpdateWord(resetItem);
        return resetItem;
      });
    } else if (scoreMode === 'custom') {
      slicedItems = slicedItems.map(item => {
        const resetItem = { ...item, score: customInitialScore };
        onUpdateWord(resetItem);
        return resetItem;
      });
    }
    // 'continue' 模式不需要做任何事，直接使用原始 items

    // 將相同英文單字但不同中文意思的項目合併
    const grouped: Record<string, VocabularyItem[]> = {};
    slicedItems.forEach(item => {
      const key = item.word.toLowerCase().trim();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    const mergedPool: any[] = Object.values(grouped).map(group => {
      const sentences = group
        .filter(i => i.englishSentence && i.englishSentence.trim())
        .map(i => ({ text: i.englishSentence, translation: i.sentenceTranslation }));

      if (group.length === 1) {
        return { ...group[0], sentences };
      }
      
      // 合併多個意思
      return {
        ...group[0],
        id: group.map(i => i.id).join('|'), // 使用組合 ID
        chineseTranslation: group.map(i => i.chineseTranslation).join('；'),
        score: Math.min(...group.map(i => i.score)), // 取最低分作為基準
        sentences
      };
    });

    if (mergedPool.length === 0) {
      setError("該範圍內沒有找到單字");
      return;
    }

    setSessionPool(mergedPool);
    setIsRangeSet(true);
    setError(null);
    setHistory([]);
    pickNextWord(mergedPool, []);
  };

  const handleReveal = () => {
    if (!currentItem) return;

    if (revealStep === 0) {
      // 第一步：顯示答案
      setRevealStep(1);
      if (mode === 'en-zh') {
        speak(currentItem.word, 'en-US', true);
        speak(currentItem.chineseTranslation, 'zh-CN', false);
      } else {
        speak(currentItem.chineseTranslation, 'zh-CN', true);
        speak(currentItem.word, 'en-US', false);
      }
    } else {
      // 後續步驟：循環顯示例句或回到翻譯
      const sentences = currentItem.sentences || [];
      const currentSentenceIdx = revealStep - 2;

      if (sentences.length > 0 && currentSentenceIdx < sentences.length - 1) {
        // 還有下一個例句
        const nextIdx = currentSentenceIdx + 1;
        setRevealStep(nextIdx + 2);
        speak(sentences[nextIdx].text, 'en-US', true);
        speak(sentences[nextIdx].translation, 'zh-CN', false);
      } else {
        // 沒有例句了，或例句已播完，回到單字+翻譯
        setRevealStep(1);
        speak(currentItem.word, 'en-US', true);
        speak(currentItem.chineseTranslation, 'zh-CN', false);
      }
    }
  };

  const handleFeedback = (isCorrect: boolean) => {
    if (!currentItem) return;

    // 調整分數增幅：正確 +20, 錯誤 -50 (使其更難達到 90)
    const scoreChange = isCorrect ? 20 : -50;
    const oldScore = currentItem.score;
    const newScore = Math.max(0, Math.min(100, oldScore + scoreChange));
    const updatedWord = { ...currentItem, score: newScore };
    
    // 更新所有原始單字的分數
    const originalIds = currentItem.id.split('|');
    originalIds.forEach(id => {
      const original = items.find(it => it.id === id);
      if (original) {
        onUpdateWord({ ...original, score: newScore });
      }
    });

    const nextPool = sessionPool.map(w => w.id === updatedWord.id ? updatedWord : w);
    const nextHistory = [...history, currentItem.id];

    setSessionPool(nextPool);
    setHistory(nextHistory);
    setLastFeedback({ id: currentItem.id, isCorrect });

    // 如果剛好通關且是答對，顯示慶祝畫面
    if (isCorrect && newScore > 90 && oldScore <= 90) {
      setCurrentItem(updatedWord);
      setIsJustMastered(true);
      // 不立即 pickNextWord，讓使用者看到金卡
    } else {
      pickNextWord(nextPool, nextHistory);
    }
  };

  const handleBack = () => {
    if (history.length === 0) return;

    const lastId = history[history.length - 1];
    const prevItemInPool = sessionPool.find(w => w.id === lastId);

    if (prevItemInPool) {
      let restoredItem = { ...prevItemInPool };

      // 如果有上一次的反饋紀錄且 ID 相符，則撤銷分數變動
      if (lastFeedback && lastFeedback.id === lastId) {
        const scoreChange = lastFeedback.isCorrect ? 20 : -50;
        const restoredScore = Math.max(0, Math.min(100, restoredItem.score - scoreChange));
        restoredItem.score = restoredScore;

        // 同步回原始 items
        const originalIds = lastId.split('|');
        originalIds.forEach(id => {
          const original = items.find(it => it.id === id);
          if (original) {
            onUpdateWord({ ...original, score: restoredScore });
          }
        });

        // 更新 sessionPool 中的該項目
        setSessionPool(prev => prev.map(w => w.id === lastId ? restoredItem : w));
      }

      setCurrentItem(restoredItem);
      setRevealStep(0);
      setHistory(prev => prev.slice(0, -1));
      setLastFeedback(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
        <p className="text-slate-400 font-bold">目前沒有單字可供測試。請先新增單字！</p>
      </div>
    );
  }

  if (!isRangeSet) {
    return (
      <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border border-slate-100 animate-in fade-in zoom-in duration-300 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A5.905 5.905 0 018 3.993a5.905 5.905 0 014.26 10.147" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800">單字熟練度挑戰</h2>
          <p className="text-slate-500 mt-2 text-sm">目標：將所選範圍單字提升至 90% 以上</p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">起始單字 #</label>
              <input 
                type="number" 
                min="1" 
                max={items.length}
                value={fromRange}
                placeholder="1"
                onChange={(e) => setFromRange(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-lg" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">結束單字 #</label>
              <input 
                type="number" 
                min="1" 
                max={items.length}
                value={toRange}
                placeholder={items.length.toString()}
                onChange={(e) => setToRange(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-lg" 
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">熟練度起始設定</label>
            
            <div 
              onClick={() => setScoreMode('default')}
              className={`flex items-center gap-3 p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                scoreMode === 'default' ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-100 hover:bg-white'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${scoreMode === 'default' ? 'border-blue-500' : 'border-slate-300'}`}>
                {scoreMode === 'default' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-700">從 60 分開始 (預設)</span>
                <span className="text-[10px] text-slate-400 uppercase font-black">確保有基本的練習次數</span>
              </div>
            </div>

            <div 
              onClick={() => setScoreMode('continue')}
              className={`flex items-center gap-3 p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                scoreMode === 'continue' ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-100 hover:bg-white'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${scoreMode === 'continue' ? 'border-blue-500' : 'border-slate-300'}`}>
                {scoreMode === 'continue' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-700">延續目前的熟練度</span>
                <span className="text-[10px] text-slate-400 uppercase font-black">從上次學習的進度繼續</span>
              </div>
            </div>

            <div 
              onClick={() => setScoreMode('custom')}
              className={`flex items-center gap-3 p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                scoreMode === 'custom' ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-100 hover:bg-white'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${scoreMode === 'custom' ? 'border-blue-500' : 'border-slate-300'}`}>
                {scoreMode === 'custom' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-700">自訂初始分數</span>
                <span className="text-[10px] text-slate-400 uppercase font-black">手動設定起始熟練度</span>
              </div>
            </div>

            {scoreMode === 'custom' && (
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-blue-700">設定起始分數 (0-100):</span>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    value={customInitialScore}
                    onChange={(e) => setCustomInitialScore(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    className="w-20 px-3 py-1 rounded-lg border-2 border-blue-200 focus:border-blue-500 outline-none font-bold text-center"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-rose-500 text-sm font-bold text-center bg-rose-50 p-3 rounded-xl">{error}</p>
          )}

          <button 
            onClick={startTest}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-[0.98] transition-all"
          >
            開始練習
          </button>
        </div>
      </div>
    );
  }

  if (isRangeSet && pendingWords.length === 0 && totalInPool > 0) {
    return (
      <div className="bg-white rounded-3xl p-12 shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-12 h-12"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" /></svg>
        </div>
        <h2 className="text-3xl font-black text-slate-800 mb-2">達成完全掌握！</h2>
        <p className="text-slate-500 mb-8">選定範圍內的所有 {totalInPool} 個單字，分數皆已超過 90%。</p>
        <button onClick={() => setIsRangeSet(false)} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all">選擇新範圍</button>
      </div>
    );
  }

  if (!currentItem) return null;

  const isMastered = currentItem && currentItem.score > 90;

  return (
    <div className="bg-white rounded-3xl p-6 md:p-10 shadow-xl border border-slate-100 animate-in fade-in zoom-in duration-300 relative overflow-hidden">
      {/* 全域慶祝紙屑 (僅限剛通關) */}
      {isJustMastered && (
        <div className="absolute inset-0 pointer-events-none z-50">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i}
              className="absolute w-2 h-2 rounded-full animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                backgroundColor: ['#fbbf24', '#f59e0b', '#fcd34d', '#ffffff'][i % 4],
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${1 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <button 
          onClick={() => setIsRangeSet(false)}
          className="text-xs font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          結束練習
        </button>
        <div className="flex flex-col items-start sm:items-end w-full sm:w-auto">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">熟練度進度</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
            </div>
            <span className="text-xs font-bold text-slate-600 shrink-0">{progressPercent}%</span>
          </div>
          <span className="text-[9px] text-slate-400 font-bold mt-1">已掌握: {masteredCount}/{totalInPool}</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center">
        <div 
          key={currentItem.id}
          onClick={handleReveal}
          className={`w-full max-w-md min-h-[320px] sm:min-h-[450px] flex flex-col p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] transition-all cursor-pointer group relative overflow-hidden ${
            revealStep > 0 
              ? isMastered 
                ? 'bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 text-white shadow-2xl shadow-yellow-200 border-4 border-yellow-300'
                : 'bg-blue-600 text-white shadow-2xl shadow-blue-200' 
              : 'bg-slate-50 text-slate-800 border-4 border-slate-100 hover:border-blue-100 hover:bg-white shadow-inner'
          }`}
        >
          {/* 裝飾背景 (僅限金卡) */}
          {revealStep > 0 && isMastered && (
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-yellow-200 rounded-full blur-3xl"></div>
            </div>
          )}

          {/* 頂部狀態欄：分數 */}
          <div className="flex justify-between items-start mb-2 shrink-0 relative z-10">
            <div className="flex items-center gap-2">
              {revealStep > 0 && isMastered && (
                <div className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm animate-bounce">
                  <span className="text-[10px] font-black uppercase tracking-tighter">Mastered! 🏆</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center">
              <span className={`text-[10px] font-black uppercase ${revealStep > 0 ? isMastered ? 'text-yellow-100' : 'text-blue-200' : 'text-slate-300'}`}>熟練度</span>
              <span className={`text-sm font-black ${revealStep > 0 ? 'text-white' : 'text-blue-600'}`}>{currentItem.score}%</span>
            </div>
          </div>

          {/* 中間主體：單字與翻譯 或 例句 */}
          <div className="flex-1 flex flex-col items-center justify-center text-center w-full px-2 relative z-10">
            {revealStep <= 1 ? (
              <>
                {revealStep === 1 && isMastered && (
                  <div className="mb-4 animate-in zoom-in duration-500">
                    <img 
                      src="https://picsum.photos/seed/gold/200/200" 
                      alt="Mastered" 
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-full border-4 border-white/30 shadow-lg mx-auto object-cover"
                    />
                    <p className="text-[10px] font-black uppercase mt-2 tracking-widest text-yellow-100">恭喜！你已完全掌握此單字</p>
                  </div>
                )}
                <h2 className={`text-3xl sm:text-4xl md:text-5xl font-black mb-4 transition-transform break-words w-full ${revealStep === 1 ? 'scale-105' : ''}`}>
                  {mode === 'en-zh' ? currentItem.word : currentItem.chineseTranslation}
                </h2>
                
                <div className={`transition-all duration-500 transform w-full py-4 ${revealStep === 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <div className={`w-12 h-1 mx-auto mb-6 rounded-full ${revealStep > 0 && isMastered ? 'bg-white/40' : 'bg-white/20'}`}></div>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold leading-tight break-words px-2">
                    {mode === 'en-zh' ? currentItem.chineseTranslation : currentItem.word}
                  </p>
                </div>
              </>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 w-full">
                <span className={`text-[10px] font-black uppercase tracking-widest block mb-4 ${isMastered ? 'text-yellow-100' : 'text-blue-200'}`}>例句 {revealStep - 1} / {currentItem.sentences.length}</span>
                <p className="text-xl sm:text-2xl font-bold mb-6 leading-relaxed italic">
                  {currentItem.sentences[revealStep - 2].text}
                </p>
                <div className={`w-8 h-1 mx-auto mb-6 rounded-full ${isMastered ? 'bg-white/40' : 'bg-white/30'}`}></div>
                <p className="text-lg sm:text-xl font-medium opacity-90">
                  {currentItem.sentences[revealStep - 2].translation}
                </p>
              </div>
            )}
          </div>

          {/* 底部提示欄 */}
          <div className="h-10 flex items-center justify-center shrink-0 relative z-10">
            {revealStep === 0 ? (
              <div className="flex items-center gap-2 text-slate-300 group-hover:text-blue-400 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M18.757 17.243l-1.591-1.591m-6.25 2.098c-1.18 0-2.09-1.022-2.09-2.201V4.5h2.25c1.18 0 2.09 1.022 2.09 2.201v12.428l-2.25 2.25Z" />
                </svg>
                <span className="text-[10px] font-black uppercase tracking-widest">點擊顯示答案</span>
              </div>
            ) : (
              <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${isMastered ? 'text-yellow-100/80' : 'text-blue-200/60'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 animate-pulse">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M18.757 17.243l-1.591-1.591m-6.25 2.098c-1.18 0-2.09-1.022-2.09-2.201V4.5h2.25c1.18 0 2.09 1.022 2.09 2.201v12.428l-2.25 2.25Z" />
                </svg>
                <span>點擊切換例句 / 翻譯</span>
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-md mt-10 sm:mt-12 min-h-[80px] flex items-center justify-center">
          {isJustMastered ? (
            <button 
              onClick={() => pickNextWord(sessionPool, history)}
              className="w-full py-5 bg-gradient-to-r from-yellow-500 to-amber-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-yellow-100 hover:scale-[1.02] active:scale-[0.98] transition-all animate-in zoom-in duration-300 flex items-center justify-center gap-3"
            >
              <span>繼續挑戰下一個字</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          ) : revealStep === 0 ? (
            history.length > 0 && (
              <button 
                onClick={handleBack}
                className="flex items-center gap-2 px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                </svg>
                返回上個字
              </button>
            )
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 w-full animate-in fade-in zoom-in duration-300">
              <button 
                onClick={() => handleFeedback(true)}
                className="group flex flex-col items-center gap-1 p-4 sm:p-5 bg-emerald-50 border-2 border-emerald-100 text-emerald-600 rounded-2xl sm:rounded-3xl font-bold hover:bg-emerald-100 active:scale-95 transition-all shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 group-hover:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                <span className="text-xs sm:text-sm">我會這題 ✅</span>
              </button>

              <button 
                onClick={() => handleFeedback(false)}
                className="group flex flex-col items-center gap-1 p-4 sm:p-5 bg-rose-50 border-2 border-rose-100 text-rose-600 rounded-2xl sm:rounded-3xl font-bold hover:bg-rose-100 active:scale-95 transition-all shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 group-hover:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                <span className="text-xs sm:text-sm">我不確定 ❌</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestMode;
