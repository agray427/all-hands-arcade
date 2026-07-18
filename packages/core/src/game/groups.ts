export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export interface Pairing<T> {
  pairs: [T, T][];
  bye: T | null;
}

export function pairUp<T>(items: readonly T[], random: () => number): Pairing<T> {
  const order = shuffled(items, random);
  const pairs: [T, T][] = [];
  for (let i = 0; i + 1 < order.length; i += 2) {
    pairs.push([order[i]!, order[i + 1]!]);
  }
  return { pairs, bye: order.length % 2 === 1 ? order[order.length - 1]! : null };
}

export function chunkChains<T>(items: readonly T[], size: number, random: () => number): T[][] {
  const order = shuffled(items, random);
  const chains: T[][] = [];
  for (let i = 0; i < order.length; i += size) {
    chains.push(order.slice(i, i + size));
  }
  if (chains.length > 1 && chains[chains.length - 1]!.length === 1) {
    const orphan = chains.pop()!;
    chains[chains.length - 1]!.push(orphan[0]!);
  }
  return chains;
}

export function normalizeText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}
