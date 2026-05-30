// Zod validation schemas for all auth-related endpoints
//
// Why export inferred types:
//   Zod automatically infers TypeScript types from schemas.
//   Exporting them means controllers get full type safety
//   without duplicating the shape definition.
//
//   Usage in controller:
//   const { email, password } = req.body as SignupInput;

import { z } from "zod";

// ─── Reusable password schema ─────────────────────────────────────────────────
// Defined once, reused in signup and reset password
// Changing password rules here updates both endpoints automatically
const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long") // bcrypt silently truncates above 72 chars
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

        // Generic — any business type
        // Restaurant, gym, salon, clinic, real estate, law firm — anything
        businessType: z
            .string()
            .min(2, "Business type must be at least 2 characters")
            .max(100, "Business type too long")
            .trim(),
    }),
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address").toLowerCase().trim(),
        password: z.string().min(1, "Password is required"),
        // Optional — if user belongs to multiple tenants, they select which one
        // If not provided and user has only one tenant, that tenant is auto-selected
        // If not provided and user has multiple tenants, return list for selection
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

// ─── Change password (authenticated user) ────────────────────────────────────
export const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: passwordSchema,
    }),
});

// ─── Inferred TypeScript types ────────────────────────────────────────────────
// Export types so controllers have full type safety without redefining shapes
// Usage: const { email, password, businessName } = req.body as SignupInput;
export type SignupInput = z.infer<typeof signupSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
