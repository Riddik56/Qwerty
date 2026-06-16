import { PageShell } from "@/components/PageShell";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getCurrentUserFn, getMyContentAccessFn, getMyModuleResultsFn, saveMyModuleResultFn } from "@/lib/portal-db";
import { resolveDirectionByCourseTitle } from "@/lib/learning-content";

export const Route = createFileRoute("/final-test")({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "student") throw redirect({ to: "/account" });
    const access = (await getMyContentAccessFn()) as Array<{ course_title: string; content_type: string; is_enabled: number }>;
    const results = (await getMyModuleResultsFn({ data: { contentType: "final_test" } })) as Array<{
      direction_key: string;
      content_type: "final_test";
      module_index: number;
      score: number;
      total_questions: number;
      is_passed: number;
    }>;
    return { enabled: access.filter((x) => x.content_type === "final_test" && x.is_enabled === 1), results };
  },
  component: FinalTestPage,
});

function FinalTestPage() {
  const { enabled, results } = Route.useRouteContext();
  const available = useMemo(
    () =>
      enabled
        .map((row) => ({ row, direction: resolveDirectionByCourseTitle(row.course_title) }))
        .filter((x) => x.direction),
    [enabled],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedModuleIdx, setSelectedModuleIdx] = useState(0);
  const [answersByModule, setAnswersByModule] = useState<Record<string, Record<string, number>>>({});
  const [moduleScores, setModuleScores] = useState<Record<string, { score: number; total: number }>>(() => {
    const next: Record<string, { score: number; total: number }> = {};
    for (const r of results) {
      next[`${r.direction_key}-f-${r.module_index}`] = { score: r.score, total: r.total_questions };
    }
    return next;
  });
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const selected = available[selectedIdx];
  const modules = useMemo(() => {
    if (!selected?.direction) return [];
    const theoryBlocks = selected.direction.theory;
    const questions = selected.direction.finalTest;
    if (theoryBlocks.length === 0 || questions.length === 0) return [];
    const perModule = Math.ceil(questions.length / theoryBlocks.length);
    return theoryBlocks.map((block, idx) => ({
      id: `${selected.direction!.key}-f-${idx}`,
      title: block.title,
      questions: questions.slice(idx * perModule, (idx + 1) * perModule),
    }));
  }, [selected]);
  const activeModule = modules[selectedModuleIdx];
  const questions = activeModule?.questions ?? [];
  const moduleAnswers = activeModule ? answersByModule[activeModule.id] ?? {} : {};
  const answeredCount = questions.reduce((acc, q) => (moduleAnswers[q.id] !== undefined ? acc + 1 : acc), 0);
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const completedModulesCount = modules.filter((m) => {
    const done = moduleScores[m.id];
    return done && done.score === done.total;
  }).length;

  const submit = () => {
    if (!selected?.direction) return;
    if (questions.length === 0) return;
    if (answeredCount < questions.length) {
      toast.error("Ответьте на все вопросы перед завершением итогового теста");
      return;
    }
    const score = questions.reduce((acc, q) => (moduleAnswers[q.id] === q.correctIndex ? acc + 1 : acc), 0);
    setScore(score);
    setSubmitted(true);
    if (activeModule && selected?.direction) {
      setModuleScores((prev) => ({ ...prev, [activeModule.id]: { score, total: questions.length } }));
      void saveMyModuleResultFn({
        data: {
          directionKey: selected.direction.key,
          contentType: "final_test",
          moduleIndex: selectedModuleIdx,
          score,
          totalQuestions: questions.length,
        },
      });
    }
    if (score === questions.length && selectedModuleIdx < modules.length - 1) {
      setSelectedModuleIdx((prev) => prev + 1);
      setSubmitted(false);
      setScore(null);
    }
    const passed = score >= Math.ceil(questions.length * 0.7);
    toast.success(`Итог: ${score}/${questions.length}. ${passed ? "Тест пройден" : "Нужно пересдать"}`);
  };

  return (
    <PageShell>
      <section className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-400/30 sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.40),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(59,130,246,0.30),transparent_30%),linear-gradient(135deg,#020617,#0f172a_58%,#172554)]" />
          <div className="relative">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-sky-100 backdrop-blur">
              Итоговая аттестация
            </div>
            <h1 className="mt-5 font-display text-4xl font-extrabold sm:text-5xl">Финальный тест по направлению</h1>
            <p className="mt-4 max-w-3xl text-slate-200">
              Выберите направление, ответьте на вопросы и получите итоговый результат с проверкой прохождения.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Направление</div>
          {available.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Преподаватель пока не открыл вам доступ к итоговому тесту.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {available.map((item, idx) => (
                <button
                  key={`${item.row.course_title}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedIdx(idx);
                    setSelectedModuleIdx(0);
                    setSubmitted(false);
                    setScore(null);
                  }}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    selectedIdx === idx
                      ? "bg-slate-950 text-white shadow-lg shadow-slate-300/50"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.direction!.title}
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur sm:p-8">
          {selected ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-3xl font-extrabold">{selected.direction!.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Курс: {selected.row.course_title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Завершено модулей: {completedModulesCount}/{modules.length}
                  </p>
                </div>
                <div className="min-w-[220px]">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Прогресс</span>
                    <span>{answeredCount}/{questions.length}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {modules.map((module, idx) => {
                  const result = moduleScores[module.id];
                  const passed = result ? result.score === result.total : false;
                  const prevModule = idx > 0 ? modules[idx - 1] : null;
                  const prevResult = prevModule ? moduleScores[prevModule.id] : null;
                  const isUnlocked = idx === 0 || !!prevResult && prevResult.score === prevResult.total;
                  return (
                    <button
                      key={module.id}
                      type="button"
                      disabled={!isUnlocked}
                      onClick={() => {
                        if (!isUnlocked) return;
                        setSelectedModuleIdx(idx);
                        setSubmitted(false);
                        setScore(null);
                      }}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        selectedModuleIdx === idx
                          ? "border-slate-900 bg-slate-900 text-white"
                          : passed
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : isUnlocked
                              ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      }`}
                    >
                      <div className="font-semibold">Модуль {idx + 1}</div>
                      <div className="mt-1 text-xs opacity-85">{module.title}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4">
                {submitted && score !== null && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="font-semibold">
                      Итоговый результат: {score}/{questions.length}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Правильные ответы выделены зеленым, неверные — красным.
                    </div>
                  </div>
                )}
                {questions.map((q, qIdx) => (
                  <article key={q.id} className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6">
                    <div className="mb-3 inline-flex rounded-xl bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                      Вопрос {qIdx + 1}
                    </div>
                    <div className="font-semibold">{q.question}</div>
                    <div className="mt-3 grid gap-2">
                      {q.options.map((option, index) => (
                        <label
                          key={option}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                            submitted
                              ? index === q.correctIndex
                                ? "border-emerald-500 bg-emerald-50"
                                : moduleAnswers[q.id] === index
                                  ? "border-rose-500 bg-rose-50"
                                  : "border-slate-200 bg-white"
                              : moduleAnswers[q.id] === index
                                ? "border-primary bg-primary/5"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            checked={moduleAnswers[q.id] === index}
                            onChange={() =>
                              activeModule &&
                              setAnswersByModule((prev) => ({
                                ...prev,
                                [activeModule.id]: { ...(prev[activeModule.id] ?? {}), [q.id]: index },
                              }))
                            }
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
                <button type="button" onClick={submit} className="rounded-2xl bg-primary px-5 py-3 font-semibold text-white hover:opacity-95">
                  Завершить итоговый тест
                </button>
                {submitted && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeModule) {
                        setAnswersByModule((prev) => ({ ...prev, [activeModule.id]: {} }));
                        setModuleScores((prev) => {
                          const next = { ...prev };
                          delete next[activeModule.id];
                          return next;
                        });
                      }
                      setSubmitted(false);
                      setScore(null);
                    }}
                    className="rounded-2xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Пройти заново
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Нет доступных направлений для итогового теста.</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
