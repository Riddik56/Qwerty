import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import type { SessionDbUser, UserRole } from "./portal-db-types";

export const SESSION_COOKIE = "user_id";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith("scrypt$")) {
    const [, salt, hash] = storedHash.split("$");
    if (!salt || !hash) return false;
    const calculated = scryptSync(password, salt, 64);
    const stored = Buffer.from(hash, "hex");
    if (stored.length !== calculated.length) return false;
    return timingSafeEqual(stored, calculated);
  }

  return storedHash === `hashed_${password}`;
}

export function setSessionCookie(userId: number) {
  setCookie(SESSION_COOKIE, String(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export function clearSessionCookie() {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionUserId(): string | undefined {
  return getCookie(SESSION_COOKIE);
}

export async function requireUser(allowedRoles?: UserRole[]): Promise<SessionDbUser> {
  const userId = getSessionUserId();
  if (!userId) throw new Error("Требуется авторизация");

  const db = (await import("./db.server")).default;
  const user = db
    .prepare(
      `
      SELECT u.user_id, u.full_name, u.email, u.phone, u.password_hash, u.account_status, r.role_name
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      WHERE u.user_id = ?
    `,
    )
    .get(Number(userId)) as SessionDbUser | undefined;

  if (!user || user.account_status !== "active") {
    throw new Error("Пользователь не найден или заблокирован");
  }

  if (allowedRoles && !allowedRoles.includes(user.role_name)) {
    throw new Error("Доступ запрещен для вашей роли");
  }

  return user;
}
