import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Pencil, Plus, ShieldCheck, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/gold-math";
import {
  createManagedUser,
  listManagedUsers,
  updateManagedUser,
} from "@/lib/user-management.functions";
import type { AppRole, ManagedUser } from "@/lib/user-management";
import { invalidateIdentityData } from "@/lib/query-cache";
import { cn } from "@/lib/utils";

type UserDraft = {
  id?: string;
  email: string;
  fullName: string;
  password: string;
  role: AppRole;
  isActive: boolean;
};

const newUserDraft = (): UserDraft => ({
  email: "",
  fullName: "",
  password: "",
  role: "user",
  isActive: true,
});

function readableError(error: Error) {
  if (/already (been )?registered|already exists/i.test(error.message)) {
    return "البريد ده مسجّل بالفعل";
  }
  if (/password/i.test(error.message)) return "راجع كلمة السر وحاول تاني";
  return error.message || "حصلت مشكلة أثناء حفظ المستخدم";
}

export function UserManagement() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserDraft>(newUserDraft);
  const [showPassword, setShowPassword] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "form">("list");

  const usersQuery = useQuery({
    queryKey: ["managed_users"],
    queryFn: () => listManagedUsers(),
    enabled: open,
  });
  const users = usersQuery.data ?? [];
  const selected = users.find((user) => user.id === draft.id);

  const save = useMutation({
    mutationFn: async () => {
      if (draft.id) {
        return updateManagedUser({
          data: {
            userId: draft.id,
            fullName: draft.fullName,
            role: draft.role,
            isActive: draft.isActive,
            ...(draft.password ? { password: draft.password } : {}),
          },
        });
      }
      return createManagedUser({
        data: {
          email: draft.email,
          fullName: draft.fullName,
          password: draft.password,
          role: draft.role,
        },
      });
    },
    onSuccess: async (user) => {
      toast.success(draft.id ? "تم تعديل المستخدم" : "تم إنشاء المستخدم ويمكنه الدخول الآن");
      queryClient.setQueryData<ManagedUser[]>(["managed_users"], (current = []) => {
        const exists = current.some((candidate) => candidate.id === user.id);
        return exists
          ? current.map((candidate) => (candidate.id === user.id ? user : candidate))
          : [...current, user];
      });
      setDraft({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        password: "",
        role: user.role,
        isActive: user.isActive,
      });
      setMobilePane("list");
      await Promise.all([
        invalidateIdentityData(queryClient),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
      ]);
    },
    onError: (error: Error) => toast.error(readableError(error)),
  });

  function edit(user: ManagedUser) {
    setDraft({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      password: "",
      role: user.role,
      isActive: user.isActive,
    });
    setShowPassword(false);
    setMobilePane("form");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setMobilePane("list");
  }

  return (
    <>
      <Button className="h-10 gap-2 font-bold" onClick={() => handleOpenChange(true)}>
        <UserRoundCog className="size-4" />
        إدارة المستخدمين
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0 md:h-auto md:w-[calc(100%-1.5rem)] md:rounded-xl">
          <DialogHeader className="border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <ShieldCheck className="size-5 text-primary" />
              إدارة المستخدمين
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section
              className={cn(
                "min-h-0 flex-1 flex-col p-4 md:flex md:border-e",
                mobilePane === "list" ? "flex" : "hidden",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold">الحسابات</h3>
                  <p className="text-xs text-muted-foreground">{users.length} مستخدم</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 font-bold"
                  onClick={() => {
                    setDraft(newUserDraft());
                    setShowPassword(false);
                    setMobilePane("form");
                  }}
                >
                  <Plus className="size-4" />
                  مستخدم جديد
                </Button>
              </div>

              <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain border-y border-border md:max-h-[31rem]">
                {usersQuery.isLoading ? (
                  <div className="space-y-3 py-3">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : usersQuery.isError ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-destructive">تعذر تحميل المستخدمين.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => usersQuery.refetch()}
                    >
                      حاول تاني
                    </Button>
                  </div>
                ) : (
                  users.map((user) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => edit(user)}
                      className={cn(
                        "flex w-full items-center gap-3 px-2 py-3 text-start transition-colors hover:bg-muted/60",
                        draft.id === user.id && "bg-accent/60",
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-extrabold text-primary">
                        {(user.fullName || user.email).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">
                          {user.fullName}
                        </span>
                        <span
                          dir="ltr"
                          className="block truncate text-start text-xs text-muted-foreground"
                        >
                          {user.email}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role === "admin" ? "مدير" : "مستخدم"}
                        </Badge>
                        {!user.isActive ? (
                          <span className="text-[10px] font-bold text-destructive">متوقف</span>
                        ) : null}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <form
              className={cn(
                "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5 md:block",
                mobilePane === "form" ? "block" : "hidden",
              )}
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-me-2 -mt-1 gap-1.5 px-2 font-bold md:hidden"
                onClick={() => setMobilePane("list")}
              >
                <ArrowRight className="size-4" />
                الرجوع للحسابات
              </Button>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold">{draft.id ? "تعديل المستخدم" : "إضافة مستخدم"}</h3>
                  {selected ? (
                    <p className="text-xs text-muted-foreground">
                      أُنشئ في{" "}
                      <time dateTime={selected.createdAt}>{fmtDate(selected.createdAt)}</time>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">هيقدر يدخل فور حفظ الحساب.</p>
                  )}
                </div>
                {draft.id ? <Pencil className="size-4 text-muted-foreground" /> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="managed-user-name" className="font-bold">
                  الاسم
                </Label>
                <Input
                  id="managed-user-name"
                  value={draft.fullName}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, fullName: event.target.value }))
                  }
                  className="h-11"
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="managed-user-email" className="font-bold">
                  البريد الإلكتروني
                </Label>
                <Input
                  id="managed-user-email"
                  type="email"
                  dir="ltr"
                  autoComplete="off"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, email: event.target.value }))
                  }
                  className="h-11 text-start"
                  disabled={Boolean(draft.id)}
                  required
                />
                {draft.id ? (
                  <p className="text-xs text-muted-foreground">البريد ثابت ولا يمكن تعديله.</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="managed-user-password" className="font-bold">
                  {draft.id ? "كلمة سر جديدة (اختياري)" : "كلمة السر"}
                </Label>
                <div className="relative">
                  <Input
                    id="managed-user-password"
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    autoComplete="new-password"
                    value={draft.password}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, password: event.target.value }))
                    }
                    className="h-11 pe-10"
                    minLength={6}
                    maxLength={72}
                    required={!draft.id}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted-foreground"
                    aria-label={showPassword ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="font-bold">الصلاحية</Label>
                  <Select
                    value={draft.role}
                    onValueChange={(role: AppRole) => setDraft((value) => ({ ...value, role }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">مستخدم</SelectItem>
                      <SelectItem value="admin">مدير</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.id ? (
                  <div className="space-y-1.5">
                    <Label className="font-bold">حالة الحساب</Label>
                    <div className="flex h-11 items-center justify-between rounded-md border border-input px-3">
                      <span className="text-sm font-semibold">
                        {draft.isActive ? "نشط" : "متوقف"}
                      </span>
                      <Switch
                        checked={draft.isActive}
                        onCheckedChange={(isActive) =>
                          setDraft((value) => ({ ...value, isActive }))
                        }
                        aria-label="حالة الحساب"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <Button type="submit" className="h-11 w-full font-bold" disabled={save.isPending}>
                {save.isPending ? "جاري الحفظ..." : draft.id ? "حفظ التعديلات" : "إنشاء الحساب"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
