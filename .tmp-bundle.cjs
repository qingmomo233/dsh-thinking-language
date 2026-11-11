// Throwaway: confirm the harness serves the reworked client bundle (the row
// layout) and that the settings namespace is now advertised.
const fs = require("node:fs");
const crypto = require("node:crypto");

const AUTHORITY = "127.0.0.1:19387";
const CREDENTIALS = "C:/Users/lmk/.dsh/.credentials.yaml";
const b64u = (buffer) =>
	Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function cookie() {
	const text = fs.readFileSync(CREDENTIALS, "utf8");
	const match = /secret:\s*([A-Za-z0-9_-]{40,50})/.exec(text);
	const key = Buffer.from(match[1].replace(/-/g, "+").replace(/_/g, "/"), "base64");
	const name = "dsh-auth-" + b64u(crypto.createHash("sha256").update(AUTHORITY).digest());
	const now = Date.now();
	const body = b64u(JSON.stringify({ version: 1, authority: AUTHORITY, issuedAt: now - 1000, expiresAt: now + 3600_000 }));
	return name + "=v1." + body + "." + b64u(crypto.createHmac("sha256", key).update(body).digest());
}

async function main() {
	const headers = { cookie: cookie(), host: AUTHORITY };
	const page = await (await fetch("http://" + AUTHORITY + "/", { headers })).text();
	const boot = /globalThis\["__DSH_BOOT__"\]\s*=\s*(\{.*?\});?\s*<\/script>/s.exec(page);
	const manifest = JSON.parse(boot[1]);
	const entry = manifest.entries.find((row) => row.id === "dsh-thinking-language");
	console.log("entry:", JSON.stringify(entry));
	const bundle = await (await fetch("http://" + AUTHORITY + "/" + entry.url, { headers })).text();
	console.log("bundle bytes:", bundle.length, "rev:", entry.rev);
	for (const marker of ["dshtl_row", "dshtl_rowText", "dshtl_title", "dshtl_desc", "dshtl_selector"]) {
		console.log("  " + marker + " ->", bundle.includes(marker));
	}
	for (const gone of ["dshtl_heading", "dshtl_intro", "dshtl_field"]) {
		console.log("  " + gone + " (removed) ->", bundle.includes(gone));
	}
	const response = await fetch("http://" + AUTHORITY + "/api/settings/describe", {
		method: "POST",
		headers: { ...headers, "content-type": "application/json" },
		body: JSON.stringify({ type: "client-request", rpcId: "probe-" + Date.now(), method: "settings/describe", payload: { args: {} } })
	});
	const described = await response.json();
	const namespaces = (described.value ?? described.result?.value)?.namespaces ?? [];
	const target = namespaces.find((row) => row.ns === "thinking-language");
	console.log("namespaces:", namespaces.length, "| thinking-language served:", target !== undefined);
	if (target !== undefined) {
		console.log("  schema:", JSON.stringify(target.schema), "| value:", JSON.stringify(target.value), "| revision:", target.revision);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
