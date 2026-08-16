import type { Context } from '@deepseek-ai/cordis';

/** One entry in the thinking-language catalog. */
export interface ThinkingLanguage {
    /** Stable id shared by the settings schema, the command, and the client picker. */
    id: string;
    /** English language name. */
    name: string;
    /** Native endonym shown in the picker. */
    native: string;
}

/** The "no instruction" value: the model keeps its natural thinking language. */
export declare const THINKING_LANGUAGE_DEFAULT: 'auto';
/** Field carrying the selected language id inside the namespace. */
export declare const THINKING_LANGUAGE_FIELD: 'language';
/** The language catalog. */
export declare const THINKING_LANGUAGES: ThinkingLanguage[];
/** The settings namespace owned by this plugin. */
export declare const THINKING_NAMESPACE: string;
/** Durable settings schema (default `auto`). */
export declare const Config: import('@deepseek-ai/schemastery').SchemasteryObject<{ language: string }>;

/** Compose the model instruction for one language id; `auto` yields "". */
export declare function thinkingInstruction(language: string | undefined): string;
/** Human-readable current value for the command reply. */
export declare function describeLanguage(language: string | undefined): string;
/** Read the current preference (schema default when absent). */
export declare function currentLanguage(settings: { get(ns: string): unknown } | undefined): string;
/** The `/thinking-language` usage line. */
export declare function usageLine(): string;

/** Stable Cordis plugin name. */
export declare const name: 'thinking-language';
/** Plugin-level service requirements (empty; services are nested `ctx.inject`). */
export declare const inject: string[];
/** Register the settings namespace, prompt section, and command. */
export declare function apply(ctx: Context): void;
