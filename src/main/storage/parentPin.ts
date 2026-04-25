import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { ParentPinRecord } from "@shared/config";
import { readConfig, writeConfig } from "./config";
import type { HiBitLayout } from "./layout";

const PBKDF2_DIGEST = "sha256";
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;
export const DEFAULT_KEY_LENGTH = 32;
export const DEFAULT_SALT_BYTES = 16;
export const MIN_PIN_LENGTH = 4;

const pbkdf2Async = promisify(pbkdf2);

export type SetParentPinOptions = {
  iterations?: number;
  keyLength?: number;
  saltBytes?: number;
};

export function validatePin(pin: string): void {
  if (typeof pin !== "string" || pin.length < MIN_PIN_LENGTH) {
    throw new Error(`Parent PIN must be at least ${MIN_PIN_LENGTH} characters`);
  }
}

export async function setParentPin(
  layout: HiBitLayout,
  pin: string,
  opts: SetParentPinOptions = {},
): Promise<ParentPinRecord> {
  validatePin(pin);
  const iterations = opts.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const keyLength = opts.keyLength ?? DEFAULT_KEY_LENGTH;
  const saltBytes = opts.saltBytes ?? DEFAULT_SALT_BYTES;
  const saltBuf = randomBytes(saltBytes);
  const hashBuf = await pbkdf2Async(pin, saltBuf, iterations, keyLength, PBKDF2_DIGEST);
  const record: ParentPinRecord = {
    algorithm: "pbkdf2-sha256",
    iterations,
    keyLength,
    salt: saltBuf.toString("hex"),
    hash: hashBuf.toString("hex"),
  };
  const config = await readConfig(layout);
  await writeConfig(layout, { ...config, parentPin: record });
  return record;
}

export async function verifyParentPin(layout: HiBitLayout, pin: string): Promise<boolean> {
  if (typeof pin !== "string" || pin.length === 0) return false;
  const config = await readConfig(layout);
  const record = config.parentPin;
  if (!record) return false;
  const saltBuf = Buffer.from(record.salt, "hex");
  const expected = Buffer.from(record.hash, "hex");
  const candidate = await pbkdf2Async(
    pin,
    saltBuf,
    record.iterations,
    record.keyLength,
    PBKDF2_DIGEST,
  );
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function hasParentPin(layout: HiBitLayout): Promise<boolean> {
  const config = await readConfig(layout);
  return config.parentPin !== undefined;
}

export async function clearParentPin(layout: HiBitLayout): Promise<void> {
  const config = await readConfig(layout);
  if (!config.parentPin) return;
  const { parentPin: _omit, ...rest } = config;
  await writeConfig(layout, rest);
}
