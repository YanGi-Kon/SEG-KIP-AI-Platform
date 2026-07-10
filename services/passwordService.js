import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const DEFAULT_COST = 16384;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url');
}

export function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 12 || value.length > 200) {
    throw new Error('Password must contain 12-200 characters');
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    throw new Error('Password must include uppercase, lowercase and numeric characters');
  }
  return value;
}

export async function hashPassword(password, options = {}) {
  const value = validatePasswordStrength(password);
  const cost = Number(options.cost || DEFAULT_COST);
  const blockSize = Number(options.blockSize || DEFAULT_BLOCK_SIZE);
  const parallelization = Number(options.parallelization || DEFAULT_PARALLELIZATION);
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(value, salt, KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: MAX_MEMORY,
  });
  return [
    'scrypt',
    cost,
    blockSize,
    parallelization,
    encode(salt),
    encode(key),
  ].join('$');
}

export async function verifyPassword(password, encodedHash) {
  const parts = String(encodedHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, costText, blockSizeText, parallelizationText, saltText, keyText] = parts;
  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);
  const salt = decode(saltText);
  const expected = decode(keyText);

  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) return false;
  if (expected.length !== KEY_LENGTH || salt.length < 16) return false;

  try {
    const actual = await scryptAsync(String(password || ''), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: MAX_MEMORY,
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch (_) {
    return false;
  }
}
