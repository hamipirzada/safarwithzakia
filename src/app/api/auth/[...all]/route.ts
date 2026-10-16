import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

// Better Auth endpoints (sign-in, sign-out, session, password reset). Sign-up is disabled.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
