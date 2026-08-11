import { useCallback, useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "mahaba-install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/** يفحص عند كل فتح للتطبيق: مثبت ولا لأ، وإيه طريقة التثبيت المتاحة. */
function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIosDevice());
    setReady(true);

    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = () => setInstalled(isStandalone());
    media.addEventListener("change", onDisplayChange);

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    return () => {
      media.removeEventListener("change", onDisplayChange);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) {
      if (ios) setShowIosHelp(true);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }, [ios, promptEvent]);

  const canInstall = ready && !installed && (Boolean(promptEvent) || ios);

  return { canInstall, install, showIosHelp, setShowIosHelp };
}

function IosHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تثبيت Mahaba Gold</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-7 text-muted-foreground">
          <p className="flex items-start gap-2">
            <Share className="mt-1 size-4 shrink-0 text-primary" />
            افتح قائمة المشاركة في المتصفح.
          </p>
          <p>اختار «إضافة إلى الشاشة الرئيسية»، وبعدها اضغط «إضافة».</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** شريط تنبيه بالتثبيت، يظهر لو التطبيق مش مثبت على الجهاز. */
export function PwaInstallPrompt({ hasMobileNav }: { hasMobileNav: boolean }) {
  const { canInstall, install, showIosHelp, setShowIosHelp } = usePwaInstall();
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    setSnoozed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  function dismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setSnoozed(true);
  }

  if (!canInstall || snoozed) return null;

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 z-40 px-3 md:bottom-[calc(1rem+env(safe-area-inset-bottom))]",
          hasMobileNav
            ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
            : "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
        )}
      >
        <div className="mx-auto flex max-w-sm items-center gap-1 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-sm backdrop-blur">
          <p className="min-w-0 flex-1 truncate px-2 text-xs font-semibold">ثبّت Mahaba Gold</p>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 px-3 text-xs font-bold"
            onClick={install}
          >
            تثبيت
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={dismiss}
            aria-label="مش دلوقتي"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <IosHelpDialog open={showIosHelp} onOpenChange={setShowIosHelp} />
    </>
  );
}
