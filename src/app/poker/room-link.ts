export type ParsedRoomInput = {
  roomId: string;
  token: string | null;
};

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

  const url = parseAsUrl(raw) ?? parseAsUrlWithBase(raw);
  if (url) {
    const segments = url.pathname.split('/').filter(Boolean);
    const roomIndex = segments.indexOf('room');

    const roomId = roomIndex >= 0 ? segments[roomIndex + 1] ?? '' : raw.split('?')[0];
    const token = url.searchParams.get('token');
    return { roomId: roomId.trim(), token: token?.trim() || null };
  }

  const [roomIdPart, queryPart] = raw.split('?', 2);
  if (!queryPart) {
    return { roomId: roomIdPart.trim(), token: null };
  }

  const params = new URLSearchParams(queryPart);
  const token = params.get('token');
  return { roomId: roomIdPart.trim(), token: token?.trim() || null };
}
