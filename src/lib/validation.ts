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

export const userRoleSchema = z.enum(["admin", "manager", "member"]);

/** A job position: any text up to 60 characters, or empty to clear it. */
export const positionSchema = z
  .string()
  .trim()
  .max(60, "Position must be 60 characters or fewer");

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
  /**
   * From <input type="datetime-local">, e.g. "2026-09-15T17:30". That value is
   * wall-clock time in the browser's timezone with no offset, so it is parsed
   * as local and transformed into an absolute instant for storage. An empty
   * string is how an unset input arrives.
   */
  dueAt: z
    .union([
      z
        .string()
        .regex(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
          "Enter a valid date and time",
        )
        .transform((value) => {
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            throw new Error("Invalid date");
          }
          return parsed.toISOString();
        }),
      z.literal(""),
    ])
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

/** A link attachment. Only http(s) is accepted, matching the DB constraint. */
export const linkAttachmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the link a name")
    .max(255, "Name must be 255 characters or fewer"),
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .max(2048, "That URL is too long")
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "Link must start with http:// or https://",
    ),
});

/** Metadata for a file already uploaded to storage by the browser client. */
export const fileAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  storagePath: z.string().trim().min(1).max(1024),
  mimeType: z.string().trim().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().max(26_214_400),
});

export type LinkAttachmentInput = z.infer<typeof linkAttachmentSchema>;
export type FileAttachmentInput = z.infer<typeof fileAttachmentSchema>;
