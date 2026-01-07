export function isTokenAllowed(options: {
  roomToken: string;
  providedToken?: string;
  allowMissing: boolean;
}): boolean {
  const provided = options.providedToken?.trim();

  if (!provided) {
    return options.allowMissing;
  }

  return provided === options.roomToken;
}
