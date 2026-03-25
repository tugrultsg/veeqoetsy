/**
 * AES-256-GCM encryption/decryption using Web Crypto API.
 * Stores as "iv:ciphertext" (both base64 encoded).
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getKey(encryptionKeyHex: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(encryptionKeyHex);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(
  plaintext: string,
  encryptionKeyHex: string
): Promise<string> {
  const key = await getKey(encryptionKeyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return `${toBase64(iv.buffer)}:${toBase64(ciphertext)}`;
}

export async function decrypt(
  encrypted: string,
  encryptionKeyHex: string
): Promise<string> {
  const [ivB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted format");
  }

  const key = await getKey(encryptionKeyHex);
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(ciphertextB64);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
