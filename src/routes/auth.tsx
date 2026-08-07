import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — دفتر الصاغة" },
      { name: "description", content: "ادخل على حسابك لمتابعة أرصدة الذهب والفلوس مع التجار." },
      { property: "og:title", content: "تسجيل الدخول — دفتر الصاغة" },
      { property: "og:description", content: "ادخل على حسابك لمتابعة أرصدة الذهب والفلوس." },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email({ message: "البريد الإلكتروني غير صحيح" }).max(255),
  password: z.string().min(6, { message: "كلمة السر لازم 6 حروف على الأقل" }).max(72),
  fullName: z.string().trim().max(100).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "بيانات غير صحيحة");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: parsed.data.fullName || "" },
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/dashboard", replace: true });
        } else {
          toast.success("تم إنشاء الحساب — افتح بريدك وأكّد التسجيل");
          setMode("login");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حصلت مشكلة";
      toast.error(
        msg.includes("Invalid login credentials")
          ? "البريد أو كلمة السر غلط"
          : msg.includes("already registered")
            ? "البريد ده مسجّل بالفعل"
            : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-2xl font-extrabold text-primary-foreground">
            ص
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">دفتر الصاغة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            حسابات الذهب والفلوس مع كل تاجر في مكان واحد
          </p>
        </div>

        <Card className="p-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg py-2 text-sm font-bold transition-colors ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {m === "login" ? "دخول" : "حساب جديد"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="font-bold">
                  الاسم
                </Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="اسمك"
                  className="h-12"
                  maxLength={100}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-bold">
                البريد الإلكتروني
              </Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="h-12"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-bold">
                كلمة السر
              </Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
                required
              />
            </div>
            <Button type="submit" className="h-12 w-full text-base font-bold" disabled={busy}>
              {busy ? "لحظة..." : mode === "login" ? "دخول" : "إنشاء الحساب"}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link to="/" className="font-semibold underline-offset-4 hover:underline">
            رجوع للصفحة الرئيسية
          </Link>
        </p>
      </div>
    </div>
  );
}
