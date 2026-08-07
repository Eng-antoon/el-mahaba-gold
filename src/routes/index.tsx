import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Scale, Wallet, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "دفتر الصاغة — نظام حسابات محل الذهب" },
      {
        name: "description",
        content:
          "سجّل الوارد والمنصرف من الذهب والفلوس، واعرف على طول كل تاجر ليه كام وعليه كام بالجرام وبالجنيه.",
      },
      { property: "og:title", content: "دفتر الصاغة — نظام حسابات محل الذهب" },
      {
        property: "og:description",
        content: "سجّل الوارد والمنصرف من الذهب والفلوس، واعرف على طول كل تاجر ليه كام وعليه كام بالجرام وبالجنيه.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-2xl font-extrabold text-primary-foreground">
          ص
        </span>
        <h1 className="mt-7 text-3xl font-extrabold leading-tight sm:text-5xl">
          دفتر الصاغة
          <span className="mt-2 block text-xl font-bold text-muted-foreground sm:text-2xl">
            حسابات الذهب والفلوس مع كل تاجر — بضغطة زرار
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
          سجّل الوارد من المشغولات والسبايك، والتسديد بالكسر أو السبيكة أو النقدية، والنظام يحسبلك
          التحويل بين العيارات ويقولك في أي لحظة كل تاجر ليه عندك كام وعليه كام — دهب بعيار 21
          وفلوس.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-13 gap-2 px-6 text-base font-bold">
            <Link to="/auth">
              ابدأ الدخول
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Scale, t: "تحويل العيارات تلقائي", d: "24 و21 و18 و830 والبندقي — كله يرجع لعيار 21." },
            { icon: Wallet, t: "دهب وفلوس مفصولين", d: "تعرف الدين بالجرام والدين بالجنيه كل واحد لوحده." },
            { icon: Users, t: "صفحة لكل تاجر", d: "كشف حساب كامل بكل حركة ووارد وتسديد." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-5">
              <Icon className="h-6 w-6 text-primary" />
              <h2 className="mt-3 text-base font-bold">{t}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
