import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Mahaba Gold" },
      { name: "description", content: "ادخل على حسابك لمتابعة أرصدة الذهب والفلوس مع التجار." },
      { property: "og:title", content: "تسجيل الدخول — Mahaba Gold" },
      { property: "og:description", content: "ادخل على حسابك لمتابعة أرصدة الذهب والفلوس." },
    ],
  }),
  component: AuthPage,
});
