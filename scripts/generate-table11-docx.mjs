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
const outFile = path.join(outDir, process.argv[2] || "tablitsa-11-soobshcheniya.docx");

const FONT = "Times New Roman";
const SIZE = 24; // half-points → 12 pt

function run(text, opts = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: SIZE,
    bold: opts.bold ?? false,
  });
}

function cellParagraphs(texts, alignment = AlignmentType.LEFT) {
  return texts.map(
    (t) =>
      new Paragraph({
        alignment,
        children: [run(t)],
      }),
  );
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
  "Сообщение системы",
  "Содержание сообщения",
  "Причина появления",
  "Необходимые действия",
];

const colWidths = [22, 18, 28, 32];

const rows = [
  [
    "Ошибка входа / «Неверный пароль»",
    "Ошибка авторизации",
    "Неверный e-mail или пароль",
    "Проверить данные и повторить вход",
  ],
  [
    "«Регистрация успешна! Добро пожаловать!»",
    "Успешное действие",
    "Учётная запись слушателя создана",
    "Перейти в личный кабинет",
  ],
  [
    "Ошибка регистрации",
    "Ошибка регистрации",
    "E-mail уже занят или неверные поля",
    "Исправить данные или войти в существующий аккаунт",
  ],
  [
    "«Для отправки заявки нужно войти в аккаунт»",
    "Ошибка заявки",
    "Пользователь не авторизован",
    "Войти через раздел «Вход» и повторить отправку",
  ],
  [
    "«Заявка отправлена. Мы свяжемся с вами.»",
    "Успешное действие",
    "Заявка записана в базу данных",
    "Дождаться решения администратора",
  ],
  [
    "«Заявка одобрена» / «Заявка отклонена»",
    "Успешное действие",
    "Администратор обработал заявку",
    "Проверить статус в личном кабинете",
  ],
  [
    "«Доступ обновлен»",
    "Успешное действие",
    "Преподаватель изменил доступ к разделам",
    "Перейти в «Теория», «Тест» или «Итоговое тестирование»",
  ],
  [
    "«Ошибка ИИ-помощника»",
    "Ошибка модуля ИИ",
    "Не настроен ключ API или сбой сервиса",
    "Обратиться к администратору системы",
  ],
];

function makeTable(rows) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => headerCell(h, colWidths[i])),
  });

  const colNumRow = new TableRow({
    children: ["1", "2", "3", "4"].map((n, i) =>
      bodyCell(n, AlignmentType.CENTER, colWidths[i]),
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell, i) =>
          bodyCell(cell, AlignmentType.LEFT, colWidths[i]),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, colNumRow, ...dataRows],
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
          children: [
            run("Таблица 11 – Перечень типовых сообщений и необходимые действия", {
              bold: false,
            }),
          ],
        }),
        makeTable(rows),
      ],
    },
  ],
});

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outFile, buffer);
console.log("Written:", outFile);
