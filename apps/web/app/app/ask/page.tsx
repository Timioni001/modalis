"use client";

/**
 * Ask Modalis.
 *
 * A conversation, but not a chatbot: every reply is assembled by the domain's answer engine from
 * the figures Modalis actually holds, and shows the evidence it used underneath. Nothing here
 * calls a language model, so nothing here can invent a balance, a limit or a promise.
 *
 * The suggested questions are the product's eight real questions. Typing something else works if
 * it is about the person's goal, plan or money; anything else gets an honest "I can't answer that".
 */
import { useCallback, useMemo, useState } from "react";
import {
  answer,
  answerIntent,
  SUGGESTED_QUESTIONS,
  type Answer,
  type Facts,
  type Intent,
} from "@modalis/domain";
import { Chat, ChatComposer, ChatHeader, ChatMessages, type ChatMessageItem } from "@/components/shadcn/chat";
import { PageHeader } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";

export default function AskPage() {
  return (
    <PortfolioGate>
      <Ask />
    </PortfolioGate>
  );
}

/** The reply text, followed by its evidence as plain lines — what the answer rests on. */
function render(a: Answer): string {
  if (a.evidence.length === 0) return a.text;
  const lines = a.evidence.map((e) => `· ${e.label}: ${e.value}`).join("\n");
  return `${a.text}\n\nBased on\n${lines}`;
}

let seq = 0;
const id = () => `m${++seq}`;
const now = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

function Ask() {
  const { goal, plan, money, adjustment, planStatus } = usePortfolio();
  const facts: Facts = useMemo(
    () => ({
      goal,
      plan,
      money,
      adjustment,
      allocation: planStatus
        ? {
            furthestOffTargetPercent: planStatus.furthestOffTargetPercent,
            largestHoldingPercent: planStatus.largestHoldingPercent,
            availableMoneyPercent: planStatus.availableMoneyPercent,
          }
        : undefined,
    }),
    [goal, plan, money, adjustment, planStatus],
  );

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);

  const reply = useCallback((question: string, a: Answer) => {
    setMessages((m) => [
      ...m,
      { id: id(), role: "user", content: question, timestamp: now(), status: "delivered" },
      { id: id(), role: "assistant", author: "Modalis", content: render(a), timestamp: now(), status: "delivered" },
    ]);
  }, []);

  const send = useCallback((text: string) => {
    const q = text.trim();
    if (q) reply(q, answer(q, facts));
  }, [facts, reply]);

  const ask = (intent: Intent, question: string) => reply(question, answerIntent(intent, facts));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ask Modalis"
        lede="Questions about your goal, your plan and your money — answered from your own figures."
      />

      <Chat messages={messages} onSendMessage={send} className="h-[calc(100dvh-380px)] min-h-[380px] rounded-[28px] border-0 shadow-[var(--shadow-card)] lg:h-[calc(100dvh-220px)]">
        <div className="flex min-w-0 flex-1 flex-col bg-surface">
          <ChatHeader
            title="Modalis"
            subtitle="Answers from your plan's own figures"
            onClearChat={() => setMessages([])}
          />
          <ChatMessages
            emptyPlaceholder={
              <div className="mx-auto max-w-sm px-4 text-center">
                <p className="text-[15px] font-semibold text-ink">What would you like to know?</p>
                <p className="mt-1.5 text-[13.5px] text-ink-muted">
                  Every answer shows the figures it&rsquo;s based on.
                </p>
              </div>
            }
          />
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-2 [scrollbar-width:none]">
            {SUGGESTED_QUESTIONS.map((s) => (
              <button
                key={s.intent}
                type="button"
                onClick={() => ask(s.intent, s.question)}
                className="min-h-[44px] flex-none rounded-full bg-sunken px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-line hover:text-ink"
              >
                {s.question}
              </button>
            ))}
          </div>
          <ChatComposer placeholder="Ask about your goal, plan or money" allowAttachments={false} />
        </div>
      </Chat>
    </div>
  );
}
