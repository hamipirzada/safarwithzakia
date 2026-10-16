import { execSync } from "node:child_process";

/** Apply migrations to the dedicated test database before integration tests run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://safar:safar_dev_pw@127.0.0.1:55433/safar_test?schema=public";
  if (!/safar_test|_test\b|test/.test(url)) throw new Error("Refusing to run integration tests against a database whose name does not contain 'test'.");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
