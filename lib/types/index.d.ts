import type { Context } from '@deepseek-ai/cordis';

/** One entry in the thinking-language catalog. */
export interface ThinkingLanguage {
    /** Stable id shared by the settings schema, the command, and the client picker. */
    id: string;
    /** English language name. */
    name: string;
    /** Native endonym shown in the picker and quoted in the model instruction. */
    native: string;
    /**
     * True when a regionless, scriptless locale request (for example the stored
     * locale `fr`) resolves to this entry. Chinese entries are deliberately not
     * marked: script/region rules decide between them.
     */
    regionless?: boolean;
}

/** The "follow the system locale" value: the model thinks in the system/UI locale. */
export declare const THINKING_LANGUAGE_DEFAULT: 'auto';
/** Field carrying the selected language id inside the namespace. */
export declare const THINKING_LANGUAGE_FIELD: 'language';
/** The settings namespace owned by this plugin. */
export declare const THINKING_NAMESPACE: 'thinking-language';
/** The locale settings namespace owned by `@deepseek-ai/dsh-client-locale`. */
export declare const LOCALE_SETTINGS_NAMESPACE: 'locale';
/** Field inside the locale namespace carrying the explicit system-locale selection. */
export declare const LOCALE_PREFERENCE_FIELD: 'preference';
/** The thinking language used when the system locale matches no catalog entry. */
export declare const FALLBACK_THINKING_LANGUAGE: 'en';
/** The language catalog, in settings-schema enum order. */
export declare const THINKING_LANGUAGES: ThinkingLanguage[];
/** The catalog ids, in catalog order. */
export declare const THINKING_LANGUAGE_IDS: string[];
/** Durable settings schema (default `auto`; every enum value carries a label). */
export declare const Config: import('@deepseek-ai/schemastery').SchemasteryObject<{
    language: string;
}>;

/**
 * The two service shapes a read accepts: the settings service (`get(ns)`) or
 * the namespace scope returned by `settings.register()` (`get()` with no
 * argument). Passing the wrong arity is tolerated, not fatal.
 */
export interface SettingsReader {
    get(nsOrNothing?: string): unknown;
}

/** Normalize one locale tag into its matching chain, most specific first. */
export declare function localeChain(locale: unknown): string[];
/** Resolve one system locale to a catalog entry, or undefined. */
export declare function languageForSystemLocale(locale: unknown): ThinkingLanguage | undefined;
/** The label attached to one id in the registered settings schema. */
export declare function languageLabel(id: string): string | undefined;
/** Read the current preference (schema default when absent or unreadable). */
export declare function currentLanguage(settings: SettingsReader | undefined | null): string;
/**
 * Resolve the effective thinking-language id for one settings snapshot.
 * @param settings - the handle carrying the preference.
 * @param services - optional settings service used to read `locale.preference`.
 * @param systemLocale - optional browser-derived locale.
 */
export declare function resolveLanguage(settings: SettingsReader | undefined | null, services?: SettingsReader | undefined | null, systemLocale?: string): string;
/** Compose the model instruction for one language id; `auto` and unknown ids yield "". */
export declare function thinkingInstruction(language: string | undefined): string;
/** Compose the per-step dynamic reminder for one language id; `auto` and unknown ids yield "". */
export declare function thinkingReminder(language: string | undefined): string;
/** Human-readable current value for the command reply. */
export declare function describeLanguage(language: string | undefined): string;
/** The `/thinking-language` usage line. */
export declare function usageLine(): string;
/** Parse one command argument into a show/set/invalid outcome. */
export declare function parseCommandArgument(raw: unknown): {
    kind: 'show';
} | {
    kind: 'set';
    id: string;
} | {
    kind: 'invalid';
};

/** Stable Cordis plugin name. */
export declare const name: 'thinking-language';
/** Plugin-level service requirements (empty; services are nested `ctx.inject`). */
export declare const inject: string[];
/**
 * Forget the recorded namespace registration, so the next `apply` registers
 * again. Exists for a development reload or a test that exercises a harness
 * refusing the registration.
 */
export declare function resetRegistration(): void;
/** Register the settings namespace, prompt surfaces, and command. */
export declare function apply(ctx: Context): void;
