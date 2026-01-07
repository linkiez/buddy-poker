import { describe, expect, it, vi } from 'vitest';

import { appendRoundHistory } from './round-history';

describe('appendRoundHistory', () => {
  it('should throw for invalid maxRounds', () => {
    expect(() =>
      appendRoundHistory({
        reveal: false,
        participants: [{ name: 'A', vote: '1' }],
        history: [],
        maxRounds: 0,
      }),
    ).toThrow(TypeError);

    expect(() =>
      appendRoundHistory({
        reveal: false,
        participants: [{ name: 'A', vote: '1' }],
        history: [],
        maxRounds: Number.NaN,
      }),
    ).toThrow(TypeError);
  });

  it('should not append when there are no votes and reveal=false', () => {
    const history = appendRoundHistory({
      reveal: false,
      participants: [{ name: 'A', vote: null }],
      history: [],
      maxRounds: 10,
      now: vi.fn(() => 123),
    });

    expect(history).toEqual([]);
  });

  it('should append when there is at least one vote', () => {
    const history = appendRoundHistory({
      reveal: false,
      participants: [
        { name: 'A', vote: '3' },
        { name: 'B', vote: null },
      ],
      history: [],
      maxRounds: 10,
      now: vi.fn(() => 123),
    });

    expect(history).toEqual([
      {
        endedAtMs: 123,
        reveal: false,
        votes: [
          { name: 'A', vote: '3' },
          { name: 'B', vote: null },
        ],
      },
    ]);
  });

  it('should append when reveal=true even with no votes', () => {
    const history = appendRoundHistory({
      reveal: true,
      participants: [{ name: 'A', vote: null }],
      history: [],
      maxRounds: 10,
      now: vi.fn(() => 123),
    });

    expect(history).toHaveLength(1);
  });

  it('should keep only the last maxRounds entries', () => {
    const now = vi.fn(() => 1);
    let history: any[] = [];

    for (let i = 0; i < 5; i += 1) {
      now.mockReturnValueOnce(i);
      history = appendRoundHistory({
        reveal: false,
        participants: [{ name: 'A', vote: String(i) }],
        history,
        maxRounds: 3,
        now,
      });
    }

    expect(history).toHaveLength(3);
    expect(history[0].endedAtMs).toBe(2);
    expect(history[2].endedAtMs).toBe(4);
  });

  it('should use Date.now when now is not provided', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(999);

    const history = appendRoundHistory({
      reveal: true,
      participants: [{ name: 'A', vote: null }],
      history: [],
      maxRounds: 10,
    });

    expect(history[0]?.endedAtMs).toBe(999);
    spy.mockRestore();
  });
});
