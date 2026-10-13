/** Run against either schema version. Proves owner-scoped JSON persistence without column 0004. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGoal,
  saveInterview,
  updateGoal,
  upsertUser,
  serverClient,
  resetClientCache,
} from "@modalis/db";
import { savedSavings } from "../src/services/savings.ts";
import type { Address } from "viem";
const url = process.env.MODALIS_IT_URL;
const key = process.env.MODALIS_IT_SERVICE_KEY;
test(
  "saving preferences persist in interviews on the original schema and remain scoped to their goal and owner",
  { skip: !url || !key },
  async () => {
    resetClientCache();
    const db = serverClient({ url, serviceRoleKey: key })!;
    const owner = `0x${Date.now().toString(16).padStart(40, "0")}` as Address;
    const user = (await upsertUser(db, {
      walletAddress: owner,
      chainId: 10143,
    }))!;
    const preferences = {
      minimumContribution: "10.25",
      minimumRetrievalDays: 30,
      customDetails: "Tuition",
      startedAt: "2026-10-01T00:00:00.000Z",
    };
    const goal = (await createGoal(db, {
      userId: user.id,
      type: "custom",
      name: "Tuition",
      initialAmount: 0,
      contributionAmount: 50,
      contributionCadence: "monthly",
      targetValue: 2000,
      targetDate: "2028-01-01",
      savingsPreferences: preferences,
    }))!;
    assert.ok(goal);
    assert.ok(
      await saveInterview(db, {
        userId: user.id,
        goalId: goal.id,
        answers: { savings: preferences },
      }),
    );
    assert.deepEqual(await savedSavings(db, user.id, goal), preferences);
    const changed = {
      ...preferences,
      minimumContribution: "15.50",
      customDetails: "Updated tuition",
    };
    const updated = (await updateGoal(db, user.id, goal.id, {
      savingsPreferences: changed,
    }))!;
    assert.ok(updated);
    assert.ok(
      await saveInterview(db, {
        userId: user.id,
        goalId: goal.id,
        answers: { savings: changed },
      }),
    );
    assert.deepEqual(await savedSavings(db, user.id, updated), changed);
    const otherGoal = (await createGoal(db, {
      userId: user.id,
      type: "custom",
      name: "Travel",
      initialAmount: 0,
      contributionAmount: 50,
      contributionCadence: "monthly",
      targetValue: 5000,
      targetDate: "2028-01-01",
    }))!;
    assert.notDeepEqual(await savedSavings(db, user.id, otherGoal), changed);
    const stranger = (await upsertUser(db, {
      walletAddress: "0x0000000000000000000000000000000000000abc",
      chainId: 10143,
    }))!;
    assert.equal(
      await updateGoal(db, stranger.id, goal.id, {
        savingsPreferences: preferences,
      }),
      null,
    );
  },
);
