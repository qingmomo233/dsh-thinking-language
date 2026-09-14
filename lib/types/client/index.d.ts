import type { Context } from '@deepseek-ai/cordis';

/** One picker entry (`label` absent for the built-in `auto` entry). */
export interface ThinkingLanguageOption {
    id: string;
    /** Endonym plus English name, read from the host-registered settings schema. */
    label?: string;
}

/**
 * The browser half's public surface.
 *
 * The bundle exports exactly these names: `SETTINGS_NS`,
 * `THINKING_LANGUAGE_DEFAULT`, `apply`, `inject`, `findNamespaceSchema`,
 * `readCatalog`, and `readEnumField`. The remaining declarations describe
 * module-internal values that are documented here because they are part of the
 * contract the host half shares.
 */
/** The "follow the system locale" value shared with the host schema. */
export declare const THINKING_LANGUAGE_DEFAULT: 'auto';
/** Dictionary namespace owned by the settings row. */
export declare const SETTINGS_NS: 'settings.thinking-language';
/** Settings namespace owned by the host entry. */
export declare const THINKING_NS: 'thinking-language';
/** Field carrying the selected language id. */
export declare const THINKING_LANGUAGE_FIELD: 'language';
/** The browser fallback copy of the language catalog. */
export declare const FALLBACK_LANGUAGES: ThinkingLanguageOption[];

/** Find one namespace's serialized schema in a `describe()` result of either shape. */
export declare function findNamespaceSchema(described: unknown, ns: string): Record<string, unknown> | undefined;
/** Extract an enum field's `{ id, label }` entries from a schemastery JSON tree. */
export declare function readEnumField(schema: Record<string, unknown>, field: string): ThinkingLanguageOption[];
/** Build the picker catalog from the host schema, falling back to the bundled copy. */
export declare function readCatalog(described: unknown, ns: string): ThinkingLanguageOption[];

/**
 * Required client services. Only `slots` is hard: `settingsScope` is acquired
 * through its own `ctx.inject` branch and `locale` is optional, so a leaner
 * harness loses individual features instead of the whole bundle.
 */
export declare const inject: ['slots'];
/** Client plugin body: register the picker row into Settings → General. */
export declare function apply(ctx: Context): void;
