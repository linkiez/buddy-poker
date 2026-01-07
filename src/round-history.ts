export type PokerRoundHistoryEntry = {
  endedAtMs: number;
  reveal: boolean;
  votes: Array<{ name: string; vote: string | null }>;
};

export type AppendRoundHistoryInput = {
  reveal: boolean;
  participants: Iterable<{ name: string; vote: string | null }>;
  history: PokerRoundHistoryEntry[];
  maxRounds: number;
  now?: () => number;
};

export function appendRoundHistory(input: AppendRoundHistoryInput): PokerRoundHistoryEntry[] {
  const now = input.now ?? (() => Date.now());
  const maxRounds = Math.floor(input.maxRounds);

  if (!Number.isFinite(maxRounds) || maxRounds <= 0) {
    throw new TypeError('maxRounds must be a positive integer');
  }

  const votes = Array.from(input.participants).map((p) => ({
    name: p.name,
    vote: p.vote,
  }));

  const hasAnyVote = votes.some((v) => v.vote !== null);
  if (!hasAnyVote && !input.reveal) {
    return input.history;
  }

  const next: PokerRoundHistoryEntry[] = [
    ...input.history,
    {
      endedAtMs: now(),
      reveal: input.reveal,
      votes,
    },
  ];

  if (next.length <= maxRounds) {
    return next;
  }

  return next.slice(next.length - maxRounds);
}
