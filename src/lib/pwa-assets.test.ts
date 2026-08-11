// @ts-expect-error -- Bun's test module is supplied by the runtime without browser bundle types.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("Mahaba Gold PWA assets", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
    name: string;
    start_url: string;
    display: string;
    lang: string;
    dir: string;
    icons: Array<{ src: string; sizes: string; purpose: string }>;
    shortcuts: Array<{ name: string; url: string }>;
  };

  test("defines the install identity and standalone launch", () => {
    expect(manifest.name).toBe("Mahaba Gold");
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("ar");
    expect(manifest.dir).toBe("rtl");
  });

  test("provides standard and maskable install icons", () => {
    expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) expect(existsSync(`public${icon.src}`)).toBe(true);
    expect(existsSync("public/favicon.png")).toBe(true);
    expect(existsSync("public/icons/apple-touch-icon.png")).toBe(true);
  });

  test("exposes quick shortcuts to the busiest screens", () => {
    const urls = manifest.shortcuts.map((shortcut) => shortcut.url);
    expect(urls).toContain("/new");
    expect(urls).toContain("/merchants");
    expect(urls).toContain("/statements");
  });

  test("keeps financial requests out of the service worker cache", () => {
    const worker = readFileSync("public/sw.js", "utf8");
    expect(worker).toContain("url.origin !== self.location.origin");
    expect(worker).not.toContain("supabase.co");
    expect(worker).not.toContain("/rest/v1");
  });

  test("guards service worker registration against preview contexts", () => {
    const register = readFileSync("src/lib/register-sw.ts", "utf8");
    expect(register).toContain("window.self !== window.top");
    expect(register).toContain("id-preview--");
    expect(register).toContain('get("sw") === "off"');
  });

  test("uses one global, session-dismissable install prompt without a navbar action", () => {
    const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
    const rootRoute = readFileSync("src/routes/__root.tsx", "utf8");
    const installPrompt = readFileSync("src/components/pwa-install.tsx", "utf8");

    expect(appShell).not.toContain("PwaInstallButton");
    expect(appShell).not.toContain("PwaInstallPrompt");
    expect(rootRoute).toContain("<PwaInstallPrompt hasMobileNav={hasMobileNav} />");
    expect(installPrompt).toContain("window.sessionStorage");
    expect(installPrompt).not.toContain("window.localStorage");
    expect(installPrompt).toContain("if (ios) setShowIosHelp(true)");
  });
});
