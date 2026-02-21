
import { GoogleGenAI, Type } from "@google/genai";
import { VocabularyItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SHARED_PROMPT = `
Extract all vocabulary entries from the provided content. For each entry:
1. Identify the word, its pronunciation (phonetic), and part of speech.
2. Provide the Chinese translation of the word.
3. Extract the sample sentence associated with the word. If a sentence is missing for a word, create a natural sounding American English sample sentence.
4. Provide the Chinese translation of that sample sentence.

Format the output as a JSON array of objects.`;

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      word: { type: Type.STRING },
      pronunciation: { type: Type.STRING },
      partOfSpeech: { type: Type.STRING },
      chineseTranslation: { type: Type.STRING },
      englishSentence: { type: Type.STRING },
      sentenceTranslation: { type: Type.STRING },
    },
    required: ["word", "chineseTranslation", "englishSentence", "sentenceTranslation"],
  },
};

export async function extractVocabularyFromImages(base64Images: string[]): Promise<VocabularyItem[]> {
  const imageParts = base64Images.map(base64 => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64,
    },
  }));

  const textPart = { text: SHARED_PROMPT };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...imageParts, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const rawJson = response.text || "[]";
    const items = JSON.parse(rawJson) as any[];
    return items.map((item, index) => ({
      ...item,
      id: `vocab-${index}-${Date.now()}`,
      score: 60 // Starting at 60 to require effort to reach 90
    }));
  } catch (error) {
    console.error("Gemini Image API Error:", error);
    throw error;
  }
}

export async function extractVocabularyFromText(text: string): Promise<VocabularyItem[]> {
  const prompt = `${SHARED_PROMPT}\n\nContent to process:\n${text}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const rawJson = response.text || "[]";
    const items = JSON.parse(rawJson) as any[];
    return items.map((item, index) => ({
      ...item,
      id: `vocab-text-${index}-${Date.now()}`,
      score: 60 // Starting at 60
    }));
  } catch (error) {
    console.error("Gemini Text API Error:", error);
    throw error;
  }
}
