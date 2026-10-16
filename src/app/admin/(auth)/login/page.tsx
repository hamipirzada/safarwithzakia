import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/authz";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getCurrentStaff()) redirect("/admin");
  const { next, reset } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : null} passwordReset={reset === "1"} />;
}
