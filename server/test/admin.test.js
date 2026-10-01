import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

async function launch(token, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "intercode-admin-"));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    env: { ...process.env, PORT: "0", DATA_DIR: dir, ADMIN_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Server startup timed out")), 10000);
      child.stdout.on("data", (data) => {
        output += data;
        const match = /server listening on :(\d+)/.exec(output);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", () => { clearTimeout(timer); reject(new Error("Server exited before startup")); });
    });
    await run(`http://127.0.0.1:${port}`);
  } finally {
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
}

test("admin auth, visits, session lifecycle and privacy", async () => {
  const token = "test-admin-key-with-at-least-32-characters";
  await launch(token, async (base) => {
    const headers = { Authorization: `Bearer ${token}` };
    assert.equal((await fetch(`${base}/api/admin/stats`)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/stats`, { headers: { Authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await fetch(`${base}/api/admin/stats?days=999`, { headers })).status, 400);
    assert.equal((await fetch(`${base}/api/analytics/visit`, { method: "POST" })).status, 204);
    const created = await fetch(`${base}/api/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: "python", initialCode: "private code" }) });
    const meta = await created.json();
    assert.equal(created.status, 201);
    const ws = new WebSocket(`${base.replace("http", "ws")}/ws/${meta.id}?r=e&k=${meta.tokens.interviewee}`);
    await once(ws, "open");
    // Welcome can precede the asynchronous statistics disk write.
    let result;
    for (let i = 0; i < 40; i++) {
      const response = await fetch(`${base}/api/admin/stats?days=7`, { headers });
      assert.equal(response.headers.get("cache-control"), "no-store");
      result = await response.json();
      if (result.totals.started === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(result.totals.started, 1);
    assert.equal(result.online, 1);
    ws.close();
    await once(ws, "close");
    const endUrl = `${base}/api/sessions/${meta.id}/update?r=i&k=${meta.tokens.interviewer}`;
    for (let i = 0; i < 2; i++) assert.equal((await fetch(endUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ended" }) })).status, 200);
    result = await (await fetch(`${base}/api/admin/stats`, { headers })).json();
    assert.equal(result.totals.visits, 1);
    assert.equal(result.totals.created, 1);
    assert.equal(result.totals.ended, 1);
    assert.doesNotMatch(JSON.stringify(result), /private code|tokens/);
  });
});

test("admin is disabled without a sufficiently long server key", async () => {
  await launch("", async (base) => {
    assert.equal((await fetch(`${base}/api/admin/stats`)).status, 503);
    assert.equal((await fetch(`${base}/api/admin/key`, { method: "POST" })).status, 503);
  });
});

test("key rotation API rejects invalid requests and revokes old access", async () => {
  const token = "test-admin-key-with-at-least-32-characters";
  const newToken = "changed-admin-key-with-at-least-32-characters";
  await launch(token, async (base) => {
    const change = (currentToken, nextToken, authorization = `Bearer ${token}`) => fetch(`${base}/api/admin/key`, {
      method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ currentToken, newToken: nextToken }),
    });
    assert.equal((await change(token, newToken, "Bearer wrong")).status, 401);
    assert.equal((await change("wrong", newToken)).status, 401);
    assert.equal((await change(token, "short")).status, 400);
    assert.equal((await change(token, token)).status, 400);
    assert.equal((await fetch(`${base}/api/admin/key`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "null",
    })).status, 400);
    const changed = await change(token, newToken);
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { ok: true });
    assert.equal((await fetch(`${base}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    assert.equal((await change(token, newToken)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/stats`, { headers: { Authorization: `Bearer ${newToken}` } })).status, 200);
  });
});
