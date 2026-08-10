import { useCallback, useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandMark } from "@/components/brand-mark";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "mahaba-install-dismissed-at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

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
      setShowIosHelp(true);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }, [promptEvent]);

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

export function PwaInstallButton() {
  const { canInstall, install, showIosHelp, setShowIosHelp } = usePwaInstall();
  if (!canInstall) return null;

  return (
    <>
      <Button variant="ghost" size="icon" onClick={install} aria-label="تثبيت التطبيق">
        <Download className="size-5" />
      </Button>
      <IosHelpDialog open={showIosHelp} onOpenChange={setShowIosHelp} />
    </>
  );
}

/** شريط تنبيه بالتثبيت، يظهر لو التطبيق مش مثبت على الجهاز. */
export function PwaInstallPrompt() {
  const { canInstall, install, showIosHelp, setShowIosHelp } = usePwaInstall();
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const at = raw ? Number(raw) : 0;
    setSnoozed(Boolean(at) && Date.now() - at < DISMISS_MS);
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setSnoozed(true);
  }

  if (!canInstall || snoozed) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg md:max-w-md">
          <BrandMark className="h-10 w-10 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-6">ثبّت Mahaba Gold على جهازك</p>
            <p className="truncate text-xs text-muted-foreground">دخول أسرع من الشاشة الرئيسية.</p>
          </div>
          <Button size="sm" className="font-bold" onClick={install}>
            تثبيت
          </Button>
          <Button variant="ghost" size="icon" onClick={dismiss} aria-label="مش دلوقتي">
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <IosHelpDialog open={showIosHelp} onOpenChange={setShowIosHelp} />
    </>
  );
}
