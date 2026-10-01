import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AdminAuth } from "../src/admin-auth.js";

test("rotated key survives restart and overrides bootstrap env; only a salted hash is stored", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "intercode-auth-"));
  try {
    const oldKey = "old-admin-key-with-at-least-32-characters";
    const newKey = "new-admin-key-with-at-least-32-characters";
    const auth = new AdminAuth(dir, oldKey);
    await auth.init();
    assert.equal(await auth.rotate(`Bearer ${oldKey}`, oldKey, newKey), "ok");
    assert.equal(await auth.verify(oldKey), false);
    assert.equal(await auth.verify(newKey), true);
    const raw = await readFile(path.join(dir, "admin-key.json"), "utf8");
    assert.ok(!raw.includes(oldKey) && !raw.includes(newKey));
    const restarted = new AdminAuth(dir, oldKey);
    await restarted.init();
    assert.equal(await restarted.verify(oldKey), false);
    assert.equal(await restarted.verify(newKey), true);
    const noEnv = new AdminAuth(dir, "");
    await noEnv.init();
    assert.equal(await noEnv.verify(newKey), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rotation checks current credentials, validates new key and serializes competing changes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "intercode-auth-"));
  try {
    const oldKey = "old-admin-key-with-at-least-32-characters";
    const newKey = "new-admin-key-with-at-least-32-characters";
    const auth = new AdminAuth(dir, oldKey);
    await auth.init();
    assert.equal(await auth.rotate(`Bearer ${oldKey}`, "wrong", newKey), "unauthorized");
    assert.equal(await auth.rotate("Bearer wrong", oldKey, newKey), "unauthorized");
    for (const invalid of ["short", "a".repeat(257), "a".repeat(32) + " ", null, "я".repeat(32)]) {
      assert.equal(await auth.rotate(`Bearer ${oldKey}`, oldKey, invalid), "invalid_key");
    }
    assert.equal(await auth.rotate(`Bearer ${oldKey}`, oldKey, oldKey), "same_key");
    const results = await Promise.all([
      auth.rotate(`Bearer ${oldKey}`, oldKey, newKey),
      auth.rotate(`Bearer ${oldKey}`, oldKey, "other-admin-key-with-at-least-32-characters"),
    ]);
    assert.deepEqual(results, ["ok", "unauthorized"]);
    assert.equal(await auth.verify(newKey), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("disk failure leaves the current key valid", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "intercode-auth-"));
  try {
    const oldKey = "old-admin-key-with-at-least-32-characters";
    const auth = new AdminAuth(dir, oldKey);
    await auth.init();
    auth.file = path.join(dir, "missing-parent", "admin-key.json");
    await assert.rejects(auth.rotate(`Bearer ${oldKey}`, oldKey, "new-admin-key-with-at-least-32-characters"));
    assert.equal(await auth.verify(oldKey), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
