import { createServerFn } from "@tanstack/react-start";

type ChatMessage = { role: "user" | "assistant"; content: string };

export const askAiAssistantFn = createServerFn({ method: "POST" })
  .inputValidator((data: { message: string; history?: ChatMessage[] }) => data)
  .handler(async (ctx) => {
    const { callOpenRouter } = await import("./ai-assistant.server");
    return callOpenRouter(ctx.data);
  });
