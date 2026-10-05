// Throwaway authenticated loopback probe: POST /api/<endpoint> through the
// desktop harness's own RPC surface, using a browser-session cookie forged
// from the grant secret in ~/.dsh/.credentials.yaml.
const fs = require("node:fs");
const crypto = require("node:crypto");

const AUTHORITY = "127.0.0.1:19387";
const CREDENTIALS = "C:/Users/lmk/.dsh/.credentials.yaml";

const b64u = (buffer) =>
	Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function secret() {
	const text = fs.readFileSync(CREDENTIALS, "utf8");
	const match = /secret:\s*([A-Za-z0-9_-]{40,50})/.exec(text);
	if (match === null) throw new Error("no client-connection secret found");
	return Buffer.from(match[1].replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function cookie() {
	const name = "dsh-auth-" + b64u(crypto.createHash("sha256").update(AUTHORITY).digest());
	const now = Date.now();
	const body = b64u(JSON.stringify({ version: 1, authority: AUTHORITY, issuedAt: now - 1000, expiresAt: now + 3600_000 }));
	const mac = b64u(crypto.createHmac("sha256", secret()).update(body).digest());
	return name + "=v1." + body + "." + mac;
}

async function call(endpoint, args = {}) {
	const response = await fetch("http://" + AUTHORITY + "/api/" + endpoint, {
		method: "POST",
		headers: { cookie: cookie(), host: AUTHORITY, "content-type": "application/json" },
		body: JSON.stringify({ type: "client-request", rpcId: "probe-" + Date.now(), method: endpoint, payload: { args } })
	});
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function main() {
	const [endpoint, ...rest] = process.argv.slice(2);
	// PowerShell mangles inline JSON argv, so PROBE_ARGS is the reliable channel.
	const raw = rest.length === 0 ? (process.env.PROBE_ARGS ?? "") : rest.join(" ");
	const result = await call(endpoint, raw.trim() === "" ? {} : JSON.parse(raw));
	console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
