
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import VocabularyList from './components/VocabularyList';
import WordDetail from './components/WordDetail';
import TestMode from './components/TestMode';
import { VocabularyItem, AppView, VocabularyUnit } from './types';
import { extractVocabularyFromImages, extractVocabularyFromText } from './services/geminiService';
import { storageService } from './services/storageService';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.mjs';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('upload');
  const [units, setUnits] = useState<VocabularyUnit[]>([]);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [contextMenuUnitId, setContextMenuUnitId] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  
  const [selectedWord, setSelectedWord] = useState<VocabularyItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [pdfPreviewPages, setPdfPreviewPages] = useState<{dataUrl: string, pageNumber: number}[]>([]);
  const [selectedPdfPages, setSelectedPdfPages] = useState<number[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // 初始化載入
  useEffect(() => {
    const init = async () => {
      const loadedUnits = await storageService.loadUnits();
      setUnits(loadedUnits);
      if (loadedUnits.length > 0) {
        const lastId = localStorage.getItem('vocab_active_unit_id');
        const targetUnit = loadedUnits.find(u => u.id === lastId) || loadedUnits[0];
        setActiveUnitId(targetUnit.id);
        setView('study');
      }
    };
    init();
  }, []);

  // 當 activeUnitId 改變時，保存到 localStorage 紀錄最後位置並重置選取狀態
  useEffect(() => {
    if (activeUnitId) {
      localStorage.setItem('vocab_active_unit_id', activeUnitId);
      setIsSelectionMode(false);
      setSelectedIds([]);
    }
  }, [activeUnitId]);

  const activeUnit = units.find(u => u.id === activeUnitId) || null;
  const vocabList = activeUnit?.items || [];

  const saveCurrentUnit = async (updatedItems: VocabularyItem[]) => {
    if (!activeUnit) return;
    const updatedUnit = { ...activeUnit, items: updatedItems };
    await storageService.saveUnit(updatedUnit);
    setUnits(prev => prev.map(u => u.id === updatedUnit.id ? updatedUnit : u));
  };

  const handleRenameUnit = async (id: string, newTitle: string) => {
    const unit = units.find(u => u.id === id);
    if (!unit || !newTitle.trim()) return;
    const updatedUnit = { ...unit, title: newTitle.trim() };
    await storageService.saveUnit(updatedUnit);
    setUnits(prev => prev.map(u => u.id === id ? updatedUnit : u));
    setEditingUnitId(null);
    setContextMenuUnitId(null);
  };

  const handleLongPressStart = (unitId: string) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenuUnitId(unitId);
    }, 600); // 600ms for long press
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const speak = useCallback((text: string, lang: string = 'en-US', cancel: boolean = true) => {
    if (cancel) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    if (lang.startsWith('en')) {
      const usVoices = voices.filter(v => v.lang.includes('US') || v.lang === 'en-US');
      selectedVoice = usVoices.find(v => v.name.toLowerCase().includes('google')) || usVoices[0] || voices.find(v => v.lang.startsWith('en'));
    } else if (lang.startsWith('zh')) {
      const zhVoices = voices.filter(v => v.lang.startsWith('zh'));
      selectedVoice = zhVoices.find(v => v.lang.toLowerCase().includes('cn')) || zhVoices[0];
    }
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = lang.startsWith('zh') ? 1.0 : 0.9;
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleSelectWord = (item: VocabularyItem) => {
    setSelectedWord(item);
    speak(item.word, 'en-US', true);
    speak(item.chineseTranslation, 'zh-CN', false);
  };

  const handleUpdateWord = (updated: VocabularyItem) => {
    const newList = vocabList.map(item => item.id === updated.id ? updated : item);
    saveCurrentUnit(newList);
    if (selectedWord?.id === updated.id) setSelectedWord(updated);
  };

  const handleDeleteWord = (id: string) => {
    const newList = vocabList.filter(item => item.id !== id);
    saveCurrentUnit(newList);
    if (selectedWord?.id === id) setSelectedWord(null);
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    const newList = vocabList.filter(item => !selectedIds.includes(item.id));
    saveCurrentUnit(newList);
    setSelectedIds([]);
    setIsSelectionMode(false);
    if (selectedWord && selectedIds.includes(selectedWord.id)) setSelectedWord(null);
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleLongPressWord = (id: string) => {
    setIsSelectionMode(true);
    setSelectedIds([id]);
  };

  const processImportedItems = async (items: VocabularyItem[]) => {
    const newUnit: VocabularyUnit = {
      id: `unit_${Date.now()}`,
      title: `單元 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
      items: items,
      createdAt: Date.now()
    };
    await storageService.saveUnit(newUnit);
    setUnits(prev => [newUnit, ...prev]);
    setActiveUnitId(newUnit.id);
    setSelectedWord(items[0] || null);
    setView('study');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    if (file.type === 'application/pdf') {
      setIsProcessing(true);
      setLoadingStatus('Rendering PDF previews...');
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: {dataUrl: string, pageNumber: number}[] = [];
        const pageCount = Math.min(pdf.numPages, 60);
        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.7 }); 
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          pages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.6), pageNumber: i });
        }
        setPdfPreviewPages(pages);
        setSelectedPdfPages([]);
        setView('pdf-picker');
      } catch (err) { setErrorMessage("Failed to load PDF."); }
      finally { setIsProcessing(false); setLoadingStatus(''); }
    } else if (file.type === 'text/plain') {
      setIsProcessing(true);
      setLoadingStatus('Analyzing text content...');
      try {
        const text = await file.text();
        const extracted = await extractVocabularyFromText(text);
        processImportedItems(extracted);
      } catch (err) { setErrorMessage("Failed to process text file."); }
      finally { setIsProcessing(false); setLoadingStatus(''); }
    } else {
      setIsProcessing(true);
      setLoadingStatus('Processing images...');
      try {
        const base64Promises = Array.from(files).map((file: File) => {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result?.toString().split(',')[1] || "");
            reader.readAsDataURL(file);
          });
        });
        const base64Images = await Promise.all(base64Promises);
        const extracted = await extractVocabularyFromImages(base64Images.filter(img => img !== ""));
        processImportedItems(extracted);
      } catch (err) { setErrorMessage("Failed to extract vocabulary from images."); }
      finally { setIsProcessing(false); setLoadingStatus(''); }
    }
    event.target.value = '';
  };

  const handleProcessSelectedPdfPages = async () => {
    if (selectedPdfPages.length === 0) return;
    setIsProcessing(true);
    setLoadingStatus('AI is extracting vocabulary from selected pages...');
    try {
      const selectedBase64 = pdfPreviewPages
        .filter(p => selectedPdfPages.includes(p.pageNumber))
        .map(p => p.dataUrl.split(',')[1]);
      const extracted = await extractVocabularyFromImages(selectedBase64);
      processImportedItems(extracted);
    } catch (err) { setErrorMessage("Failed to process PDF pages."); }
    finally { setIsProcessing(false); setLoadingStatus(''); }
  };

  const renderUpload = () => (
    <div className="space-y-6">
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
        </div>
      )}
      <div 
        className="flex flex-col items-center justify-center py-12 px-6 border-4 border-dashed border-slate-100 rounded-3xl bg-slate-50 hover:bg-white hover:border-blue-100 transition-all cursor-pointer group"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="bg-blue-100 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-blue-600"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" /></svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Document</h2>
        <p className="text-slate-500 text-center max-w-xs mb-8">Drop Images, PDF, or TXT files. AI will automatically extract words, sentences, and translations.</p>
        <button className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg">Select Files</button>
        <input type="file" className="hidden" ref={fileInputRef} accept="image/*,.pdf,.txt" multiple onChange={handleFileUpload} />
      </div>

      <div className="flex flex-col items-center">
        <button 
          onClick={() => jsonInputRef.current?.click()} 
          className="flex items-center gap-2 px-6 py-3 border-2 border-indigo-100 rounded-2xl font-bold text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 transition-all group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          <span className="text-sm">匯入之前的 JSON 備份檔</span>
        </button>
        <input 
          type="file" 
          className="hidden" 
          ref={jsonInputRef} 
          accept=".json" 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (re) => {
              try {
                const json = JSON.parse(re.target?.result as string);
                if (Array.isArray(json)) processImportedItems(json);
                else setErrorMessage("JSON 格式不正確，應為單字陣列。");
              } catch (err) { setErrorMessage("讀取 JSON 失敗。"); }
            };
            reader.readAsText(file);
            e.target.value = '';
          }} 
        />
      </div>
    </div>
  );

  const renderPdfPicker = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-100 p-6 rounded-3xl">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Select PDF Pages</h2>
          <p className="text-slate-500 text-sm">Pick pages for AI extraction. <span className="text-blue-600 font-bold">{selectedPdfPages.length} selected</span></p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView(vocabList.length > 0 ? 'study' : 'upload')} className="px-4 py-2 bg-slate-200 rounded-xl font-bold">Cancel</button>
          <button disabled={selectedPdfPages.length === 0} onClick={handleProcessSelectedPdfPages} className={`px-6 py-2 rounded-xl font-bold ${selectedPdfPages.length > 0 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-500'}`}>Extract Words</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto p-4 bg-slate-50 rounded-3xl">
        {pdfPreviewPages.map((page) => (
          <div key={page.pageNumber} onClick={() => setSelectedPdfPages(prev => prev.includes(page.pageNumber) ? prev.filter(p => p !== page.pageNumber) : [...prev, page.pageNumber])} className={`cursor-pointer rounded-xl overflow-hidden border-4 transition-all ${selectedPdfPages.includes(page.pageNumber) ? 'border-blue-600 scale-95' : 'border-white hover:border-slate-200'}`}>
            <img src={page.dataUrl} className="w-full h-auto" />
            <div className="p-1 text-center text-xs font-bold text-slate-500">Page {page.pageNumber}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStudy = () => {
    const activeItem = selectedWord || vocabList[0];
    const activeIndex = vocabList.findIndex(item => item.id === activeItem?.id);
    
    return (
      <div 
        className="grid grid-cols-1 md:grid-cols-3 gap-8"
        onClick={() => {
          if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedIds([]);
          }
        }}
      >
        <div className="md:col-span-1 border-r border-slate-100 pr-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest">{activeUnit?.title} ({vocabList.length})</h3>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setView('upload')} className="text-xs text-blue-600 font-bold hover:underline">Add</button>
              <button onClick={() => {
                const blob = new Blob([JSON.stringify(vocabList, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `${activeUnit?.title || 'vocab'}-export.json`; a.click();
              }} className="text-xs text-indigo-600 font-bold hover:underline">Export</button>
              <button 
                onClick={() => {
                  if (isSelectionMode) {
                    if (selectedIds.length > 0) handleBatchDelete();
                  } else {
                    if (selectedWord) handleDeleteWord(selectedWord.id);
                    else if (vocabList.length > 0) handleDeleteWord(vocabList[0].id);
                  }
                }} 
                className={`text-xs font-bold hover:underline ${isSelectionMode && selectedIds.length === 0 ? 'text-slate-300' : 'text-rose-500'}`}
                disabled={isSelectionMode && selectedIds.length === 0}
              >
                {isSelectionMode ? `Delete (${selectedIds.length})` : 'Delete'}
              </button>
            </div>
          </div>
          <VocabularyList 
            items={vocabList} 
            onSelect={handleSelectWord} 
            selectedId={selectedWord?.id || null} 
            isSelectionMode={isSelectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectId}
            onLongPress={handleLongPressWord}
          />
        </div>
        <div className="md:col-span-2 space-y-8" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2 md:gap-4 border-b border-slate-100 pb-4">
            <button onClick={() => setView('study')} className={`px-4 py-2 rounded-full font-bold text-sm ${view === 'study' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Study</button>
            <button onClick={() => setView('test')} className={`px-4 py-2 rounded-full font-bold text-sm ${view === 'test' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Test (EN→ZH)</button>
            <button onClick={() => setView('test-reverse')} className={`px-4 py-2 rounded-full font-bold text-sm ${view === 'test-reverse' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Test (ZH→EN)</button>
          </div>
          {vocabList.length > 0 ? (
            view === 'study' ? <WordDetail item={activeItem} index={activeIndex} onUpdate={handleUpdateWord} onDelete={handleDeleteWord} /> : 
            view === 'test' ? <TestMode items={vocabList} speak={speak} onUpdateWord={handleUpdateWord} mode="en-zh" /> :
            <TestMode items={vocabList} speak={speak} onUpdateWord={handleUpdateWord} mode="zh-en" />
          ) : (
            <div className="py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-medium">This unit is empty.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout 
      title="VocabMaster AI" 
      onMenuClick={() => setIsSidebarOpen(true)}
    >
      {/* Sidebar Drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[110] flex animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>
          <div className="relative w-72 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-xl text-slate-800">我的單元</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button 
                onClick={() => { setView('upload'); setIsSidebarOpen(false); }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-blue-100 text-blue-600 font-bold hover:bg-blue-50 transition-all mb-4"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                新增單元
              </button>
              {units.map(unit => (
                <div key={unit.id} className="relative group">
                  {editingUnitId === unit.id ? (
                    <div className="p-2 bg-blue-50 rounded-2xl border-2 border-blue-200 animate-in fade-in zoom-in duration-200">
                      <input 
                        autoFocus
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleRenameUnit(unit.id, editingTitle)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameUnit(unit.id, editingTitle);
                          if (e.key === 'Escape') setEditingUnitId(null);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-blue-100 outline-none font-bold text-slate-700"
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => setEditingUnitId(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">取消</button>
                        <button onClick={() => handleRenameUnit(unit.id, editingTitle)} className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700">儲存</button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <button 
                        onMouseDown={() => handleLongPressStart(unit.id)}
                        onMouseUp={handleLongPressEnd}
                        onMouseLeave={handleLongPressEnd}
                        onTouchStart={() => handleLongPressStart(unit.id)}
                        onTouchEnd={handleLongPressEnd}
                        onClick={() => { 
                          if (!contextMenuUnitId) {
                            setActiveUnitId(unit.id); 
                            setView('study'); 
                            setIsSidebarOpen(false); 
                          }
                        }}
                        className={`w-full text-left p-4 rounded-2xl font-bold transition-all flex items-center justify-between ${activeUnitId === unit.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      >
                        <div className="truncate pr-2">
                          <div className="text-sm truncate">{unit.title}</div>
                          <div className={`text-[10px] font-black uppercase tracking-widest mt-1 ${activeUnitId === unit.id ? 'text-blue-200' : 'text-slate-400'}`}>{unit.items.length} WORDS</div>
                        </div>
                        {activeUnitId === unit.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </button>

                      {contextMenuUnitId === unit.id && (
                        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl flex items-center justify-around z-20 animate-in fade-in zoom-in duration-200 border-2 border-blue-100">
                          <button 
                            onClick={() => {
                              setEditingUnitId(unit.id);
                              setEditingTitle(unit.title);
                              setContextMenuUnitId(null);
                            }}
                            className="flex flex-col items-center gap-1 text-blue-600"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                            <span className="text-[10px] font-black uppercase">重新命名</span>
                          </button>
                          <button 
                            onClick={() => {
                              setActiveUnitId(unit.id);
                              setShowClearConfirm(true);
                              setContextMenuUnitId(null);
                            }}
                            className="flex flex-col items-center gap-1 text-rose-600"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                            <span className="text-[10px] font-black uppercase">刪除單元</span>
                          </button>
                          <button onClick={() => setContextMenuUnitId(null)} className="absolute top-1 right-1 p-1 text-slate-300 hover:text-slate-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in">
            <h3 className="text-xl font-bold text-slate-800 text-center mb-4">刪除此單元？</h3>
            <p className="text-slate-500 text-center mb-6 text-sm">此動作無法復原，單元內所有單字將會永久消失。</p>
            <div className="flex flex-col gap-3">
              <button onClick={async () => { 
                if (activeUnitId) {
                  await storageService.deleteUnit(activeUnitId);
                  const remaining = units.filter(u => u.id !== activeUnitId);
                  setUnits(remaining);
                  if (remaining.length > 0) setActiveUnitId(remaining[0].id);
                  else { setActiveUnitId(null); setView('upload'); }
                  setShowClearConfirm(false);
                }
              }} className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold">確認刪除</button>
              <button onClick={() => setShowClearConfirm(false)} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">取消</button>
            </div>
          </div>
        </div>
      )}
      {isProcessing ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Processing...</h2>
          <p className="text-slate-500 text-center px-4">{loadingStatus || 'Analyzing your document with AI'}</p>
        </div>
      ) : view === 'upload' ? renderUpload() : view === 'pdf-picker' ? renderPdfPicker() : renderStudy()}
    </Layout>
  );
};

export default App;
