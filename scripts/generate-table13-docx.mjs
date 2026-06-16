import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "docs");
const outFile = path.join(outDir, process.argv[2] || "tablitsa-13-test-keysy.docx");

const FONT = "Times New Roman";
const SIZE = 22; // 11 pt

function run(text) {
  return new TextRun({ text, font: FONT, size: SIZE });
}

function cellParagraphs(texts, alignment = AlignmentType.LEFT) {
  return texts.map((t) => new Paragraph({ alignment, children: [run(t)] }));
}

function headerCell(text, widthPct) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    children: cellParagraphs([text], AlignmentType.CENTER),
  });
}

function bodyCell(text, alignment, widthPct) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    children: cellParagraphs([text], alignment),
  });
}

const headers = [
  "№",
  "Наименование",
  "Входные данные",
  "Ожидаемый результат",
  "Полученный результат",
  "Итог",
];

const colWidths = [5, 18, 22, 20, 20, 15];

const rows = [
  [
    "1",
    "Регистрация нового пользователя",
    "Ввести корректные ФИО, телефон, «e-mail», пароль (не менее 4 символов), отметить согласие с условиями",
    "Пользователь регистрируется, создаётся запись в таблице «users»",
    "Регистрация выполнена, отображено сообщение об успехе, выполнен вход в личный кабинет",
    "Тест выполнен успешно",
  ],
  [
    "2",
    "Регистрация без согласия с условиями",
    "Заполнить форму регистрации, не устанавливать флажок согласия, отправить форму",
    "Форма не отправляется, отображается сообщение об ошибке",
    "Отображено «Необходимо согласиться с условиями», регистрация не выполнена",
    "Тест выполнен успешно",
  ],
  [
    "3",
    "Авторизация пользователя",
    "Ввести корректные «e-mail» и пароль существующего слушателя, нажать «Войти»",
    "Выполняется вход, устанавливается сессия, открывается личный кабинет",
    "Вход выполнен, переход на страницу «/account»",
    "Тест выполнен успешно",
  ],
  [
    "4",
    "Авторизация с неверным паролем",
    "Ввести существующий «e-mail» и неверный пароль",
    "Вход не выполняется, отображается сообщение об ошибке",
    "Отображено «Неверный пароль», вход не выполнен",
    "Тест выполнен успешно",
  ],
  [
    "5",
    "Подача заявки на обучение",
    "Войти как слушатель, открыть «/programs», заполнить телефон и отправить заявку",
    "Заявка сохраняется в «enrollment_requests» со статусом «new»",
    "Отображено «Заявка отправлена. Мы свяжемся с вами.»",
    "Тест выполнен успешно",
  ],
  [
    "6",
    "Подача заявки без авторизации",
    "Открыть форму заявки без входа в систему, попытаться отправить данные",
    "Заявка не создаётся, пользователь информирован о необходимости входа",
    "Отображено сообщение о необходимости войти в аккаунт",
    "Тест выполнен успешно",
  ],
  [
    "7",
    "Одобрение заявки администратором",
    "Войти как администратор, в «/admin» одобрить новую заявку",
    "Статус заявки «approved», создаётся запись в «enrollments»",
    "Отображено «Заявка одобрена», курс появился у слушателя",
    "Тест выполнен успешно",
  ],
  [
    "8",
    "Назначение доступа преподавателем",
    "Преподаватель в «/teacher» включает доступ к разделу «Теория» для слушателя",
    "Доступ сохранён в «student_content_access»",
    "Отображено «Доступ обновлен», слушатель видит материалы",
    "Тест выполнен успешно",
  ],
  [
    "9",
    "Прохождение промежуточного теста",
    "Слушатель с доступом открывает «/test», отвечает на вопросы, завершает тест",
    "Отображается результат (баллы, статус прохождения)",
    "Результат отображён корректно, сообщение о завершении теста показано",
    "Тест выполнен успешно",
  ],
  [
    "10",
    "Проверка доступа и страницы ошибки",
    "Перейти по неверному URL; войти в «/admin» под учётной записью слушателя",
    "Страница «404»; доступ к админ-панели запрещён",
    "Отображена «Страница не найдена»; доступ к «/admin» не предоставлен",
    "Тест выполнен успешно",
  ],
];

function makeTable(dataRows) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => headerCell(h, colWidths[i])),
  });
  const colNumRow = new TableRow({
    children: ["1", "2", "3", "4", "5", "6"].map((n, i) =>
      bodyCell(n, AlignmentType.CENTER, colWidths[i]),
    ),
  });
  const bodyRows = dataRows.map(
    (row) =>
      new TableRow({
        children: row.map((cell, i) =>
          bodyCell(cell, i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, colWidths[i]),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, colNumRow, ...bodyRows],
  });
}

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 120 },
          children: [run("Таблица 13 – Тест-кейсы")],
        }),
        makeTable(rows),
      ],
    },
  ],
});

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, await Packer.toBuffer(doc));
console.log("Written:", outFile);
