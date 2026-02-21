
export interface VocabularyItem {
  id: string;
  word: string;
  pronunciation?: string;
  partOfSpeech?: string;
  chineseTranslation: string;
  englishSentence: string;
  sentenceTranslation: string;
  score: number; // 0 to 100
}

export interface VocabularyUnit {
  id: string;
  title: string;
  items: VocabularyItem[];
  createdAt: number;
}

export type AppView = 'upload' | 'study' | 'pdf-picker' | 'test' | 'test-reverse';

export interface AudioPlayState {
  isPlaying: boolean;
  wordId: string | null;
}
