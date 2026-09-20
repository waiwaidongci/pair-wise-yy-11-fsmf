let seq = 0;

export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
