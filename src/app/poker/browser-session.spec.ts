import { describe, expect, it } from 'vitest';

import {
  clearBrowserSession,
  getBrowserSession,
  getBrowserSessionStorageKey,
  getHttpOnlyPreference,
  isHttpOnlyEnabled,
  migrateLegacyBrowserSession,
  saveBrowserSession,
  setHttpOnlyPreference,
} from './browser-session';
import type { BrowserSessionEnvelope } from './transport.types';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function createSession(overrides: Partial<BrowserSessionEnvelope> = {}): BrowserSessionEnvelope {
  return {
    schemaVersion: 1,
    roomId: 'room-1',
    clientId: 'client-1',
    name: ' Alice ',
    lastEventId: 4,
    updatedAt: 100,
    ...overrides,
  };
}

describe('browser session', () => {
  it('should save a validated, trimmed session envelope', () => {
    const storage = createStorage();

    saveBrowserSession(createSession(), storage);

    expect(getBrowserSession('room-1', storage)).toEqual({
      ...createSession(),
      name: 'Alice',
    });
  });

  it('should reject envelopes from another room and remove invalid storage', () => {
    const storage = createStorage();
    storage.setItem(getBrowserSessionStorageKey('room-1'), JSON.stringify(createSession({ roomId: 'room-2' })));

    expect(getBrowserSession('room-1', storage)).toBeNull();
    expect(storage.getItem(getBrowserSessionStorageKey('room-1'))).toBeNull();
  });

  it('should reject unknown schema versions and remove their storage', () => {
    const storage = createStorage();
    storage.setItem(
      getBrowserSessionStorageKey('room-1'),
      JSON.stringify({ ...createSession(), schemaVersion: 2 }),
    );

    expect(getBrowserSession('room-1', storage)).toBeNull();
    expect(storage.getItem(getBrowserSessionStorageKey('room-1'))).toBeNull();
  });

  it('should reject names longer than 32 characters', () => {
    const storage = createStorage();

    expect(() => saveBrowserSession(createSession({ name: 'a'.repeat(33) }), storage)).toThrow();
  });

  it('should migrate legacy client, cursor, and name keys into one envelope', () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    localStorage.setItem('bp_clientId_room-1', 'legacy-client');
    localStorage.setItem('bp_lastEventId_room-1', '7');
    sessionStorage.setItem('bp_name', ' Legacy Alice ');

    expect(migrateLegacyBrowserSession('room-1', localStorage, sessionStorage)).toMatchObject({
      schemaVersion: 1,
      roomId: 'room-1',
      clientId: 'legacy-client',
      name: 'Legacy Alice',
      lastEventId: 7,
    });
    expect(localStorage.getItem('bp_clientId_room-1')).toBeNull();
    expect(localStorage.getItem('bp_lastEventId_room-1')).toBeNull();
    expect(sessionStorage.getItem('bp_name')).toBeNull();
  });

  it('should migrate legacy keys when loading a missing envelope', () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    localStorage.setItem('bp_clientId_room-1', 'legacy-client');
    sessionStorage.setItem('bp_name', 'Legacy Alice');

    expect(getBrowserSession('room-1', localStorage, sessionStorage)?.clientId).toBe('legacy-client');
    expect(localStorage.getItem(getBrowserSessionStorageKey('room-1'))).not.toBeNull();
  });

  it('should expose the HTTP-only preference through session storage', () => {
    const storage = createStorage();

    expect(isHttpOnlyEnabled(storage)).toBe(false);
    setHttpOnlyPreference(true, storage);
    expect(isHttpOnlyEnabled(storage)).toBe(true);
    expect(getHttpOnlyPreference(storage)).toBe(true);
    setHttpOnlyPreference(false, storage);
    expect(isHttpOnlyEnabled(storage)).toBe(false);
  });

  it('should clear a room session explicitly', () => {
    const storage = createStorage();
    saveBrowserSession(createSession(), storage);

    clearBrowserSession('room-1', storage);

    expect(getBrowserSession('room-1', storage)).toBeNull();
  });
});
