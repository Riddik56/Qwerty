import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { DIRECTIONS_CONTENT, resolveDirectionByText, type DirectionKey } from "./learning-content";

export type IndexedMaterialFile = {
  relativePath: string;
  fileName: string;
  extension: string;
  downloadUrl: string;
};

export type MaterialIndexPayload = {
  byDirection: Record<DirectionKey, IndexedMaterialFile[]>;
  allFiles: IndexedMaterialFile[];
};
type DirectionMaterialIndex = Record<DirectionKey, IndexedMaterialFile[]>;

const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".rtf"]);

function walkFiles(root: string, current = ""): string[] {
  const abs = join(root, current);
  const entries = readdirSync(abs, { withFileTypes: true });
  const output: string[] = [];

  for (const entry of entries) {
    const rel = current ? join(current, entry.name) : entry.name;
    const full = join(root, rel);
    if (entry.isDirectory()) {
      output.push(...walkFiles(root, rel));
      continue;
    }
    if (entry.isFile()) output.push(rel.replaceAll("\\", "/"));
  }

  return output;
}

export function buildMaterialIndex(): DirectionMaterialIndex {
  const docsMaterialsRoot = join(process.cwd(), "docs", "materials");
  const publicMaterialsRoot = join(process.cwd(), "public", "materials");
  const empty: DirectionMaterialIndex = Object.fromEntries(
    DIRECTIONS_CONTENT.map((d) => [d.key, [] as IndexedMaterialFile[]]),
  ) as DirectionMaterialIndex;

  if (!existsSync(docsMaterialsRoot) || !statSync(docsMaterialsRoot).isDirectory()) {
    return { byDirection: empty, allFiles: [] };
  }

  // Keep a web-accessible mirror for download links (/materials/**)
  mkdirSync(join(process.cwd(), "public"), { recursive: true });
  cpSync(docsMaterialsRoot, publicMaterialsRoot, { recursive: true, force: true });

  const files = walkFiles(publicMaterialsRoot);
  const allFiles: IndexedMaterialFile[] = [];
  for (const rel of files) {
    const fileName = rel.split("/").pop() ?? rel;
    const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    const downloadUrl = `/materials/${rel
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
    const indexed: IndexedMaterialFile = {
      relativePath: rel,
      fileName,
      extension: ext,
      downloadUrl,
    };
    allFiles.push(indexed);

    const textForMatch = `${rel} ${fileName}`.replaceAll("_", " ").replaceAll("-", " ");
    const direction = resolveDirectionByText(textForMatch);
    if (!direction) continue;

    empty[direction.key].push(indexed);
  }

  for (const direction of DIRECTIONS_CONTENT) {
    empty[direction.key].sort((a, b) => a.fileName.localeCompare(b.fileName, "ru"));
  }

  allFiles.sort((a, b) => a.fileName.localeCompare(b.fileName, "ru"));
  return { byDirection: empty, allFiles };
}
