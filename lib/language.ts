/** Output languages the analysis can be rendered in. */
export interface Language {
  /** BCP-47-ish code stored in settings and sent to Carevie as `lang`. */
  code: string;
  /** Native name shown in the Options select. */
  label: string;
  /** English name used in the LLM prompt instruction. */
  promptName: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', promptName: 'English' },
  { code: 'zh-CN', label: '简体中文', promptName: 'Simplified Chinese' },
  { code: 'zh-TW', label: '繁體中文', promptName: 'Traditional Chinese' },
  { code: 'ja', label: '日本語', promptName: 'Japanese' },
  { code: 'ko', label: '한국어', promptName: 'Korean' },
];

/** English prompt name for a language code; unknown codes fall back to English. */
export function promptName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.promptName ?? 'English';
}
