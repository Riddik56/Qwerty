import { existsSync, readFileSync } from "fs";
import { join } from "path";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
};

type SendResult = { sent: true } | { sent: false; reason: "config_missing" | "send_failed" };

function readDevVar(key: string): string | null {
  try {
    const filePath = join(process.cwd(), ".dev.vars");
    if (!existsSync(filePath)) return null;
    const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);
    const line = lines.find((l) => l.startsWith(`${key}=`));
    if (!line) return null;
    return line.slice(`${key}=`.length).trim();
  } catch {
    return null;
  }
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getEnvOrDevVar(key: string): string | null {
  const fromEnv = process.env[key];
  if (fromEnv && fromEnv.trim().length > 0) return normalizeEnvValue(fromEnv);
  const fromDev = readDevVar(key);
  return fromDev ? normalizeEnvValue(fromDev) : null;
}

function isRenderHost(): boolean {
  return Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
}

function getMailConfig(): MailConfig | null {
  const host = getEnvOrDevVar("SMTP_HOST");
  const portRaw = getEnvOrDevVar("SMTP_PORT");
  const secureRaw = getEnvOrDevVar("SMTP_SECURE");
  const user = getEnvOrDevVar("SMTP_USER");
  const pass = getEnvOrDevVar("SMTP_PASS");
  const from = getEnvOrDevVar("SMTP_FROM");
  const to = getEnvOrDevVar("NOTIFY_EMAIL_TO");

  if (!host || !portRaw || !user || !pass || !from || !to) return null;

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) return null;

  return {
    host,
    port,
    secure: secureRaw === "true" || port === 465,
    user,
    pass,
    from,
    to,
  };
}

function createTransport(config: MailConfig) {
  return import("nodemailer").then((nodemailer) =>
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      ...(config.secure
        ? {}
        : {
            requireTLS: true,
            tls: {
              minVersion: "TLSv1.2",
            },
          }),
    }),
  );
}

async function sendWithTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("SMTP timeout")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function sendViaResend(payload: {
  subject: string;
  text: string;
  to: string;
  replyTo?: string;
}): Promise<SendResult> {
  const apiKey = getEnvOrDevVar("RESEND_API_KEY");
  const from =
    getEnvOrDevVar("RESEND_FROM") || getEnvOrDevVar("SMTP_FROM") || "onboarding@resend.dev";

  if (!apiKey) {
    return { sent: false, reason: "config_missing" };
  }

  try {
    const body: Record<string, unknown> = {
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
    };
    if (payload.replyTo) body.reply_to = payload.replyTo;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Resend API error:", response.status, details);
      return { sent: false, reason: "send_failed" };
    }

    return { sent: true };
  } catch (error) {
    console.error("Resend email notification error:", error);
    return { sent: false, reason: "send_failed" };
  }
}

async function sendViaSmtp(payload: {
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const config = getMailConfig();
  if (!config) {
    return { sent: false, reason: "config_missing" };
  }

  try {
    const transporter = await createTransport(config);
    await sendWithTimeout(
      transporter.sendMail({
        from: config.from,
        to: config.to,
        subject: payload.subject,
        text: payload.text,
        replyTo: payload.replyTo,
      }),
    );
    return { sent: true };
  } catch (error) {
    console.error("SMTP email notification error:", error);
    return { sent: false, reason: "send_failed" };
  }
}

async function sendNotificationEmail(payload: {
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const to = getEnvOrDevVar("NOTIFY_EMAIL_TO");
  if (!to) {
    console.warn("Email notifications skipped: NOTIFY_EMAIL_TO is not set");
    return { sent: false, reason: "config_missing" };
  }

  // Render blocks outbound SMTP (ports 465/587) — use Resend HTTP API in production.
  if (getEnvOrDevVar("RESEND_API_KEY")) {
    return sendViaResend({ ...payload, to });
  }

  if (isRenderHost()) {
    console.warn(
      "Email skipped on Render: SMTP is blocked. Add RESEND_API_KEY (https://resend.com) to Environment.",
    );
    return { sent: false, reason: "config_missing" };
  }

  return sendViaSmtp(payload);
}

export async function sendEnrollmentRequestEmail(payload: {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  programTitle: string;
  comment?: string;
}) {
  const subject = `Новая заявка: ${payload.programTitle}`;
  const text = [
    "На сайте оставлена новая заявка.",
    "",
    `Направление: ${payload.programTitle}`,
    `ФИО: ${payload.applicantName}`,
    `Email: ${payload.applicantEmail}`,
    `Телефон: ${payload.applicantPhone}`,
    `Комментарий: ${payload.comment?.trim() || "—"}`,
    `Время: ${new Date().toLocaleString("ru-RU")}`,
  ].join("\n");

  return sendNotificationEmail({ subject, text });
}

export async function sendContactMessageEmail(payload: {
  name: string;
  email: string;
  message: string;
}) {
  const subject = `Обратная связь: сообщение от ${payload.name}`;
  const text = [
    "Новое сообщение из формы обратной связи.",
    "",
    `Имя: ${payload.name}`,
    `Email: ${payload.email}`,
    "",
    "Сообщение:",
    payload.message,
    "",
    `Время: ${new Date().toLocaleString("ru-RU")}`,
  ].join("\n");

  const result = await sendNotificationEmail({
    subject,
    text,
    replyTo: payload.email,
  });

  if (!result.sent && result.reason === "config_missing") {
    throw new Error("Email-уведомления не настроены. Проверьте RESEND_API_KEY или SMTP параметры.");
  }

  return result;
}
