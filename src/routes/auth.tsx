import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { z } from "zod";

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

const schema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: "البريد الإلكتروني غير صحيح" })
    .max(255)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(6, { message: "كلمة السر لازم 6 حروف على الأقل" }).max(72),
});

export function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "بيانات غير صحيحة");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) throw error;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.is_active !== true) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("الحساب متوقف. تواصل مع المدير.");
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حصلت مشكلة";
      toast.error(
        msg.includes("Invalid login credentials")
          ? "البريد أو كلمة السر غلط"
          : /banned/i.test(msg)
            ? "الحساب متوقف. تواصل مع المدير."
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
          <BrandMark className="mx-auto h-14 w-14" />
          <h1 dir="ltr" className="mt-4 text-2xl font-extrabold tracking-tight">
            Mahaba Gold
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            دفتر الصاغة · حسابات الدهب والفلوس مع كل تاجر
          </p>
        </div>

        <Card className="p-5">
          <div className="mb-5">
            <h2 className="font-extrabold">تسجيل الدخول</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              استخدم البريد وكلمة السر اللي استلمتهم من المدير.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pe-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 end-0 grid w-11 place-items-center text-muted-foreground"
                  aria-label={showPassword ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="h-12 w-full text-base font-bold" disabled={busy}>
              {busy ? "لحظة..." : "دخول"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
