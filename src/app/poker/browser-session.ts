import type { BrowserSessionEnvelope } from './transport.types';

export const BROWSER_SESSION_SCHEMA_VERSION = 1 as const;
export const HTTP_ONLY_STORAGE_KEY = 'bp_httpOnly';

const MAX_NAME_LENGTH = 32;

type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

function getStorage(storage: StorageLike | undefined, globalName: 'localStorage' | 'sessionStorage'): StorageLike | null {
  if (storage) {
    return storage;
  }

  if (typeof globalThis === 'undefined') {
    return null;
  }

  const candidate = globalThis[globalName];
  return candidate ?? null;
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim();
}

function normalizeName(name: string): string {
  return name.trim();
}

function isValidSessionEnvelope(value: unknown, roomId: string): value is BrowserSessionEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const envelope = value as Partial<BrowserSessionEnvelope>;
  const normalizedRoomId = normalizeRoomId(roomId);
  const normalizedName = typeof envelope.name === 'string' ? normalizeName(envelope.name) : '';

  return (
    envelope.schemaVersion === BROWSER_SESSION_SCHEMA_VERSION &&
    typeof envelope.roomId === 'string' &&
    envelope.roomId === normalizedRoomId &&
    typeof envelope.clientId === 'string' &&
    envelope.clientId.trim().length > 0 &&
    normalizedName.length > 0 &&
    normalizedName.length <= MAX_NAME_LENGTH &&
    (envelope.fingerprint === undefined || typeof envelope.fingerprint === 'string') &&
    typeof envelope.lastEventId === 'number' &&
    Number.isSafeInteger(envelope.lastEventId) &&
    envelope.lastEventId >= 0 &&
    typeof envelope.updatedAt === 'number' &&
    Number.isFinite(envelope.updatedAt)
  );
}

function parseSession(raw: string | null, roomId: string): BrowserSessionEnvelope | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSessionEnvelope(parsed, roomId)) {
      return null;
    }

    return {
      ...parsed,
      roomId: normalizeRoomId(parsed.roomId),
      name: normalizeName(parsed.name),
      ...(parsed.fingerprint ? { fingerprint: parsed.fingerprint.trim() } : {}),
    };
  } catch {
    return null;
  }
}

export function getBrowserSessionStorageKey(roomId: string): string {
  return `bp_session_${normalizeRoomId(roomId)}`;
}

export function saveBrowserSession(
  session: BrowserSessionEnvelope,
  storage?: StorageLike,
): void {
  const normalizedRoomId = normalizeRoomId(session.roomId);
  const normalizedName = normalizeName(session.name);
  const normalizedSession: BrowserSessionEnvelope = {
    ...session,
    schemaVersion: BROWSER_SESSION_SCHEMA_VERSION,
    roomId: normalizedRoomId,
    name: normalizedName,
  };

  if (!isValidSessionEnvelope(normalizedSession, normalizedRoomId)) {
    throw new Error('Invalid browser session envelope');
  }

  getStorage(storage, 'localStorage')?.setItem(
    getBrowserSessionStorageKey(normalizedRoomId),
    JSON.stringify(normalizedSession),
  );
}

export function getBrowserSession(
  roomId: string,
  storage?: StorageLike,
  sessionStorage?: StorageLike,
): BrowserSessionEnvelope | null {
  const normalizedRoomId = normalizeRoomId(roomId);
  const browserStorage = getStorage(storage, 'localStorage');
  if (!browserStorage) {
    return null;
  }

  const key = getBrowserSessionStorageKey(normalizedRoomId);
  const raw = browserStorage.getItem(key);
  const session = parseSession(raw, normalizedRoomId);
  if (session) {
    return session;
  }

  if (raw === null) {
    return migrateLegacyBrowserSession(normalizedRoomId, browserStorage, sessionStorage);
  }

  if (raw !== null) {
    browserStorage.removeItem(key);
  }

  return null;
}

export function clearBrowserSession(roomId: string, storage?: StorageLike): void {
  getStorage(storage, 'localStorage')?.removeItem(getBrowserSessionStorageKey(roomId));
}

export function migrateLegacyBrowserSession(
  roomId: string,
  localStorage?: StorageLike,
  sessionStorage?: StorageLike,
): BrowserSessionEnvelope | null {
  const normalizedRoomId = normalizeRoomId(roomId);
  const local = getStorage(localStorage, 'localStorage');
  const session = getStorage(sessionStorage, 'sessionStorage');
  if (!local) {
    return null;
  }

  const clientKey = `bp_clientId_${normalizedRoomId}`;
  const eventKey = `bp_lastEventId_${normalizedRoomId}`;
  const clientId = local.getItem(clientKey)?.trim() ?? '';
  const name = normalizeName(session?.getItem('bp_name') ?? '');
  const parsedEventId = Number.parseInt(local.getItem(eventKey) ?? '0', 10);

  if (!clientId || !name || name.length > MAX_NAME_LENGTH || !Number.isSafeInteger(parsedEventId) || parsedEventId < 0) {
    return null;
  }

  const migrated: BrowserSessionEnvelope = {
    schemaVersion: BROWSER_SESSION_SCHEMA_VERSION,
    roomId: normalizedRoomId,
    clientId,
    name,
    lastEventId: parsedEventId,
    updatedAt: Date.now(),
  };
  saveBrowserSession(migrated, local);
  local.removeItem(clientKey);
  local.removeItem(eventKey);
  session?.removeItem('bp_name');
  return migrated;
}

export function isHttpOnlyEnabled(storage?: StorageLike): boolean {
  return getStorage(storage, 'sessionStorage')?.getItem(HTTP_ONLY_STORAGE_KEY) === 'true';
}

export function getHttpOnlyPreference(storage?: StorageLike): boolean {
  return isHttpOnlyEnabled(storage);
}

export function setHttpOnlyPreference(enabled: boolean, storage?: StorageLike): void {
  const session = getStorage(storage, 'sessionStorage');
  if (!session) {
    return;
  }

  if (enabled) {
    session.setItem(HTTP_ONLY_STORAGE_KEY, 'true');
  } else {
    session.removeItem(HTTP_ONLY_STORAGE_KEY);
  }
}

export function clearHttpOnlyPreference(storage?: StorageLike): void {
  setHttpOnlyPreference(false, storage);
}
