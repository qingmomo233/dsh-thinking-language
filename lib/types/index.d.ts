import type { Context } from '@deepseek-ai/cordis';

/** One entry in the thinking-language catalog. */
export interface ThinkingLanguage {
    /** Stable id shared by the settings schema and the client picker. */
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
/** Durable settings schema (default `auto`; every enum value carries a label; the field is volatile on DSH 0.2.x, marked and referenced by this plugin so an older schemastery works too). */
export declare const Config: import('@deepseek-ai/schemastery').SchemasteryObject<{
    language: string | VolatileField<string>;
}>;

/**
 * The service shapes a read accepts: the settings service (`get(ns)`) or the
 * namespace scope returned by `settings.register()` (`get()` with no
 * argument). Passing the wrong arity is tolerated, not fatal.
 */
export interface SettingsReader {
    get(nsOrNothing?: string): unknown;
}

/**
 * A live reference to one volatile config field. DSH 0.2.x wraps a volatile
 * field in a frozen `{ get() }` handle whose owning runtime swaps the value in
 * place, so the reference itself is stable and always reads current. The
 * protocol is keyed by `Symbol.for('cosmokit.volatile.write')`, which is why a
 * reference built by this plugin is understood by the harness's own cosmokit.
 */
export interface VolatileField<T = unknown> {
    get(): T;
}

/**
 * One resolved config section — this plugin's own config on DSH 0.2.x, where
 * the loader entry *is* the settings namespace. The preference field holds
 * either the plain value or a {@link VolatileField}.
 */
export interface SettingsSection {
    [field: string]: unknown;
}

/** Every handle a read accepts, across all supported harness generations. */
export type SettingsHandle = SettingsReader | SettingsSection;

/** Normalize one locale tag into its matching chain, most specific first. */
export declare function localeChain(locale: unknown): string[];
/** Resolve one system locale to a catalog entry, or undefined. */
export declare function languageForSystemLocale(locale: unknown): ThinkingLanguage | undefined;
/** The label attached to one id in the registered settings schema. */
export declare function languageLabel(id: string): string | undefined;
/** Read the current preference (schema default when absent or unreadable). */
export declare function currentLanguage(settings: SettingsHandle | undefined | null): string;
/**
 * Resolve the effective thinking-language id for one settings snapshot.
 * @param settings - the handle carrying the preference.
 * @param services - optional settings service used to read `locale.preference`
 *   (through `get(ns)` on 0.1.x and through `describe()` on 0.2.x).
 * @param systemLocale - optional browser-derived locale.
 */
export declare function resolveLanguage(settings: SettingsHandle | undefined | null, services?: SettingsReader | undefined | null, systemLocale?: string): string;
/** Compose the model instruction for one language id; `auto` and unknown ids yield "". */
export declare function thinkingInstruction(language: string | undefined): string;
/** Compose the per-step dynamic reminder for one language id; `auto` and unknown ids yield "". */
export declare function thinkingReminder(language: string | undefined): string;

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
/**
 * Claim the settings namespace and register the prompt surfaces.
 * @param ctx - host plugin context.
 * @param config - this plugin's resolved config; on DSH 0.2.x its volatile
 *   field is the live preference and the read handle for the prompt surfaces.
 */
export declare function apply(ctx: Context, config?: SettingsSection): void;
