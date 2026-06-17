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

function getMissingMailConfigKeys(): string[] {
  return ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "NOTIFY_EMAIL_TO"].filter(
    (key) => !getEnvOrDevVar(key),
  );
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

export async function sendEnrollmentRequestEmail(payload: {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  programTitle: string;
  comment?: string;
}) {
  const config = getMailConfig();
  if (!config) {
    const missing = getMissingMailConfigKeys();
    console.warn(
      `Email notifications skipped: incomplete SMTP config (missing: ${missing.join(", ") || "unknown"})`,
    );
    return { sent: false, reason: "config_missing" as const };
  }

  try {
    const transporter = await createTransport(config);

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

    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      text,
    });

    return { sent: true as const };
  } catch (error) {
    console.error("Enrollment email notification error:", error);
    return { sent: false, reason: "send_failed" as const };
  }
}

export async function sendContactMessageEmail(payload: {
  name: string;
  email: string;
  message: string;
}) {
  const config = getMailConfig();
  if (!config) {
    const missing = getMissingMailConfigKeys();
    console.warn(
      `Email notifications skipped: incomplete SMTP config (missing: ${missing.join(", ") || "unknown"})`,
    );
    return { sent: false, reason: "config_missing" as const };
  }

  try {
    const transporter = await createTransport(config);

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

    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      text,
      replyTo: payload.email,
    });

    return { sent: true as const };
  } catch (error) {
    console.error("Contact email notification error:", error);
    return { sent: false, reason: "send_failed" as const };
  }
}
