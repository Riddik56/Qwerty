import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

type SeedUser = {
  role: "student" | "admin" | "teacher";
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
};

const SEED_USERS: SeedUser[] = [
  {
    role: "student",
    fullName: "Артем",
    email: "user1@mail.ru",
    phone: "+79223475849",
    passwordHash:
      "scrypt$e157604f646107c95c285697f4fcf157$37144956d12d255db142e4ab68c9f715c6e912d7d8764b833f03bae3508ea61ff05d35340459812d2f5be29c9121fbe747cc5f4710c38d2b7d93fbd1932f0553",
  },
  {
    role: "admin",
    fullName: "Костюков Матвей Витальевич",
    email: "Zahar83s@mail.ru",
    phone: "+79228744883",
    passwordHash:
      "scrypt$02332f8a23ab083c504e2d32031a677a$98ba68aa7270881952a19464a15917c4f62b5a3efe7f6fe4cd9aaf9df556d18731dc92d0f8847715efb47fc3dc3b6b50f81750360b8953ea9574d36baa52f413",
  },
];

function getDbDirectory(): string {
  const configured = process.env.PORTAL_DB_DIR?.trim();
  if (configured) {
    mkdirSync(configured, { recursive: true });
    return configured;
  }
  return process.cwd();
}

function ensureSeedUsers(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO users (role_id, full_name, email, phone, password_hash, account_status)
    SELECT (SELECT role_id FROM roles WHERE role_name = ?), ?, ?, ?, ?, 'active'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(?))
  `);

  for (const user of SEED_USERS) {
    const result = insert.run(
      user.role,
      user.fullName,
      user.email,
      user.phone,
      user.passwordHash,
      user.email,
    );
    if (result.changes > 0) {
      console.log(`Seeded user: ${user.email} (${user.role})`);
    }
  }
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

const dbDirectory = getDbDirectory();
const dbPath = join(dbDirectory, "portal.db");
const schemaPath = join(process.cwd(), "database-schema.sqlite.sql");
const db = new Database(dbPath);

try {
  const hasRolesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'roles'")
    .get() as { name: string } | undefined;

  if (!hasRolesTable) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS student_content_access (
      user_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type IN ('theory', 'test', 'final_test')),
      is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, course_id, content_type),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS student_module_results (
      user_id INTEGER NOT NULL,
      direction_key TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type IN ('test', 'final_test')),
      module_index INTEGER NOT NULL CHECK (module_index >= 0),
      score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
      total_questions INTEGER NOT NULL DEFAULT 1 CHECK (total_questions > 0),
      is_passed INTEGER NOT NULL DEFAULT 0 CHECK (is_passed IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, direction_key, content_type, module_index),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
  `);

  if (!columnExists(db, "enrollments", "teacher_id")) {
    db.exec("ALTER TABLE enrollments ADD COLUMN teacher_id INTEGER REFERENCES users(user_id)");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_enrollments_teacher_id
    ON enrollments(teacher_id);
  `);

  // Backfill legacy rows: if enrollment teacher is empty, reuse course teacher.
  db.exec(`
    UPDATE enrollments
    SET teacher_id = (
      SELECT c.teacher_id
      FROM courses c
      WHERE c.course_id = enrollments.course_id
    )
    WHERE teacher_id IS NULL;
  `);

  ensureSeedUsers(db);

  const seedPath = join(process.cwd(), "database-seed.sqlite.sql");
  if (existsSync(seedPath)) {
    db.exec(readFileSync(seedPath, "utf-8"));
  }
} catch (e) {
  console.error("DB Init Error:", e);
}

console.log(`SQLite database: ${dbPath}`);
export default db;
