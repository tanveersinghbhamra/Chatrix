// validators/auth.validator.ts
import { z } from "zod";

// ─── Reusable password schema ─────────────────────────────────────────────────
const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character");

// ─── Signup ───────────────────────────────────────────────────────────────────
export const signupSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address").toLowerCase().trim(),
        password: passwordSchema,
        fullName: z
            .string()
            .min(2, "Name must be at least 2 characters")
            .max(100, "Name too long")
            .trim(),
        businessName: z
            .string()
            .min(2, "Business name must be at least 2 characters")
            .max(100, "Business name too long")
            .trim(),
        // ✅ Optional — defaults to 'general' matching DB default
        businessType: z
            .string()
            .min(2, "Business type must be at least 2 characters")
            .max(100, "Business type too long")
            .trim()
            .optional()
            .default("general"),
    }),
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address").toLowerCase().trim(),
        password: z.string().min(1, "Password is required"),
        tenantId: z.string().uuid("Invalid tenant ID").optional(),
    }),
});

// ─── Forgot password ──────────────────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address").toLowerCase().trim(),
    }),
});

// ─── Reset password ───────────────────────────────────────────────────────────
export const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1, "Reset token is required"),
        password: passwordSchema,
    }),
});

// ─── Change password ──────────────────────────────────────────────────────────
export const changePasswordSchema = z.object({
    body: z
        .object({
            currentPassword: z.string().min(1, "Current password is required"),
            newPassword: passwordSchema,
        })
        // ✅ Cross-field validation — new password must differ from current
        .refine((data) => data.currentPassword !== data.newPassword, {
            message:
                "New password must be different from your current password",
            path: ["newPassword"],
        }),
});

// ─── Refresh token ────────────────────────────────────────────────────────────
// ✅ Added — needed for Session 6 token refresh endpoint
export const refreshTokenSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(1, "Refresh token is required"),
    }),
});

// ─── Invite user ──────────────────────────────────────────────────────────────
// ✅ Added — needed for Session 6/7 team management
export const inviteUserSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address").toLowerCase().trim(),
        fullName: z
            .string()
            .min(2, "Name must be at least 2 characters")
            .max(100, "Name too long")
            .trim(),
        role: z.enum(["agent", "viewer"], {
            errorMap: () => ({
                message:
                    "Role must be agent or viewer — owners cannot be invited",
            }),
        }),
    }),
});

// ─── Inferred TypeScript types ────────────────────────────────────────────────
export type SignupInput = z.infer<typeof signupSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>["body"];
export type InviteUserInput = z.infer<typeof inviteUserSchema>["body"];
