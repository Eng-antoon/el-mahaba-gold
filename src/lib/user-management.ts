import { z } from "zod";

export type AppRole = "admin" | "user";

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
}

const emailSchema = z
  .string()
  .trim()
  .email({ message: "البريد الإلكتروني غير صحيح" })
  .max(255)
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(6, { message: "كلمة السر لازم 6 حروف على الأقل" })
  .max(72, { message: "كلمة السر طويلة جدًا" });

export const createManagedUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1, { message: "لازم تكتب اسم المستخدم" }).max(100),
  password: passwordSchema,
  role: z.enum(["admin", "user"]),
});

export const updateManagedUserSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(1, { message: "لازم تكتب اسم المستخدم" }).max(100),
  password: passwordSchema.optional(),
  role: z.enum(["admin", "user"]),
  isActive: z.boolean(),
});

export type CreateManagedUserInput = z.infer<typeof createManagedUserSchema>;
export type UpdateManagedUserInput = z.infer<typeof updateManagedUserSchema>;

export function validateAccessChange({
  actorId,
  targetId,
  targetWasActiveAdmin,
  nextRole,
  nextIsActive,
  activeAdminCount,
}: {
  actorId: string;
  targetId: string;
  targetWasActiveAdmin: boolean;
  nextRole: AppRole;
  nextIsActive: boolean;
  activeAdminCount: number;
}) {
  if (actorId === targetId && !nextIsActive) {
    throw new Error("ماينفعش توقف حسابك الحالي");
  }

  const removesActiveAdmin = targetWasActiveAdmin && (!nextIsActive || nextRole !== "admin");
  if (removesActiveAdmin && activeAdminCount <= 1) {
    throw new Error("لازم يفضل مدير نشط واحد على الأقل");
  }
}
