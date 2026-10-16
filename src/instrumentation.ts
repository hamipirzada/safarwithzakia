/** Runs once when the server starts: fail fast with a clear message if configuration is invalid. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./server/env");
    getEnv();
  }
}
