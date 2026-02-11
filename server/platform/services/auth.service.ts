export class AuthService {
  async validateToken(token: string) {
    if (!token) return { valid: false };
    return { valid: true, userId: "system" };
  }
  async getUserPermissions(userId: string) { return ["read", "write", "admin"]; }
}
export const authService = new AuthService();
