import { createServerFn } from "@tanstack/react-start";
import type { UserRole } from "./portal-db-types";

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUserId } = await import("./portal-session.server");
  const userId = getSessionUserId();
  if (!userId) return null;

  const db = (await import("./db.server")).default;
  const user = db
    .prepare(
      `
      SELECT u.user_id, u.full_name, u.email, u.phone, u.account_status, r.role_name
      FROM users u JOIN roles r ON u.role_id = r.role_id
      WHERE u.user_id = ?
    `,
    )
    .get(Number(userId)) as
    | {
        user_id: number;
        full_name: string;
        email: string;
        phone: string | null;
        account_status: string;
        role_name: UserRole;
      }
    | undefined;

  if (!user || user.account_status !== "active") return null;
  return {
    userId: user.user_id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role_name,
  };
});

export const logoutUserFn = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSessionCookie } = await import("./portal-session.server");
  clearSessionCookie();
  return { success: true };
});
