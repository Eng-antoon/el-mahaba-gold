import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Users, PlusCircle, ScrollText, LogOut, BookOpenText } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { PwaInstallButton } from "@/components/pwa-install";

const NAV = [
  { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/merchants", label: "التجار", icon: Users },
  { to: "/new", label: "حركة", icon: PlusCircle },
  { to: "/statements", label: "كشف حساب", icon: BookOpenText },
  { to: "/audit", label: "السجل", icon: ScrollText },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-background pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/dashboard"
              preload="intent"
              viewTransition
              className="flex shrink-0 items-center gap-2"
            >
              <BrandMark className="h-9 w-9 rounded-xl" />
              <span dir="ltr" className="hidden text-base font-extrabold tracking-tight sm:block">
                Mahaba Gold
              </span>
            </Link>
            {title ? (
              <>
                <span className="hidden text-muted-foreground sm:block">/</span>
                <h1 className="truncate text-base font-bold sm:text-lg">{title}</h1>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <NavItem key={n.to} {...n} active={pathname.startsWith(n.to)} />
              ))}
            </nav>
            <PwaInstallButton />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="خروج">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main
        key={pathname}
        className="page-enter mx-auto min-w-0 max-w-6xl px-3 py-4 sm:px-4 sm:py-5"
      >
        {children}
      </main>

      {/* شريط تنقل سفلي للموبايل */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/98 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                preload="intent"
                viewTransition
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      preload="intent"
      viewTransition
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
