/** Result shape returned by admin server actions to forms (client-safe). */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string; redirectTo?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const IDLE: ActionState = { status: "idle" };
