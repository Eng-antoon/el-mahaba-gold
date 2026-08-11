// @ts-expect-error -- Bun's test module is supplied by the runtime without browser bundle types.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createManagedUserSchema,
  updateManagedUserSchema,
  validateAccessChange,
} from "@/lib/user-management";

describe("managed user validation", () => {
  test("normalizes a new user's email and accepts the supported roles", () => {
    const value = createManagedUserSchema.parse({
      email: "  Manager@Example.COM ",
      fullName: "مدير المحل",
      password: "secret12",
      role: "admin",
    });
    expect(value.email).toBe("manager@example.com");
    expect(value.role).toBe("admin");
  });

  test("requires a usable password for new users", () => {
    expect(() =>
      createManagedUserSchema.parse({
        email: "user@example.com",
        fullName: "مستخدم",
        password: "123",
        role: "user",
      }),
    ).toThrow();
  });

  test("does not expose email as an editable field", () => {
    const value = updateManagedUserSchema.parse({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "changed@example.com",
      fullName: "مستخدم",
      role: "user",
      isActive: true,
    });
    expect("email" in value).toBe(false);
  });
});

describe("administrator safeguards", () => {
  test("prevents an administrator from disabling the current account", () => {
    expect(() =>
      validateAccessChange({
        actorId: "admin-1",
        targetId: "admin-1",
        targetWasActiveAdmin: true,
        nextRole: "admin",
        nextIsActive: false,
        activeAdminCount: 2,
      }),
    ).toThrow("ماينفعش توقف حسابك الحالي");
  });

  test("prevents removing the last active administrator", () => {
    expect(() =>
      validateAccessChange({
        actorId: "admin-1",
        targetId: "admin-2",
        targetWasActiveAdmin: true,
        nextRole: "user",
        nextIsActive: true,
        activeAdminCount: 1,
      }),
    ).toThrow("لازم يفضل مدير نشط واحد على الأقل");
  });

  test("allows a role change when another active administrator remains", () => {
    expect(() =>
      validateAccessChange({
        actorId: "admin-1",
        targetId: "admin-2",
        targetWasActiveAdmin: true,
        nextRole: "user",
        nextIsActive: true,
        activeAdminCount: 2,
      }),
    ).not.toThrow();
  });
});

describe("admin-only provisioning contract", () => {
  test("marks server-created accounts and rejects later public signups", () => {
    const serverFunctions = readFileSync("src/lib/user-management.functions.ts", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260810194053_restrict_signup_to_admin_provisioning.sql",
      "utf8",
    );

    expect(serverFunctions).toContain("provisioned_by_admin: true");
    expect(serverFunctions).toContain('await import("@/integrations/supabase/client.server")');
    expect(migration).toContain("admin_count > 0 AND NOT provisioned_by_admin");
  });
});

describe("mobile user-management flow", () => {
  test("opens on the account list and reveals the form only after an explicit action", () => {
    const component = readFileSync("src/components/user-management.tsx", "utf8");

    expect(component).toContain('useState<"list" | "form">("list")');
    expect(component).toContain('setMobilePane("form")');
    expect(component).toContain('onClick={() => setMobilePane("list")}');
    expect(component).toContain('mobilePane === "form" ? "block" : "hidden"');
    expect(component).toContain("md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]");
  });
});
