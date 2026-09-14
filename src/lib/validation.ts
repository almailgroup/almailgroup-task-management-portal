import { z } from "zod";

/** Shared input schemas. Used by both server actions and client-side forms. */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "validation.emailRequired")
  .email("validation.emailInvalid");

export const passwordSchema = z
  .string()
  .min(8, "validation.passwordMin")
  .max(72, "validation.passwordMax");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "validation.passwordRequired"),
});

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "validation.enterFullName")
    .max(120, "validation.nameMax"),
  email: emailSchema,
  password: passwordSchema,
});

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "validation.enterFullName")
    .max(120, "validation.nameMax"),
  avatarUrl: z
    .union([z.string().trim().url("validation.urlInvalid"), z.literal("")])
    .optional(),
});

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "validation.projectNameRequired")
    .max(120, "validation.nameMax"),
  description: z
    .string()
    .trim()
    .max(2000, "validation.descriptionMax2000")
    .optional(),
});

export const userRoleSchema = z.enum(["admin", "manager", "member"]);

/** A job position: any text up to 60 characters, or empty to clear it. */
export const positionSchema = z
  .string()
  .trim()
  .max(60, "validation.positionMax");

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
    .min(1, "validation.titleRequired")
    .max(200, "validation.titleMax"),
  description: z
    .string()
    .trim()
    .max(20000, "validation.descriptionTooLong")
    .optional(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  /**
   * An absolute instant, e.g. "2026-09-15T13:30:00.000Z".
   *
   * Deliberately NOT the raw "2026-09-15T17:30" an <input type="datetime-local">
   * produces: that is wall-clock time with no offset, and parsing it here would
   * read it in the server's timezone rather than the viewer's. The browser
   * converts it with isoFromLocalInput before submitting. An empty string is
   * how a cleared date arrives.
   */
  dueAt: z
    .union([
      z.string().datetime({ offset: true, message: "validation.dateTimeInvalid" }),
      z.literal(""),
    ])
    .optional(),
  assigneeIds: z.array(z.string().uuid()).default([]),
});

export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "validation.commentRequired")
    .max(5000, "validation.commentMax"),
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
    .min(1, "validation.linkName")
    .max(255, "validation.nameMax255"),
  url: z
    .string()
    .trim()
    .min(1, "validation.urlRequired")
    .max(2048, "validation.urlTooLong")
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "validation.urlScheme",
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

/** A follow-up: when to chase a task, and optionally what to chase. */
export const followUpSchema = z.object({
  /** An absolute instant, converted in the browser. See taskSchema.dueAt. */
  followUpAt: z
    .string()
    .datetime({ offset: true, message: "validation.pickDateTime" }),
  note: z
    .string()
    .trim()
    .max(500, "validation.noteMax")
    .optional(),
});

export type FollowUpInput = z.infer<typeof followUpSchema>;
