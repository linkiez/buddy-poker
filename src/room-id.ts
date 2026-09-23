const MAX_ROOM_ID_LENGTH = 32;
const ROOM_ID_PATTERN = /^[a-z0-9-]+$/i;

export function isValidRoomId(input: string): boolean {
  const roomId = input.trim();
  return (
    roomId.length > 0 &&
    roomId.length <= MAX_ROOM_ID_LENGTH &&
    ROOM_ID_PATTERN.test(roomId)
  );
}
