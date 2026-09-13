import { z } from "zod";

/** Shared input schemas. Used by both server actions and client-side forms. */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(120, "Name must be 120 characters or fewer"),
  email: emailSchema,
  password: passwordSchema,
});

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(120, "Name must be 120 characters or fewer"),
  avatarUrl: z
    .union([z.string().trim().url("Enter a valid URL"), z.literal("")])
    .optional(),
});

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(120, "Name must be 120 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be 2000 characters or fewer")
    .optional(),
});

export const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "in_review",
  "done",
]);

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(20000, "Description is too long")
    .optional(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  // Empty string is how an unset <input type="date"> arrives from a form.
  dueDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"), z.literal("")])
    .optional(),
  assigneeIds: z.array(z.string().uuid()).default([]),
});

export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(5000, "Comment must be 5000 characters or fewer"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
