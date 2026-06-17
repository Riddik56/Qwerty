import { createServerFn } from "@tanstack/react-start";
import type { SessionDbUser, UserRole } from "./portal-db-types";

export { getCurrentUserFn, logoutUserFn } from "./auth-fns";

type DbUser = SessionDbUser;
type EnrollmentRequestStatus = "new" | "approved" | "rejected" | "completed";
type ModuleContentType = "test" | "final_test";

export const loginUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async (ctx) => {
    const { verifyPassword, setSessionCookie } = await import("./portal-session.server");
    const db = (await import("./db.server")).default;
    const email = ctx.data.email.trim().toLowerCase();
    const user = db
      .prepare(`
      SELECT u.user_id, u.full_name, u.email, u.password_hash, r.role_name 
      FROM users u JOIN roles r ON u.role_id = r.role_id 
      WHERE lower(u.email) = ? AND u.account_status = 'active'
    `)
      .get(email) as DbUser | undefined;

    if (!user) throw new Error("Пользователь не найден или заблокирован");
    if (!verifyPassword(ctx.data.password, user.password_hash)) throw new Error("Неверный пароль");
    setSessionCookie(user.user_id);
    return { userId: user.user_id, fullName: user.full_name, role: user.role_name };
  });

export const getMyCoursesFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { requireUser } = await import("./portal-session.server");
    const user = await requireUser(["student"]);

    const db = (await import("./db.server")).default;
    return db
      .prepare(`
      SELECT c.course_id, c.title, e.progress_percent, e.enrollment_status,
             (SELECT full_name FROM users WHERE user_id = c.teacher_id) as teacher_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.user_id = ?
    `)
      .all(user.user_id) as Array<{
      course_id: number;
      title: string;
      progress_percent: number;
      enrollment_status: "active" | "completed" | "cancelled";
      teacher_name: string | null;
    }>;
  });

export const getAllUsersFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { requireUser } = await import("./portal-session.server");
    await requireUser(["admin"]);
    const db = (await import("./db.server")).default;
    return db
      .prepare(`
      SELECT u.user_id, u.full_name, u.email, u.phone, r.role_name 
      FROM users u JOIN roles r ON u.role_id = r.role_id
    `)
      .all() as Array<{
      user_id: number;
      full_name: string;
      email: string;
      phone: string | null;
      role_name: UserRole;
    }>;
  });

export const promoteUserToTeacherFn = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: number }) => data)
  .handler(async (ctx) => {
    const { requireUser } = await import("./portal-session.server");
    await requireUser(["admin"]);
    const db = (await import("./db.server")).default;

    const targetUser = db
      .prepare(
        `
        SELECT u.user_id, r.role_name
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.user_id = ?
      `,
      )
      .get(ctx.data.userId) as { user_id: number; role_name: UserRole } | undefined;

    if (!targetUser) throw new Error("Пользователь не найден");
    if (targetUser.role_name === "admin") throw new Error("Администратор не может быть изменен");
    if (targetUser.role_name === "teacher") return { success: true };

    const teacherRole = db.prepare("SELECT role_id FROM roles WHERE role_name = 'teacher'").get() as { role_id: number } | undefined;
    if (!teacherRole) throw new Error("Роль преподавателя не найдена");

    db.prepare("UPDATE users SET role_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").run(teacherRole.role_id, ctx.data.userId);
    return { success: true };
  });

export const deleteStudentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: number }) => data)
  .handler(async (ctx) => {
    const { requireUser } = await import("./portal-session.server");
    await requireUser(["admin"]);
    const db = (await import("./db.server")).default;

    const targetUser = db
      .prepare(
        `
        SELECT u.user_id, r.role_name
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.user_id = ?
      `,
      )
      .get(ctx.data.userId) as { user_id: number; role_name: UserRole } | undefined;

    if (!targetUser) throw new Error("Пользователь не найден");
    if (targetUser.role_name !== "student") {
      throw new Error("Удалять можно только слушателей");
    }

    db.prepare("DELETE FROM users WHERE user_id = ?").run(ctx.data.userId);
    return { success: true };
  });

export const createUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: { fullName: string; email: string; phone: string; password: string }) => data)
  .handler(async (ctx) => {
    const { hashPassword, setSessionCookie } = await import("./portal-session.server");
    const db = (await import("./db.server")).default;
    const existingUser = db.prepare("SELECT user_id FROM users WHERE email = ?").get(ctx.data.email) as any;
    if (existingUser) throw new Error("Пользователь с таким email уже существует");

    // Self-registration always creates a student account.
    const roleRow = db.prepare("SELECT role_id FROM roles WHERE role_name = ?").get("student") as any;
    if (!roleRow) throw new Error("Role not found");

    const passwordHash = hashPassword(ctx.data.password);

    const result = db.prepare(`
      INSERT INTO users (role_id, full_name, email, phone, password_hash, account_status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(roleRow.role_id, ctx.data.fullName, ctx.data.email, ctx.data.phone, passwordHash);

    const newUserId = Number(result.lastInsertRowid);

    setSessionCookie(newUserId);

    return { userId: newUserId };
  });

export const getTeachersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("./portal-session.server");
  await requireUser(["student", "admin", "teacher"]);
  const db = (await import("./db.server")).default;
  return db
    .prepare(
      `
      SELECT u.user_id, u.full_name, u.email
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      WHERE r.role_name = 'teacher' AND u.account_status = 'active'
      ORDER BY u.full_name
    `,
    )
    .all() as Array<{ user_id: number; full_name: string; email: string }>;
});

export const createEnrollmentRequestFn = createServerFn({ method: "POST" })
  .inputValidator((data: { programTitle: string; phone: string; comment?: string; preferredTeacherId?: number | null }) => data)
  .handler(async (ctx) => {
    const { requireUser } = await import("./portal-session.server");
    const user = await requireUser(["student"]);
    const db = (await import("./db.server")).default;

    let course = db.prepare("SELECT course_id FROM courses WHERE title = ? LIMIT 1").get(ctx.data.programTitle) as
      | { course_id: number }
      | undefined;

    if (!course) {
      const created = db
        .prepare(
          `
          INSERT INTO courses (title, short_description, duration_hours, course_status)
          VALUES (?, ?, ?, 'published')
        `,
        )
        .run(ctx.data.programTitle, "Курс создан из заявки слушателя", 72);
      course = { course_id: Number(created.lastInsertRowid) };
    }

    db.prepare(
      `
      INSERT INTO enrollment_requests (
        course_id, user_id, applicant_name, applicant_email, applicant_phone, comment, request_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'new')
    `,
    ).run(
      course.course_id,
      user.user_id,
      user.full_name,
      user.email,
      ctx.data.phone,
      [
        ctx.data.comment?.trim() || "",
        ctx.data.preferredTeacherId ? `preferred_teacher_id:${ctx.data.preferredTeacherId}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    // Do not fail request creation if SMTP is temporarily unavailable.
    const { sendEnrollmentRequestEmail } = await import("./email-notify.server");
    const emailResult = await sendEnrollmentRequestEmail({
      applicantName: user.full_name,
      applicantEmail: user.email,
      applicantPhone: ctx.data.phone,
      programTitle: ctx.data.programTitle,
      comment: ctx.data.comment,
    });
    if (!emailResult.sent) {
      console.warn(`Enrollment email not sent (${emailResult.reason}) for ${ctx.data.programTitle}`);
    }

    return { success: true };
  });

export const getEnrollmentRequestsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("./portal-session.server");
  await requireUser(["admin"]);
  const db = (await import("./db.server")).default;
  return db
    .prepare(
      `
      SELECT
        er.request_id,
        er.user_id,
        er.applicant_name,
        er.applicant_email,
        er.applicant_phone,
        er.comment,
        er.request_status,
        er.created_at,
        c.course_id,
        c.title AS course_title
      FROM enrollment_requests er
      JOIN courses c ON er.course_id = c.course_id
      ORDER BY er.created_at DESC
    `,
    )
    .all() as Array<{
    request_id: number;
    user_id: number | null;
    applicant_name: string;
    applicant_email: string;
    applicant_phone: string | null;
    comment: string | null;
    request_status: EnrollmentRequestStatus;
    created_at: string;
    course_id: number;
    course_title: string;
  }>;
});

export const processEnrollmentRequestFn = createServerFn({ method: "POST" })
  .inputValidator((data: { requestId: number; action: "approve" | "reject" }) => data)
  .handler(async (ctx) => {
    const { requireUser } = await import("./portal-session.server");
    await requireUser(["admin"]);
    const db = (await import("./db.server")).default;

    const request = db
      .prepare(
        `
      SELECT request_id, user_id, course_id, comment, request_status
      FROM enrollment_requests
      WHERE request_id = ?
    `,
      )
      .get(ctx.data.requestId) as
      | { request_id: number; user_id: number | null; course_id: number; comment: string | null; request_status: EnrollmentRequestStatus }
      | undefined;

    if (!request) throw new Error("Заявка не найдена");
    if (request.request_status !== "new") throw new Error("Заявка уже обработана");

    if (ctx.data.action === "reject") {
      db.prepare("UPDATE enrollment_requests SET request_status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE request_id = ?").run(
        request.request_id,
      );
      return { success: true };
    }

    if (!request.user_id) throw new Error("Нельзя одобрить заявку без пользователя");

    const preferredTeacherMatch = request.comment?.match(/preferred_teacher_id:(\d+)/);
    const preferredTeacherId = preferredTeacherMatch ? Number(preferredTeacherMatch[1]) : null;

    if (preferredTeacherId) {
      db.prepare("UPDATE courses SET teacher_id = ? WHERE course_id = ?").run(preferredTeacherId, request.course_id);
    }

    db.prepare(
      `
      INSERT INTO enrollments (user_id, course_id, enrollment_status, progress_percent)
      VALUES (?, ?, 'active', 0)
      ON CONFLICT(user_id, course_id) DO NOTHING
    `,
    ).run(request.user_id, request.course_id);

    db.prepare("UPDATE enrollment_requests SET request_status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE request_id = ?").run(
      request.request_id,
    );

    return { success: true };
  });

export const getTeacherStudentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("./portal-session.server");
  const teacher = await requireUser(["teacher", "admin"]);
  const db = (await import("./db.server")).default;

  const query = `
    SELECT
      u.user_id,
      u.full_name,
      u.email,
      c.course_id,
      c.title AS course_title,
      e.progress_percent,
      e.enrollment_status
    FROM enrollments e
    JOIN users u ON u.user_id = e.user_id
    JOIN courses c ON c.course_id = e.course_id
    WHERE c.teacher_id = ?
    ORDER BY c.title, u.full_name
  `;

  const teacherId = teacher.role_name === "admin" ? null : teacher.user_id;
  if (teacherId === null) {
    return db
      .prepare(
        query.replace("WHERE c.teacher_id = ?", "WHERE c.teacher_id IS NOT NULL"),
      )
      .all() as Array<{
      user_id: number;
      full_name: string;
      email: string;
      course_id: number;
      course_title: string;
      progress_percent: number;
      enrollment_status: string;
    }>;
  }

  return db.prepare(query).all(teacherId) as Array<{
    user_id: number;
    full_name: string;
    email: string;
    course_id: number;
    course_title: string;
    progress_percent: number;
    enrollment_status: string;
  }>;
});

export const setStudentContentAccessFn = createServerFn({ method: "POST" })
  .inputValidator((data: { studentId: number; courseId: number; contentType: "theory" | "test" | "final_test"; enabled: boolean }) => data)
  .handler(async (ctx) => {
    const { requireUser } = await import("./portal-session.server");
    const teacher = await requireUser(["teacher", "admin"]);
    const db = (await import("./db.server")).default;

    const enrollment = db
      .prepare(
        `
      SELECT c.teacher_id
      FROM enrollments e
      JOIN courses c ON c.course_id = e.course_id
      WHERE e.user_id = ? AND e.course_id = ?
    `,
      )
      .get(ctx.data.studentId, ctx.data.courseId) as { teacher_id: number | null } | undefined;

    if (!enrollment) throw new Error("Слушатель не найден в этом курсе");
    if (teacher.role_name === "teacher" && enrollment.teacher_id !== teacher.user_id) {
      throw new Error("Можно менять доступ только для своих слушателей");
    }

    db.prepare(
      `
      INSERT INTO student_content_access (user_id, course_id, content_type, is_enabled, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, course_id, content_type)
      DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = CURRENT_TIMESTAMP
    `,
    ).run(ctx.data.studentId, ctx.data.courseId, ctx.data.contentType, ctx.data.enabled ? 1 : 0);

    return { success: true };
  });

export const getTeacherContentAccessFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("./portal-session.server");
  const teacher = await requireUser(["teacher", "admin"]);
  const db = (await import("./db.server")).default;

  const contentTypesSql = `
    SELECT 'theory' AS content_type
    UNION ALL SELECT 'test'
    UNION ALL SELECT 'final_test'
  `;

  const baseSelect = `
    SELECT
      e.user_id,
      e.course_id,
      ct.content_type,
      COALESCE(sca.is_enabled, 1) AS is_enabled
    FROM enrollments e
    JOIN courses c ON c.course_id = e.course_id
    JOIN (${contentTypesSql}) ct
    LEFT JOIN student_content_access sca
      ON sca.user_id = e.user_id
      AND sca.course_id = e.course_id
      AND sca.content_type = ct.content_type
    WHERE e.enrollment_status = 'active'
  `;

  if (teacher.role_name === "admin") {
    return db
      .prepare(
        `
      ${baseSelect}
    `,
      )
      .all() as Array<{ user_id: number; course_id: number; content_type: "theory" | "test" | "final_test"; is_enabled: number }>;
  }

  return db.prepare(`${baseSelect} AND c.teacher_id = ?`).all(teacher.user_id) as Array<{
    user_id: number;
    course_id: number;
    content_type: "theory" | "test" | "final_test";
    is_enabled: number;
  }>;
});

export const getMyContentAccessFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("./portal-session.server");
  const user = await requireUser(["student"]);
  const db = (await import("./db.server")).default;

  return db
    .prepare(
      `
      SELECT
        e.course_id,
        ct.content_type,
        COALESCE(sca.is_enabled, 1) AS is_enabled,
        c.title AS course_title
      FROM enrollments e
      JOIN courses c ON c.course_id = e.course_id
      JOIN (
        SELECT 'theory' AS content_type
        UNION ALL SELECT 'test'
        UNION ALL SELECT 'final_test'
      ) ct
      LEFT JOIN student_content_access sca
        ON sca.user_id = e.user_id
        AND sca.course_id = e.course_id
        AND sca.content_type = ct.content_type
      WHERE e.user_id = ? AND e.enrollment_status = 'active'
    `,
    )
    .all(user.user_id) as Array<{
    course_id: number;
    course_title: string;
    content_type: "theory" | "test" | "final_test";
    is_enabled: number;
  }>;
});

export const getMyModuleResultsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { contentType?: ModuleContentType } | undefined) => data)
  .handler(async (ctx) => {
    const { requireUser } = await import("./portal-session.server");
    const user = await requireUser(["student"]);
    const db = (await import("./db.server")).default;

    if (ctx.data?.contentType) {
      return db
        .prepare(
          `
          SELECT direction_key, content_type, module_index, score, total_questions, is_passed
          FROM student_module_results
          WHERE user_id = ? AND content_type = ?
        `,
        )
        .all(user.user_id, ctx.data.contentType) as Array<{
        direction_key: string;
        content_type: ModuleContentType;
        module_index: number;
        score: number;
        total_questions: number;
        is_passed: number;
      }>;
    }

    return db
      .prepare(
        `
        SELECT direction_key, content_type, module_index, score, total_questions, is_passed
        FROM student_module_results
        WHERE user_id = ?
      `,
      )
      .all(user.user_id) as Array<{
      direction_key: string;
      content_type: ModuleContentType;
      module_index: number;
      score: number;
      total_questions: number;
      is_passed: number;
    }>;
  });

export const saveMyModuleResultFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      directionKey: string;
      contentType: ModuleContentType;
      moduleIndex: number;
      score: number;
      totalQuestions: number;
    }) => data,
  )
  .handler(async (ctx) => {
    const { requireUser } = await import("./portal-session.server");
    const user = await requireUser(["student"]);
    const db = (await import("./db.server")).default;

    const score = Math.max(0, Math.floor(Number(ctx.data.score)));
    const totalQuestions = Math.max(1, Math.floor(Number(ctx.data.totalQuestions)));
    const isPassed = score >= totalQuestions ? 1 : 0;

    db.prepare(
      `
      INSERT INTO student_module_results (
        user_id, direction_key, content_type, module_index, score, total_questions, is_passed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, direction_key, content_type, module_index)
      DO UPDATE SET
        score = excluded.score,
        total_questions = excluded.total_questions,
        is_passed = excluded.is_passed,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(
      user.user_id,
      ctx.data.directionKey,
      ctx.data.contentType,
      ctx.data.moduleIndex,
      score,
      totalQuestions,
      isPassed,
    );

    return { success: true, isPassed };
  });

export const getMaterialIndexFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("./portal-session.server");
  await requireUser(["student", "teacher", "admin"]);
  const { buildMaterialIndex } = await import("./material-index.server");
  return buildMaterialIndex();
});

export const sendContactMessageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; email: string; message: string }) => data)
  .handler(async (ctx) => {
    const name = String(ctx.data.name ?? "").trim();
    const email = String(ctx.data.email ?? "").trim();
    const message = String(ctx.data.message ?? "").trim();
    if (name.length < 2) throw new Error("Имя слишком короткое");
    if (!email.includes("@")) throw new Error("Некорректный e-mail");
    if (message.length < 5) throw new Error("Сообщение слишком короткое");

    const { sendContactMessageEmail } = await import("./email-notify.server");
    const result = await sendContactMessageEmail({ name, email, message });
    if (!result.sent) {
      throw new Error("Email-уведомления не настроены. Проверьте SMTP параметры.");
    }
    return { success: true };
  });
