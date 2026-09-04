/**
 * Minimal WebCrypto surface. The package targets `lib: ["ES2022"]` with no DOM
 * and no @types/node so it stays honestly isomorphic; we declare only the two
 * members we actually use, both of which exist in Node 20+ and every target
 * browser.
 */
declare const crypto: {
  randomUUID(): string;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
