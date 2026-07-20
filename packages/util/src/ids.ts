const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

export function generateId(prefix = ""): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const rand =
    g.crypto && typeof g.crypto.randomUUID === "function"
      ? g.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${rand}` : rand;
}
