import type { Context } from '@deepseek-ai/cordis';

/** One picker entry (`native` absent for the `auto` entry). */
export interface ThinkingLanguageOption {
    id: string;
    native?: string;
}

/** The browser copy of the language catalog. */
export declare const THINKING_LANGUAGES: ThinkingLanguageOption[];
/** The "no instruction" value shared with the host schema. */
export declare const THINKING_LANGUAGE_DEFAULT: 'auto';
/** Dictionary namespace owned by the settings row. */
export declare const SETTINGS_NS: 'settings.thinking-language';

/** Required client services. */
export declare const inject: string[];
/** Client plugin body: register the picker row into Settings → General. */
export declare function apply(ctx: Context): void;
