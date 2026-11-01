/** Links antigos continuam válidos; novos compartilhamentos usam /@usuario. */
export function readProfileUsername(address: string): string | null {
  const url = new URL(address);
  let candidate: string | null;
  try {
    candidate = url.pathname.startsWith("/@")
      ? decodeURIComponent(url.pathname.slice(2).replace(/\/$/, ""))
      : url.searchParams.get("perfil");
  } catch {
    return null;
  }
  const username = candidate?.trim().toLowerCase();
  return username && /^[a-z0-9_]{3,24}$/.test(username) ? username : null;
}

export function profilePath(username: string): string {
  return `/@${encodeURIComponent(username)}`;
}
