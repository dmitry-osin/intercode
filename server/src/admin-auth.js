import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const validToken = (token) => typeof token === "string" && /^[\x21-\x7e]{32,256}$/.test(token);

export class AdminAuth {
  constructor(dataDir, initialToken) {
    this.file = path.join(dataDir, "admin-key.json");
    this.initialToken = initialToken;
    this.credentials = null;
    this.queue = Promise.resolve();
  }

  get enabled() { return this.credentials !== null; }

  async encode(token) {
    const salt = randomBytes(16).toString("hex");
    const hash = (await scrypt(token, salt, 64)).toString("hex");
    return { version: 1, salt, hash };
  }

  async init() {
    try {
      const saved = JSON.parse(await readFile(this.file, "utf8"));
      if (saved.version !== 1 || !/^[a-f0-9]{32}$/.test(saved.salt) || !/^[a-f0-9]{128}$/.test(saved.hash)) {
        throw new Error("Invalid admin credentials file");
      }
      this.credentials = saved;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (validToken(this.initialToken)) this.credentials = await this.encode(this.initialToken);
    }
    this.initialToken = null;
  }

  async verify(token) {
    const credentials = this.credentials;
    if (!credentials || !validToken(token)) return false;
    const actual = await scrypt(token, credentials.salt, 64);
    // A concurrent rotation invalidates a verification using old credentials.
    return credentials === this.credentials && timingSafeEqual(actual, Buffer.from(credentials.hash, "hex"));
  }

  async authorize(header) {
    return typeof header === "string" && header.startsWith("Bearer ") && this.verify(header.slice(7));
  }

  rotate(authorization, currentToken, newToken) {
    const job = this.queue.catch(() => {}).then(async () => {
      if (!await this.authorize(authorization) || !await this.verify(currentToken)) return "unauthorized";
      if (!validToken(newToken)) return "invalid_key";
      if (await this.verify(newToken)) return "same_key";
      const credentials = await this.encode(newToken);
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(credentials), { mode: 0o600 });
      await rename(tmp, this.file);
      this.credentials = credentials;
      return "ok";
    });
    this.queue = job;
    return job;
  }
}
