import { PageShell } from "@/components/PageShell";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUserFn, getMaterialIndexFn, getMyContentAccessFn } from "@/lib/portal-db";
import { resolveDirectionByCourseTitle } from "@/lib/learning-content";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/theory")({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "student") throw redirect({ to: "/account" });
    const access = (await getMyContentAccessFn()) as Array<{ course_title: string; content_type: string; is_enabled: number }>;
    const materialIndex = (await getMaterialIndexFn()) as {
      byDirection: Record<string, Array<{ relativePath: string; fileName: string; extension: string; downloadUrl: string }>>;
      allFiles: Array<{ relativePath: string; fileName: string; extension: string; downloadUrl: string }>;
    };
    return { enabled: access.filter((x) => x.content_type === "theory" && x.is_enabled === 1), materialIndex };
  },
  component: TheoryPage,
});

function TheoryPage() {
  const { enabled, materialIndex } = Route.useRouteContext();
  const available = useMemo(
    () =>
      enabled
        .map((row) => ({ row, direction: resolveDirectionByCourseTitle(row.course_title) }))
        .filter((x): x is { row: { course_title: string }; direction: NonNullable<ReturnType<typeof resolveDirectionByCourseTitle>> } => Boolean(x.direction)),
    [enabled],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = available[selectedIdx];
  const selectedMaterials = selected ? materialIndex.byDirection[selected.direction.key] ?? [] : [];
  const materialsToShow = selectedMaterials.slice(0, 60);

  return (
    <PageShell>
      <section className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-400/30 sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.42),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(14,165,233,0.28),transparent_32%),linear-gradient(135deg,#020617,#0f172a_58%,#172554)]" />
          <div className="relative">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-sky-100 backdrop-blur">
              Учебный контент
            </div>
            <h1 className="mt-5 font-display text-4xl font-extrabold sm:text-5xl">Теория по выбранному направлению</h1>
            <p className="mt-4 max-w-3xl text-slate-200">
              Выберите доступное направление и изучайте структурированные тематические модули в удобном формате.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Доступные направления</div>
          {available.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Преподаватель пока не открыл вам доступ к теории.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {available.map((item, idx) => (
                <button
                  key={`${item.row.course_title}-${idx}`}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    selectedIdx === idx
                      ? "bg-slate-950 text-white shadow-lg shadow-slate-300/50"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.direction.title}
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur sm:p-8">
          {selected ? (
            <>
              <h2 className="font-display text-3xl font-extrabold">{selected.direction.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Курс: {selected.row.course_title}</p>
              <div className="mt-6 grid gap-4">
                {selected.direction.theory.map((block, index) => (
                  <article key={block.title} className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6">
                    <div className="mb-3 inline-flex rounded-xl bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                      Модуль {String(index + 1).padStart(2, "0")}
                    </div>
                    <h3 className="font-display text-xl font-bold">{block.title}</h3>
                    <p className="mt-3 leading-7 text-muted-foreground">{block.text}</p>
                  </article>
                ))}
              </div>
              <div className="mt-8 rounded-3xl border border-slate-200/80 bg-slate-50 p-6">
                <h3 className="font-display text-2xl font-bold">Материалы по направлению</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Файлы автоматически подтянуты из архива. Нажмите «Скачать», чтобы открыть документ.
                </p>
                <div className="mt-4 grid gap-2">
                  {materialsToShow.map((file) => (
                    <div key={file.relativePath} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-medium leading-5">{file.fileName}</div>
                          <div className="mt-1 break-all text-xs text-muted-foreground">{file.relativePath}</div>
                        </div>
                        <a
                          href={file.downloadUrl}
                          download={file.fileName}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                        >
                          Скачать
                        </a>
                      </div>
                    </div>
                  ))}
                  {materialsToShow.length === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-muted-foreground">
                      Для направления «{selected.direction.title}» пока не найдено тематических документов. Добавьте материалы с
                      профильными названиями (аудит, анализ, финансовый и т.д.) в архив.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Нет доступных направлений для теории.</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
