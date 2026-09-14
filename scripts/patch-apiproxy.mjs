#!/usr/bin/env node
/**
 * dsh-thinking-language - settings-exposure patch for very old harnesses.
 *
 * History of DeepSeek Harness settings exposure:
 *
 *  - DSH <= 0.2.3 (dsh-host-apiproxy@0.1.0-rc.5) kept a hard-coded allowlist
 *    (`WEB_SETTINGS_NAMESPACES`) of the settings namespaces the browser may
 *    read and write. A plugin-owned namespace was registered host-side but
 *    answered `settings-not-exposed` to the browser, so the Settings picker
 *    rendered but never persisted. Those builds need the one-line allowlist
 *    edit below.
 *
 *  - DSH >= 0.2.6 exposes every registered namespace: the wire schema in
 *    `dsh-host-apiproxy` has no allowlist at all, and the settings controller
 *    answers with every registration. DSH >= 0.2.9 removed
 *    `dsh-host-apiproxy` entirely. On those builds there is nothing to patch.
 *
 * Editing another package's shipped bytes is a last resort, so this script:
 *
 *  - detects the allowlist instead of assuming it (absence is the common case
 *    now, and is reported as "exposure is automatic");
 *  - defaults to a dry run and prints what it would do; pass --write to apply;
 *  - writes a `<file>.dsh-thinking-language.bak` backup before the first edit;
 *  - refuses to guess: a file whose allowlist shape it cannot parse is left
 *    untouched and reported, never partially edited.
 *
 * Usage:
 *   node scripts/patch-apiproxy.mjs                 # dry run: find + report
 *   node scripts/patch-apiproxy.mjs --write         # apply where needed
 *   node scripts/patch-apiproxy.mjs --write <path>  # explicit lib/index.js or package root
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/** The allowlist entry to add. */
const ENTRY = '"thinking-language",';
/** The allowlist declaration; only present on DSH <= 0.2.3. */
const ALLOWLIST_OPEN = "WEB_SETTINGS_NAMESPACES";
/** Backup suffix for the pre-edit bytes. */
const BACKUP_SUFFIX = ".dsh-thinking-language.bak";

const args = process.argv.slice(2);
const write = args.includes("--write");
const explicit = args.filter((arg) => !arg.startsWith("--"));

/**
 * Apply the allowlist edit to one module file.
 * @param file - path to a `lib/index.js` that may carry the allowlist.
 * @returns "patched", "present", "automatic" (no allowlist), or "unknown".
 */
function patchFile(file) {
	const source = readFileSync(file, "utf8");
	if (source.includes(ENTRY)) {
		console.log("  already exposed: " + file);
		return "present";
	}
	const open = source.indexOf(ALLOWLIST_OPEN);
	if (open === -1) {
		console.log("  no " + ALLOWLIST_OPEN + " allowlist: exposure is automatic on this harness (" + file + ")");
		return "automatic";
	}
	const bracket = source.indexOf("[", open);
	const newline = bracket === -1 ? -1 : source.indexOf("\n", bracket);
	if (bracket === -1 || newline === -1) {
		console.error("  !! could not parse the " + ALLOWLIST_OPEN + " array in " + file + "; leaving it untouched");
		return "unknown";
	}
	// Insert at the top of the array, reusing the indentation of the first entry.
	const firstEntry = source.slice(newline + 1);
	const indent = (/^[ \t]*/.exec(firstEntry) ?? [""])[0];
	const insertAt = newline + 1;
	const next = source.slice(0, insertAt) + indent + ENTRY + "\n" + source.slice(insertAt);
	if (!write) {
		console.log("  would add " + ENTRY + " to the allowlist in " + file + "; re-run with --write to apply");
		return "patched";
	}
	const backup = file + BACKUP_SUFFIX;
	if (!existsSync(backup)) copyFileSync(file, backup);
	writeFileSync(file, next);
	console.log("  patched " + file + " (backup: " + backup + ")");
	return "patched";
}

/** The `dsh-host-apiproxy` module under one `node_modules` root, if present. */
function candidate(modulesRoot) {
	const file = join(modulesRoot, "@deepseek-ai", "dsh-host-apiproxy", "lib", "index.js");
	return existsSync(file) ? [file] : [];
}

/**
 * Every plausible DSH home: DSH_HOME first, then the desktop app's dsh-home,
 * then the classic ~/.dsh.
 */
function dshHomes() {
	const homes = [];
	if (process.env.DSH_HOME) homes.push(process.env.DSH_HOME);
	homes.push(join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Deepseek-Harness-Desktop", "dsh-home"));
	homes.push(join(homedir(), ".dsh"));
	return [...new Set(homes)];
}

/** Every `profiles` node_modules tree under one DSH home. */
function homeCandidates(dshHome) {
	const files = candidate(join(dshHome, "node_modules"));
	const profilesRoot = join(dshHome, "profiles");
	if (!existsSync(profilesRoot)) return files;
	files.push(...candidate(join(profilesRoot, "node_modules")));
	for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
		if (entry.isDirectory()) files.push(...candidate(join(profilesRoot, entry.name, "node_modules")));
	}
	return files;
}

const files = explicit.map((arg) => (basename(arg) === "index.js" ? arg : join(arg, "lib", "index.js")));
for (const home of dshHomes()) files.push(...homeCandidates(home));

const unique = [...new Set(files)].filter((file) => existsSync(file));
if (unique.length === 0) {
	console.log("no dsh-host-apiproxy found - this harness exposes every registered settings namespace automatically, so no patch is needed.");
	process.exit(0);
}

console.log(write ? "applying the settings-exposure patch..." : "checking the settings-exposure patch (dry run; pass --write to apply)...");
const results = unique.map(patchFile);
const count = (value) => results.filter((result) => result === value).length;
const summary = [
	"done: " + count("patched") + (write ? " patched" : " to patch"),
	count("present") + " already exposed",
	count("automatic") + " automatic",
	count("unknown") + " unparsed"
].join(", ");
console.log(summary);
if (count("unknown") > 0) process.exitCode = 1;
