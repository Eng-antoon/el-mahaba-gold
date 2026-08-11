import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Mahaba Gold" },
      {
        name: "description",
        content:
          "سجّل الوارد والمنصرف من الذهب والفلوس، واعرف على طول كل تاجر ليه كام وعليه كام بالجرام وبالجنيه.",
      },
      { property: "og:title", content: "Mahaba Gold — دفتر الصاغة" },
      {
        property: "og:description",
        content:
          "سجّل الوارد والمنصرف من الذهب والفلوس، واعرف على طول كل تاجر ليه كام وعليه كام بالجرام وبالجنيه.",
      },
    ],
  }),
  component: AuthPage,
});
