export function isValidTableName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name) && name.length <= 64;
}
export function sanitizeInput(input: string): string {
  return input.replace(/[<>"'&]/g, "");
}
