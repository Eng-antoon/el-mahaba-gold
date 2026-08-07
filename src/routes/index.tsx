import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "./auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — المحبة للذهب" },
      {
        name: "description",
        content:
          "سجّل الوارد والمنصرف من الذهب والفلوس، واعرف على طول كل تاجر ليه كام وعليه كام بالجرام وبالجنيه.",
      },
      { property: "og:title", content: "المحبة للذهب — دفتر الصاغة" },
      {
        property: "og:description",
        content:
          "سجّل الوارد والمنصرف من الذهب والفلوس، واعرف على طول كل تاجر ليه كام وعليه كام بالجرام وبالجنيه.",
      },
    ],
  }),
  component: AuthPage,
});
