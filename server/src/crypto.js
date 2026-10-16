// Пароли: PBKDF2-SHA256 через WebCrypto. Токены: случайные 32 байта, в базе только SHA-256.
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0));

export function randomToken(bytes = 32) { return b64u(crypto.getRandomValues(new Uint8Array(bytes))); }

export async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password, iterations) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${b64u(salt)}$${b64u(await derive(password, salt, iterations))}`;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export async function verifyPassword(password, stored) {
  const [alg, it, salt, hash] = String(stored).split("$");
  if (alg !== "pbkdf2-sha256" || !it || !salt || !hash) return false;
  return safeEqual(await derive(password, unb64u(salt), Number(it)), unb64u(hash));
}

// Для неизвестного логина считаем такой же хеш, чтобы по времени ответа нельзя было понять, есть ли аккаунт.
let dummy;
export async function dummyVerify(password, iterations) {
  dummy ||= hashPassword("dummy-password-for-timing", iterations);
  await verifyPassword(password, await dummy);
  return false;
}
