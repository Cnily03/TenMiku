import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { QBotHonoEnv } from "..";

ed.hashes.sha512 = sha512;

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    // throw new Error("invalid hex string");
    hex = `0${hex}`;
  }
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return array;
}

function stringToBytes(str: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(str));
}

// function decodeBytes(bytes: Uint8Array): string {
//   return new TextDecoder().decode(bytes);
// }

export function calcSign(
  c: Context<QBotHonoEnv>,
  ts: string | ArrayBufferLike,
  plain: string | ArrayBufferLike
): string {
  const seed = Uint8Array.from(Buffer.from(c.env.QBOT_APP_SECRET));
  const { secretKey: privKey } = ed.keygen(seed);
  const b_ts = typeof ts === "string" ? stringToBytes(ts) : new Uint8Array(ts);
  const b_plain = typeof plain === "string" ? stringToBytes(plain) : new Uint8Array(plain);
  const msg = new Uint8Array(b_ts.length + b_plain.length);
  msg.set(b_ts, 0);
  msg.set(b_plain, b_ts.length);
  const signature = ed.sign(msg, privKey);
  return signature.toHex().toLowerCase();
}

export const PreinspectSignMw = createMiddleware<QBotHonoEnv>(async (c, next) => {
  // verify bot id
  const botId = c.req.header("X-Bot-Appid") || "";
  if (botId !== c.env.QBOT_APP_ID) {
    throw new HTTPException(401, { message: "bot id mismatch" });
  }
  // verify signature
  const seed = Uint8Array.from(Buffer.from(c.env.QBOT_APP_SECRET));
  const { publicKey: pubKey } = ed.keygen(seed);
  const sig = c.req.header("X-Signature-Ed25519") || "";
  const ts = c.req.header("X-Signature-Timestamp") || "";
  if (sig.length !== 128 || !ts) {
    throw new HTTPException(401, { message: "invalid signature headers" });
  }
  // timestamp + body
  const b_ts = stringToBytes(ts);
  const req = c.req.raw.clone();
  const b_body = new Uint8Array(await req.arrayBuffer());
  const msg = new Uint8Array(b_ts.length + b_body.length);
  msg.set(b_ts, 0);
  msg.set(b_body, b_ts.length);
  const ok = await ed.verifyAsync(hexToBytes(sig), msg, pubKey);
  if (!ok) {
    throw new HTTPException(401, { message: "invalid request signature" });
  }
  return await next();
});
