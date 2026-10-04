/**
 * POST /api/mandate/draft — interview answers -> a mandate the contract will accept.
 *
 * Runs the deterministic pipeline (profile -> allocation -> mandate) and returns the exact
 * parameters the user's wallet will sign. It writes nothing on-chain: only the owner can set a
 * mandate, and they do it from their own wallet.
 *
 * If the answers include free text, the LLM is given one job — reading that text into structured
 * fields — and its output is schema-validated. When it is unavailable the form fields are used.
 */
import { buildMandateDraft, explainMandate, interpretGoal, type InterviewAnswers } from "@modalis/ai";
import { aiConfig, getServerContext } from "@/lib/server";
import { readUniverse } from "@/lib/universe";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

function parseAnswers(body: unknown): InterviewAnswers {
  const b = body as Partial<InterviewAnswers>;
  const required: (keyof InterviewAnswers)[] = [
    "goalType",
    "targetValue",
    "initialAmount",
    "contributionAmount",
    "contributionCadence",
    "horizonMonths",
    "drawdownResponse",
    "maxTolerableDrawdownPct",
    "liquidityNeed",
    "incomeStability",
  ];
  for (const k of required) {
    if (b[k] === undefined || b[k] === null) throw new Error(`Missing answer: ${k}`);
  }
  return b as InterviewAnswers;
}

export async function POST(request: Request): Promise<Response> {
  let answers: InterviewAnswers;
  try {
    answers = parseAnswers(await request.json());
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Invalid request body");
  }

  try {
    const { client, deployment, deployed } = await getServerContext();
    if (!deployed) return errorResponse("Modalis is not deployed on this chain yet.", 503);

    const universe = await readUniverse(client, deployment);

    // Optional: let the model read a free-text goal. Its output only ever replaces the goal
    // fields, never the allocation or any mandate limit.
    let goal;
    let restatement: string | undefined;
    if (answers.goalDescription) {
      const parsed = await interpretGoal(answers.goalDescription, aiConfig());
      if (parsed && parsed.confidence !== "low") {
        goal = parsed.goal;
        restatement = parsed.restatement;
        answers = {
          ...answers,
          targetValue: parsed.goal.targetValue,
          horizonMonths: parsed.goal.horizonMonths,
          goalType: parsed.goal.goalType,
        };
      }
    }

    const draft = buildMandateDraft(answers, universe, { goal });

    return jsonResponse({
      draft,
      explanation: explainMandate(draft).body,
      goalRestatement: restatement,
      universe,
    });
  } catch (err) {
    // buildMandateDraft throws rather than return a mandate the chain would reject.
    return errorResponse(err instanceof Error ? err.message : "Could not build a mandate", 422);
  }
}
