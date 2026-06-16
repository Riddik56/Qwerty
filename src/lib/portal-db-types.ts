export type UserRole = "admin" | "teacher" | "student";

export type SessionDbUser = {
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role_name: UserRole;
  account_status: "active" | "blocked" | "pending";
};

export type PortalUser = {
  userId: number;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string;
  accountStatus: "active" | "blocked" | "pending";
  createdAt: string;
};

export type RoleInfo = {
  role: UserRole;
  title: string;
  description: string;
  permissions: string[];
};