
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  onMenuClick?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, title, onMenuClick }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button 
              onClick={onMenuClick}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          )}
          <div className="text-left">
            <h1 className="text-3xl font-black text-indigo-600">{title}</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">AI Vocabulary Master</p>
          </div>
        </div>
      </header>
      <main className="bg-white rounded-2xl shadow-xl p-6 min-h-[500px]">
        {children}
      </main>
      <footer className="mt-8 text-center text-slate-400 text-sm">
        VocabMaster AI &copy; 2024 - Powered by Gemini
      </footer>
    </div>
  );
};

export default Layout;
