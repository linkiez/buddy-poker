export type ParsedRoomInput = {
  roomId: string;
  token: string | null;
};

export function normalizeRoomId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .slice(0, 32);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAsUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function parseAsUrlWithBase(input: string): URL | null {
  try {
    return new URL(input, 'http://local');
  } catch {
    return null;
  }
}

export function parseRoomInput(input: string): ParsedRoomInput {
  const raw = input.trim();
  if (!raw) {
    return { roomId: '', token: null };
  }

  const absoluteUrl = parseAsUrl(raw);
  const url = absoluteUrl ?? parseAsUrlWithBase(raw);
  if (url) {
    const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
    const roomIndex = segments.indexOf('room');
    const rawRoomId = raw.split('?', 2)[0];
    const looksLikeAbsoluteUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawRoomId);

    const roomId = roomIndex >= 0
      ? normalizeRoomId(segments[roomIndex + 1] ?? '')
      : absoluteUrl || looksLikeAbsoluteUrl
        ? rawRoomId
        : normalizeRoomId(rawRoomId);
    const token = url.searchParams.get('token');
    return { roomId: roomId.trim(), token: token?.trim() || null };
  }

  const [roomIdPart, queryPart] = raw.split('?', 2);
  const looksLikeAbsoluteUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(roomIdPart);
  const normalizedRoomId = looksLikeAbsoluteUrl ? roomIdPart.trim() : normalizeRoomId(roomIdPart);

  if (!queryPart) {
    return { roomId: normalizedRoomId, token: null };
  }

  const params = new URLSearchParams(queryPart);
  const token = params.get('token');
  return { roomId: normalizedRoomId, token: token?.trim() || null };
}
