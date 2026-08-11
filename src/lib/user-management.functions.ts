import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  createManagedUserSchema,
  updateManagedUserSchema,
  validateAccessChange,
  type AppRole,
  type ManagedUser,
} from "@/lib/user-management";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

async function requireAdmin(context: AuthContext) {
  const [{ data: role }, { data: profile }] = await Promise.all([
    context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle(),
    context.supabase.from("profiles").select("is_active").eq("id", context.userId).maybeSingle(),
  ]);

  if (!role || profile?.is_active !== true) throw new Error("غير مسموح بإدارة المستخدمين");
}

async function setSingleRole(admin: SupabaseClient<Database>, userId: string, role: AppRole) {
  const { data: current, error: readError } = await admin
    .from("user_roles")
    .select("id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (readError) throw readError;

  const first = current?.[0];
  if (!first) {
    const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
    if (error) throw error;
    return;
  }

  const extras = current.slice(1).map((item) => item.id);
  if (extras.length) {
    const { error } = await admin.from("user_roles").delete().in("id", extras);
    if (error) throw error;
  }

  if (first.role !== role) {
    const { error } = await admin.from("user_roles").update({ role }).eq("id", first.id);
    if (error) throw error;
  }
}

async function readManagedUsers(): Promise<ManagedUser[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: authData, error: authError }, profilesResult, rolesResult] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("user_roles").select("user_id, role"),
  ]);
  if (authError) throw authError;
  if (profilesResult.error) throw profilesResult.error;
  if (rolesResult.error) throw rolesResult.error;

  const profiles = new Map(profilesResult.data.map((profile) => [profile.id, profile]));
  const roles = new Map<string, AppRole>();
  for (const row of rolesResult.data) {
    if (!roles.has(row.user_id) || row.role === "admin") roles.set(row.user_id, row.role);
  }

  return authData.users
    .map((user) => {
      const profile = profiles.get(user.id);
      return {
        id: user.id,
        email: user.email ?? "",
        fullName:
          profile?.full_name ||
          (typeof user.user_metadata?.["full_name"] === "string"
            ? user.user_metadata["full_name"]
            : "مستخدم"),
        role: roles.get(user.id) ?? "user",
        isActive: profile?.is_active === true,
        createdAt: user.created_at,
      } satisfies ManagedUser;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    return readManagedUsers();
  });

export const createManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(createManagedUserSchema)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
      app_metadata: { provisioned_by_admin: true },
    });
    if (error) throw error;

    try {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.fullName, is_active: true })
        .eq("id", created.user.id);
      if (profileError) throw profileError;
      await setSingleRole(supabaseAdmin, created.user.id, data.role);
    } catch (setupError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw setupError;
    }

    const users = await readManagedUsers();
    const user = users.find((candidate) => candidate.id === created.user.id);
    if (!user) throw new Error("تم إنشاء الحساب لكن تعذر تحميل بياناته");
    return user;
  });

export const updateManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(updateManagedUserSchema)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profilesResult, rolesResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, is_active").order("created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (rolesResult.error) throw rolesResult.error;

    const targetProfile = profilesResult.data.find((profile) => profile.id === data.userId);
    if (!targetProfile) throw new Error("المستخدم غير موجود");
    const targetIsAdmin = rolesResult.data.some(
      (role) => role.user_id === data.userId && role.role === "admin",
    );
    const activeIds = new Set(
      profilesResult.data.filter((profile) => profile.is_active).map((profile) => profile.id),
    );
    const activeAdminCount = new Set(
      rolesResult.data
        .filter((role) => role.role === "admin" && activeIds.has(role.user_id))
        .map((role) => role.user_id),
    ).size;

    validateAccessChange({
      actorId: context.userId,
      targetId: data.userId,
      targetWasActiveAdmin: targetIsAdmin && targetProfile.is_active,
      nextRole: data.role,
      nextIsActive: data.isActive,
      activeAdminCount,
    });

    const authPatch = {
      ban_duration: data.isActive ? ("none" as const) : "876000h",
      user_metadata: { full_name: data.fullName },
      ...(data.password ? { password: data.password } : {}),
    };
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      authPatch,
    );
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, is_active: data.isActive })
      .eq("id", data.userId);
    if (profileError) throw profileError;
    await setSingleRole(supabaseAdmin, data.userId, data.role);

    const users = await readManagedUsers();
    const user = users.find((candidate) => candidate.id === data.userId);
    if (!user) throw new Error("تم التعديل لكن تعذر تحميل بيانات المستخدم");
    return user;
  });
