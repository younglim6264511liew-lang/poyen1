
import React, { useState, useEffect } from 'react';
import { VocabularyItem } from '../types';

interface WordDetailProps {
  item: VocabularyItem;
  index?: number; // 0-based index
  onUpdate?: (updated: VocabularyItem) => void;
  onDelete?: (id: string) => void;
}

const WordDetail: React.FC<WordDetailProps> = ({ item, index, onUpdate, onDelete }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedItem, setEditedItem] = useState<VocabularyItem>(item);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setEditedItem(item);
    setIsEditing(false);
  }, [item]);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleSpeakSequence = (enText: string, zhText: string) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    const enUtterance = new SpeechSynthesisUtterance(enText.trim());
    const usVoices = voices.filter(v => v.lang.includes('US') || v.lang === 'en-US');
    const enVoice = 
      usVoices.find(v => v.name.toLowerCase().includes('google') && v.name.toLowerCase().includes('us')) ||
      usVoices.find(v => v.name.toLowerCase().includes('natural')) ||
      usVoices[0] || 
      voices.find(v => v.lang.startsWith('en'));

    if (enVoice) {
      enUtterance.voice = enVoice;
      enUtterance.lang = 'en-US';
    }
    enUtterance.rate = 0.95;

    const zhUtterance = new SpeechSynthesisUtterance(zhText.trim());
    const zhVoices = voices.filter(v => v.lang.startsWith('zh'));
    const zhVoice = 
      zhVoices.find(v => v.lang.toLowerCase().includes('cn')) || 
      zhVoices.find(v => v.lang.toLowerCase().includes('tw')) || 
      zhVoices.find(v => v.lang.toLowerCase().includes('hk')) || 
      zhVoices[0];

    if (zhVoice) {
      zhUtterance.voice = zhVoice;
      zhUtterance.lang = 'zh-CN';
    }
    zhUtterance.rate = 1.0;

    enUtterance.onstart = () => setIsSpeaking(true);
    zhUtterance.onend = () => setIsSpeaking(false);
    zhUtterance.onerror = () => setIsSpeaking(false);
    enUtterance.onerror = () => {
      if (!window.speechSynthesis.speaking) setIsSpeaking(false);
    };

    window.speechSynthesis.speak(enUtterance);
    window.speechSynthesis.speak(zhUtterance);
  };

  const handleSave = () => {
    if (onUpdate) onUpdate(editedItem);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="animate-in fade-in duration-300 space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-200">
        <h3 className="text-xl font-black text-slate-800 mb-4">編輯單字</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">單字</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" 
              value={editedItem.word} 
              onChange={e => setEditedItem({...editedItem, word: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">中文翻譯</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" 
              value={editedItem.chineseTranslation} 
              onChange={e => setEditedItem({...editedItem, chineseTranslation: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">發音 (音標)</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" 
              value={editedItem.pronunciation} 
              onChange={e => setEditedItem({...editedItem, pronunciation: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">詞性</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" 
              value={editedItem.partOfSpeech} 
              onChange={e => setEditedItem({...editedItem, partOfSpeech: e.target.value})}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-slate-400">例句 (英文)</label>
          <textarea 
            rows={2}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
            value={editedItem.englishSentence} 
            onChange={e => setEditedItem({...editedItem, englishSentence: e.target.value})}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-slate-400">例句翻譯 (中文)</label>
          <textarea 
            rows={2}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
            value={editedItem.sentenceTranslation} 
            onChange={e => setEditedItem({...editedItem, sentenceTranslation: e.target.value})}
          />
        </div>
        <div className="flex gap-2 pt-4">
          <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">儲存修改</button>
          <button onClick={() => setIsEditing(false)} className="px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold hover:bg-slate-100">取消</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right duration-300">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex flex-col min-w-0">
             <div className="flex items-start gap-3">
               {typeof index === 'number' && (
                 <span className="bg-slate-100 text-slate-400 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-tighter mt-1 shrink-0">
                   #{index + 1}
                 </span>
               )}
               <h2 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight break-words overflow-hidden">{item.word}</h2>
             </div>
             <div className="flex flex-wrap gap-2 mt-1 sm:ml-10">
               {item.pronunciation && <span className="text-blue-600 font-mono text-sm">{item.pronunciation}</span>}
               {item.pronunciation && item.partOfSpeech && <span className="text-slate-300">•</span>}
               {item.partOfSpeech && <span className="text-slate-400 text-sm font-bold">{item.partOfSpeech}</span>}
             </div>
          </div>
          <div className="flex gap-2 shrink-0 self-end sm:self-start">
            <button
              onClick={() => handleSpeakSequence(item.englishSentence, item.sentenceTranslation)}
              className={`flex items-center gap-2 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-95 ${
                isSpeaking ? 'bg-rose-500 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
              <div className="flex flex-col items-start leading-tight">
                <span className="text-xs sm:text-sm">{isSpeaking ? '停止' : '播放'}</span>
                <span className="text-[9px] sm:text-[10px] opacity-80 font-normal">EN + 中文</span>
              </div>
            </button>
            <div className="flex flex-col gap-1">
              <button onClick={() => setIsEditing(true)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg></button>
              {onDelete && <button onClick={() => onDelete(item.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg></button>}
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">翻譯</h4>
            <p className="text-xl font-bold text-slate-800 break-words">{item.chineseTranslation}</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100 relative overflow-hidden">
            <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              例句展示
            </h4>
            <p className="text-xl font-medium text-slate-800 leading-relaxed mb-3 break-words">
              "{item.englishSentence}"
            </p>
            <p className="text-blue-600/70 italic text-sm font-medium break-words">
              {item.sentenceTranslation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordDetail;
