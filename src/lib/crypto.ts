import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. Stored format: base64(iv).base64(authTag).base64(ciphertext)
// CREDENTIALS_KEY must be 32 random bytes, base64-encoded.
// Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

function key(): Buffer {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) throw new Error("CREDENTIALS_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("CREDENTIALS_KEY must decode to 32 bytes");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
