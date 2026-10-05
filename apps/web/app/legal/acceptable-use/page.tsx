import type { Metadata } from "next";
import { PageHeader, Prose } from "@/components/prose";

export const metadata: Metadata = {
  title: "Acceptable use",
  description: "What Modalis may not be used for.",
};

export default function AcceptableUsePage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Acceptable use"
        lede="A short list, because the product surface is small and the rules that matter are few."
        updated="October 2026"
      />
      <Prose>
        <h2>Don&rsquo;t use Modalis to break the law</h2>
        <p>
          That includes money laundering, terrorist financing, sanctions evasion, tax evasion,
          fraud, and handling the proceeds of crime. It also includes using it anywhere its use is
          itself unlawful.
        </p>

        <h2>Don&rsquo;t use it on somebody else&rsquo;s behalf without authority</h2>
        <p>
          Use your own account for your own money. Do not operate a plan for someone who has not
          authorised it, and do not pool other people&rsquo;s money through a single plan — that is
          a regulated activity and Modalis is not licensed for it.
        </p>

        <h2>Don&rsquo;t attack it</h2>
        <p>
          No attempts to gain access to another person&rsquo;s plan or data, to interfere with
          availability for others, to flood it with automated requests, or to probe it for
          vulnerabilities beyond what good-faith security research requires.
        </p>
        <p>
          Good-faith research is welcome. Report what you find privately through{" "}
          <a href="/contact">the contact page</a> and give us a reasonable window to fix it before
          going public.
        </p>

        <h2>Don&rsquo;t misrepresent it</h2>
        <p>
          Don&rsquo;t present Modalis as a regulated financial service, a licensed adviser, or as
          offering guaranteed returns. It is none of those things, and saying otherwise could cause
          real harm to someone who believes it.
        </p>

        <h2>Don&rsquo;t abuse the AI layer</h2>
        <p>
          Don&rsquo;t attempt to use the goal interpreter to generate content unrelated to planning
          money, or to manipulate it into producing recommendations outside its purpose. Its output
          is checked against your limits regardless, but the attempt itself is not acceptable use.
        </p>

        <h2>What happens if you do</h2>
        <p>
          Access may be restricted. What cannot be restricted — deliberately — is your ability to
          withdraw your own money, which remains yours regardless of any dispute with us.
        </p>
      </Prose>
    </>
  );
}
