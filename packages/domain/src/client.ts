/** Browser-safe product vocabulary and pure calculations. No persistence or execution services. */
export * from "./models.ts";
export * from "./savings-preferences.ts";
export * from "./terms.ts";
export * from "./health.ts";
export * from "./answers.ts";
export * from "./projection.ts";
export * from "./contributions.ts";
export * from "./goals.ts";
export * from "./assets.ts";
export * from "./exposure.ts";
export * from "./automation.ts";
export * from "./twin.ts";
export type { GoalAnswers } from "./services/plans.ts";
export type { GoalView, ScenarioSet } from "./services/goal.ts";
export type { GoalsView, NewGoal, GoalDefinition } from "./services/goals.ts";
export type { PlanVersion } from "./services/history.ts";
export type { NotificationView } from "./services/notifications.ts";
export type { AutomationView } from "./services/automation.ts";
