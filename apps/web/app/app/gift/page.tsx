"use client";

/**
 * Send to someone else's goal: the way in.
 *
 * Gifts were only reachable through a link someone shared (/app/gift/<address>), so /app/gift
 * itself was a 404 — and because that 404 is pre-rendered with the public layout and then
 * hydrated under the app layout, it also threw a React hydration error. This page is the missing
 * front door: paste the person's account address and continue.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { Button, Card, Notice, PageHeader, SectionTitle, TextField } from "@/components/ui";

export default function GiftStartPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const address = value.trim();
    if (!isAddress(address)) {
      setProblem("That doesn't look like an account address. It starts with 0x and is 42 characters long.");
      return;
    }
    router.push(`/app/gift/${address}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Send to someone's goal"
        lede="Help a friend or family member reach what they're saving for. The money goes straight to their account; you never get access to their plan."
      />
      <Card>
        <SectionTitle>Whose goal?</SectionTitle>
        <form onSubmit={go} noValidate className="space-y-4">
          <label htmlFor="gift-address" className="block text-[15px] font-medium text-ink">
            Their account address
          </label>
          <TextField
            id="gift-address"
            name="address"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            value={value}
            aria-invalid={problem ? true : undefined}
            aria-describedby="gift-address-hint"
            onChange={(e) => {
              setValue(e.target.value);
              setProblem(null);
            }}
          />
          <p id="gift-address-hint" className="text-sm text-ink-muted">
            They can find it in Modalis under Settings, then Your account. Or ask them to send you
            their gift link, which opens this for you.
          </p>
          {problem ? <Notice tone="warn">{problem}</Notice> : null}
          <Button type="submit">Continue</Button>
        </form>
      </Card>
    </div>
  );
}
