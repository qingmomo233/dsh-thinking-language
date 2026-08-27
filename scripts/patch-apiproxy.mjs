#!/usr/bin/env node
/**
 * dsh-thinking-language — settings exposure patch.
 *
 * DeepSeek Harness intentionally keeps a hard-coded allowlist of settings
 * namespaces that the browser may read/write (WEB_SETTINGS_NAMESPACES in
 * `@deepseek-ai/dsh-host-apiproxy`). The comment above that list says exposing
 * a plugin-owned namespace "is a decision made here rather than by the
 * registering plugin" and that moving the declaration to `settings.register()`
 * "is deferred work". Until that lands, a third-party plugin's namespace is
 * registered host-side but answers `settings-not-exposed` to the browser, so
 * the Settings picker would render but never persist.
 *
 * This script makes the one-line allowlist edit idempotently across every
 * installed copy of dsh-host-apiproxy it can find:
 *
 *   1. any path passed as a CLI argument (a lib/index.js or a package root)
 *   2. every `@deepseek-ai/dsh-host-apiproxy` under `$DSH_HOME/profiles` node_modules trees
 *      (default `$DSH_HOME` = `~/.dsh`)
 *
 * Usage:
 *   node scripts/patch-apiproxy.mjs
 *   node scripts/patch-apiproxy.mjs <path-to-dsh-host-apiproxy-lib-index.js> ...
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readdirSync } from "node:fs";

const TARGET = '"thinking-language",';
const NEEDLE = /(const WEB_SETTINGS_NAMESPACES = \[\n)((?:\t"[^"]+",\n)+)(\t\]);/;

/** Apply the allowlist edit to one lib/index.js; returns true when changed. */
function patchFile(file) {
	const source = readFileSync(file, "utf8");
	if (!source.includes(TARGET)) {
		const match = NEEDLE.exec(source);
		if (!match) {
			console.error(`  !! could not locate WEB_SETTINGS_NAMESPACES in ${file}`);
			return false;
		}
		const entries = match[2];
		const anchor = entries.includes('\t"permission",\n') ? '\t"permission",\n' : entries.split("\n")[0] + "\n";
		const next = match[1] + entries.replace(anchor, anchor + TARGET + "\n") + match[3];
		writeFileSync(file, source.replace(match[0], next));
		console.log(`  patched ${file}`);
		return true;
	}
	console.log(`  already patched ${file}`);
	return false;
}

/** The dsh-host-apiproxy lib/index.js under one node_modules root, if present. */
function candidate(nmRoot) {
	const file = join(nmRoot, "@deepseek-ai", "dsh-host-apiproxy", "lib", "index.js");
	return existsSync(file) ? [file] : [];
}

const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
const profilesRoot = join(dshHome, "profiles");
const profileNames = existsSync(profilesRoot) ? readdirSync(profilesRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
const candidates = [
	...process.argv.slice(2).map((arg) => (basename(arg) === "index.js" ? arg : join(arg, "lib", "index.js"))),
	...candidate(join(profilesRoot, "node_modules")),
	...profileNames.flatMap((name) => candidate(join(profilesRoot, name, "node_modules")))
];
for (const file of [...new Set(candidates)]) if (existsSync(file)) patchFile(file);

console.log("done");
