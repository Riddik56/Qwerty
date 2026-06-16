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
const outFile = path.join(outDir, process.argv[2] || "tablitsa-12-avariynye-situatsii.docx");

const FONT = "Times New Roman";
const SIZE = 24;

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: SIZE, bold: opts.bold ?? false });
}

function cellParagraphs(texts, alignment = AlignmentType.LEFT) {
  return texts.map(
    (t) => new Paragraph({ alignment, children: [run(t)] }),
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
  "Аварийная ситуация",
  "Причина возникновения",
  "Сообщение пользователю",
  "Рекомендуемые действия",
];

const colWidths = [22, 28, 22, 28];

const rows = [
  [
    "Недоступность веб‑сервера",
    "Технические работы, сбой хостинга, перегрузка сервера",
    "Страница не открывается, ошибка соединения",
    "Подождать 5–10 минут, обновить страницу; при повторении обратиться к администратору",
  ],
  [
    "Ошибка загрузки каталога программ",
    "Сбой серверной функции, недоступность базы данных «SQLite»",
    "«Не удалось загрузить данные» / пустой список программ",
    "Обновить страницу «Направления»; при повторении попробовать позже",
  ],
  [
    "Сбой при отправке заявки на обучение",
    "Потеря сетевого соединения, ошибка записи в БД",
    "Сообщение об ошибке при отправке заявки",
    "Проверить интернет, повторить отправку; убедиться, что заявка не создана дважды",
  ],
  [
    "Некорректная работа личного кабинета",
    "Ошибка загрузки курсов или прогресса слушателя",
    "Раздел «Мои курсы» пуст или данные не обновляются",
    "Выйти из аккаунта и войти снова; обновить страницу",
  ],
  [
    "Истечение сессии / отсутствие авторизации",
    "Длительное бездействие, закрытие браузера, сброс cookie",
    "«Требуется авторизация»",
    "Повторно выполнить вход через раздел «Вход»",
  ],
  [
    "Внутренняя ошибка сервера",
    "Сбой серверной функции, ошибка при обращении к БД",
    "«Произошла ошибка» / «Ошибка входа» (общее сообщение)",
    "Повторить действие позже; при повторении обратиться в поддержку организации",
  ],
  [
    "Страница не найдена",
    "Неверный адрес (URL), удалённый или переименованный раздел",
    "«Страница не найдена» (код 404)",
    "Вернуться на главную страницу по ссылке «На главную» или через меню",
  ],
  [
    "Недоступность модуля «ИИ‑помощник»",
    "Не настроен ключ «OPENROUTER_API_KEY», сбой внешнего API",
    "«Ошибка ИИ‑помощника»",
    "Повторить запрос позже; сообщить администратору о неисправности",
  ],
];

function makeTable(dataRows) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => headerCell(h, colWidths[i])),
  });
  const colNumRow = new TableRow({
    children: ["1", "2", "3", "4"].map((n, i) =>
      bodyCell(n, AlignmentType.CENTER, colWidths[i]),
    ),
  });
  const bodyRows = dataRows.map(
    (row) =>
      new TableRow({
        children: row.map((cell, i) =>
          bodyCell(cell, AlignmentType.LEFT, colWidths[i]),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, colNumRow, ...bodyRows],
  });
}

const intro = [
  "В процессе работы веб‑приложения «Интерактив» также могут возникать аварийные ситуации, связанные с недоступностью серверной части, ошибками при обращении к базе данных «SQLite», потерей сетевого соединения или некорректной работой отдельных модулей (каталог программ, личный кабинет, заявки на обучение, «ИИ‑помощник»). Пользователь должен быть информирован о характере возникшей проблемы и понимать, какие действия необходимо предпринять для восстановления работы или корректного завершения операции.",
  "В таблице 12 приведены типовые аварийные ситуации, возможные причины их возникновения, сообщения, отображаемые пользователю, и рекомендуемые действия.",
];

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        ...intro.map(
          (text) =>
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 200, line: 360 },
              children: [run(text)],
            }),
        ),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 120 },
          children: [run("Таблица 12 – Типовые аварийные ситуации и необходимые действия")],
        }),
        makeTable(rows),
      ],
    },
  ],
});

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, await Packer.toBuffer(doc));
console.log("Written:", outFile);
