/**
 * Typed shape of the `public` schema, matching supabase/migrations.
 *
 * Structured exactly like the output of `supabase gen types typescript`, so it
 * can be regenerated in place once the migrations are applied:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > src/lib/supabase/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "manager" | "member";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type AttachmentKind = "file" | "link";

export type ReminderChannel = "email" | "telegram" | "whatsapp";
export type ReminderKind = "assigned" | "due_soon" | "overdue" | "follow_up";
export type ReminderStatus = "pending" | "sent" | "failed" | "cancelled";

/** `notifications.type` — stored as text with a check constraint. */
export type NotificationType =
  | "task_assigned"
  | "task_unassigned"
  | "task_commented"
  | "task_mentioned"
  | "task_review_requested"
  | "task_completed";

/** `task_activity.action` — stored as text with a check constraint. */
export type TaskActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "priority_changed"
  | "due_date_changed"
  | "follow_up_set"
  | "follow_up_cleared"
  | "assignee_added"
  | "assignee_removed"
  | "commented";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          /** Job position, assigned by an admin. */
          job_title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          job_title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          job_title?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          /** NULL marks a general task, belonging to no project. */
          project_id: string | null;
          title: string;
          description: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          /** Absolute instant, including time of day. */
          due_at: string | null;
          /** When this task should next be chased. */
          follow_up_at: string | null;
          follow_up_note: string | null;
          position: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          title: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          due_at?: string | null;
          follow_up_at?: string | null;
          follow_up_note?: string | null;
          position?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          due_at?: string | null;
          follow_up_at?: string | null;
          follow_up_note?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_assignments: {
        Row: {
          task_id: string;
          user_id: string;
          assigned_at: string;
        };
        Insert: {
          task_id: string;
          user_id: string;
          assigned_at?: string;
        };
        Update: {
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          task_id: string;
          user_id: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Append-only audit trail. Written by database triggers only. */
      task_activity: {
        Row: {
          id: string;
          task_id: string;
          actor_id: string | null;
          action: TaskActivityAction;
          field: string | null;
          old_value: string | null;
          new_value: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_activity_actor_id_fkey";
            columns: ["actor_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Who can see a project. Membership is the unit of project visibility. */
      project_members: {
        Row: {
          project_id: string;
          user_id: string;
          added_by: string | null;
          added_at: string;
        };
        Insert: {
          project_id: string;
          user_id: string;
          added_by?: string | null;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Per-user reminder channel settings. One row per profile. */
      notification_preferences: {
        Row: {
          user_id: string;
          email_enabled: boolean;
          telegram_enabled: boolean;
          whatsapp_enabled: boolean;
          telegram_chat_id: string | null;
          whatsapp_number: string | null;
          telegram_link_code: string | null;
          remind_assigned: boolean;
          remind_due_soon: boolean;
          remind_overdue: boolean;
          remind_follow_up: boolean;
          due_soon_lead_hours: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string };
        Update: {
          email_enabled?: boolean;
          telegram_enabled?: boolean;
          whatsapp_enabled?: boolean;
          telegram_chat_id?: string | null;
          whatsapp_number?: string | null;
          telegram_link_code?: string | null;
          remind_assigned?: boolean;
          remind_due_soon?: boolean;
          remind_overdue?: boolean;
          remind_follow_up?: boolean;
          due_soon_lead_hours?: number;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Outbound reminders. Written by the scheduler, drained by the dispatcher. */
      reminder_queue: {
        Row: {
          id: string;
          user_id: string;
          task_id: string | null;
          channel: ReminderChannel;
          kind: ReminderKind;
          recipient: string;
          subject: string | null;
          body: string;
          status: ReminderStatus;
          attempts: number;
          last_error: string | null;
          dedupe_key: string;
          scheduled_for: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: {
          status?: ReminderStatus;
          attempts?: number;
          last_error?: string | null;
          sent_at?: string | null;
          scheduled_for?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_queue_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_attachments: {
        Row: {
          id: string;
          task_id: string;
          uploaded_by: string | null;
          kind: AttachmentKind;
          name: string;
          storage_path: string | null;
          url: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          uploaded_by: string;
          kind: AttachmentKind;
          name: string;
          storage_path?: string | null;
          url?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Private to each recipient. Rows are written only by database triggers. */
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          type: NotificationType;
          title: string;
          body: string | null;
          task_id: string | null;
          project_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: { read_at?: string | null };
        Relationships: [
          {
            foreignKeyName: "notifications_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      personal_notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          body?: string;
          pinned?: boolean;
        };
        Update: {
          title?: string;
          body?: string;
          pinned?: boolean;
        };
        Relationships: [];
      };
      personal_note_items: {
        Row: {
          id: string;
          note_id: string;
          user_id: string;
          content: string;
          done: boolean;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          note_id: string;
          user_id: string;
          content?: string;
          done?: boolean;
          position?: number;
        };
        Update: {
          content?: string;
          done?: boolean;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "personal_note_items_note_id_fkey";
            columns: ["note_id"];
            referencedRelation: "personal_notes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      current_user_role: { Args: Record<never, never>; Returns: UserRole };
      is_admin: { Args: Record<never, never>; Returns: boolean };
      is_manager_or_admin: { Args: Record<never, never>; Returns: boolean };
      can_edit_task: { Args: { task: string }; Returns: boolean };
      can_view_project: { Args: { project: string }; Returns: boolean };
      can_view_task: { Args: { task: string }; Returns: boolean };
      enqueue_task_reminders: { Args: Record<never, never>; Returns: number };
    };
    Enums: {
      user_role: UserRole;
      task_status: TaskStatus;
      task_priority: TaskPriority;
    };
    CompositeTypes: Record<never, never>;
  };
};

/** Convenience row aliases used throughout the app. */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskAssignment =
  Database["public"]["Tables"]["task_assignments"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type TaskActivity = Database["public"]["Tables"]["task_activity"]["Row"];
export type TaskAttachment =
  Database["public"]["Tables"]["task_attachments"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type ProjectMember =
  Database["public"]["Tables"]["project_members"]["Row"];
export type NotificationPreferences =
  Database["public"]["Tables"]["notification_preferences"]["Row"];
export type ReminderQueueRow =
  Database["public"]["Tables"]["reminder_queue"]["Row"];

export type PersonalNote =
  Database["public"]["Tables"]["personal_notes"]["Row"];
export type PersonalNoteItem =
  Database["public"]["Tables"]["personal_note_items"]["Row"];

/** A note with its checklist, in display order. */
export type NoteWithItems = PersonalNote & { items: PersonalNoteItem[] };

/** A notification joined with the person who caused it. */
export type NotificationWithActor = Notification & { actor: Profile | null };

/** A task joined with the profiles assigned to it. */
export type TaskWithAssignees = Task & { assignees: Profile[] };

/** A comment joined with its author (null when the account was removed). */
export type CommentWithAuthor = Comment & { author: Profile | null };

/** An activity row joined with the profile that caused it. */
export type TaskActivityWithActor = TaskActivity & { actor: Profile | null };
