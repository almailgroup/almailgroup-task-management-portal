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
/** The unit of a task's repeat rule. Null on the column means "once". */
export type RepeatUnit = "day" | "week" | "month" | "year";

export type AttachmentKind = "file" | "link";

export type ReminderChannel = "email" | "telegram" | "whatsapp";
export type ReminderKind = "assigned" | "due_soon" | "overdue" | "follow_up";
export type ReminderStatus =
  | "pending"
  /** Claimed by a dispatcher run and being delivered right now. */
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

/** `notifications.type` — stored as text with a check constraint. */
export type NotificationType =
  | "task_assigned"
  | "task_unassigned"
  | "task_commented"
  | "task_mentioned"
  | "task_review_requested"
  | "task_completed"
  | "direct_message";

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
  | "commented"
  | "deleted"
  | "restored";

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
          /** Set when trashed; cleared on restore. Hidden from every read. */
          deleted_at: string | null;
          /**
           * The repeat rule, or null for work that happens once. Closing a
           * repeating task opens the next one and takes the rule with it, so
           * a closed task never carries one.
           */
          repeat_every: RepeatUnit | null;
          /** How many of those units apart. 2 + "week" is fortnightly. */
          repeat_interval: number;
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
          repeat_every?: RepeatUnit | null;
          repeat_interval?: number;
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
          repeat_every?: RepeatUnit | null;
          repeat_interval?: number;
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
      team_messages: {
        Row: {
          id: string;
          author_id: string;
          body: string;
          created_at: string;
          edited_at: string | null;
        };
        Insert: {
          id?: string;
          author_id: string;
          body: string;
          created_at?: string;
          edited_at?: string | null;
        };
        Update: {
          body?: string;
          edited_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_messages_author_id_fkey";
            columns: ["author_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          created_at: string;
          last_message_at: string;
          member_low: string | null;
          member_high: string | null;
        };
        /** Opened through `start_direct_conversation`, never inserted directly. */
        Insert: never;
        Update: never;
        Relationships: [
          // Both point at profiles, which is exactly the ambiguity an embed
          // hint exists to resolve — declared so the check can see them.
          {
            foreignKeyName: "conversations_member_low_fkey";
            columns: ["member_low"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_member_high_fkey";
            columns: ["member_high"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          user_id: string;
          last_read_at: string;
        };
        Insert: never;
        Update: { last_read_at?: string };
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      direct_messages: {
        Row: {
          id: string;
          conversation_id: string;
          author_id: string;
          body: string;
          created_at: string;
          edited_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          author_id: string;
          body: string;
          created_at?: string;
          edited_at?: string | null;
        };
        Update: {
          body?: string;
          edited_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "direct_messages_author_id_fkey";
            columns: ["author_id"];
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
          // The second route to profiles. Declaring it is what tells a reader
          // — and `supabase gen types` — that an embed here must name its key.
          {
            foreignKeyName: "project_members_added_by_fkey";
            columns: ["added_by"];
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
          claimed_at: string | null;
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
          claimed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_queue_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminder_queue_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
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
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            referencedRelation: "profiles";
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
          conversation_id: string | null;
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
          {
            foreignKeyName: "notifications_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          // Recipient and actor are both profiles, hence the hint in the query.
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            referencedRelation: "profiles";
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
        Relationships: [
          {
            foreignKeyName: "personal_notes_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Who a personal list has been shared with. */
      personal_note_shares: {
        Row: {
          note_id: string;
          user_id: string;
          added_by: string | null;
          added_at: string;
        };
        Insert: {
          note_id: string;
          user_id: string;
          added_by?: string | null;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "personal_note_shares_note_id_fkey";
            columns: ["note_id"];
            referencedRelation: "personal_notes";
            referencedColumns: ["id"];
          },
          // Two routes to profiles, so an embed here has to name its key.
          {
            foreignKeyName: "personal_note_shares_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "personal_note_shares_added_by_fkey";
            columns: ["added_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
          {
            foreignKeyName: "personal_note_items_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
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
      can_view_note: { Args: { note: string }; Returns: boolean };
      owns_note: { Args: { note: string }; Returns: boolean };
      can_view_task: { Args: { task: string }; Returns: boolean };
      in_conversation: { Args: { conversation: string }; Returns: boolean };
      /** Finds the thread with somebody, or opens it. Returns its id. */
      start_direct_conversation: { Args: { other: string }; Returns: string };
      /** Every thread you are in, with its last line and unread count. */
      my_conversations: {
        Args: Record<never, never>;
        Returns: {
          id: string;
          last_message_at: string;
          other_id: string | null;
          other_name: string | null;
          other_email: string | null;
          other_avatar: string | null;
          other_title: string | null;
          last_message: string | null;
          last_author_id: string | null;
          unread: number;
        }[];
      };
      unread_direct_count: { Args: Record<never, never>; Returns: number };
      enqueue_task_reminders: { Args: Record<never, never>; Returns: number };
      /** Moves a batch of due reminders to 'sending' and returns them. */
      claim_reminders: {
        Args: { batch_size?: number };
        Returns: Database["public"]["Tables"]["reminder_queue"]["Row"][];
      };
      /** The same claim, narrowed to one task, for the assignment path. */
      claim_task_reminders: {
        Args: { task: string };
        Returns: Database["public"]["Tables"]["reminder_queue"]["Row"][];
      };
      /** Per-assignee open/done/overdue, counted in the database. */
      /** Soft delete: hides the task everywhere, keeps it for 30 days. */
      trash_task: { Args: { task: string }; Returns: boolean };
      restore_task: { Args: { task: string }; Returns: boolean };
      /** Hard-deletes tasks trashed longer ago than the interval. */
      purge_trashed_tasks: { Args: { older_than?: string }; Returns: number };
      workload_counts: {
        Args: Record<never, never>;
        Returns: {
          user_id: string;
          open: number;
          done: number;
          overdue: number;
        }[];
      };
      /**
       * Dashboard figures, counted in the database under the caller's RLS.
       * `tz` is an IANA timezone so "due today" means the viewer's day.
       */
      task_counts: {
        Args: { tz?: string };
        Returns: {
          total: number;
          done: number;
          todo: number;
          in_progress: number;
          in_review: number;
          overdue: number;
          due_today: number;
        }[];
      };
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

export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationParticipant =
  Database["public"]["Tables"]["conversation_participants"]["Row"];
export type DirectMessage =
  Database["public"]["Tables"]["direct_messages"]["Row"];

/** A message with whoever wrote it, which is what the thread renders. */
export type DirectMessageWithAuthor = DirectMessage & { author: Profile | null };

/**
 * The other person, as the conversation list needs them.
 *
 * Not a whole `Profile`: the list draws a name, a picture and a job title,
 * and asking the database for the rest of a profile per thread is work
 * nobody looks at.
 */
export type ConversationPeer = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
};

/**
 * A thread as the list shows it: who it is with, what was said last, and how
 * much of it you have not read.
 */
export type ConversationSummary = {
  id: string;
  lastMessageAt: string;
  /** The other person. Null only if their account has since been deleted. */
  other: ConversationPeer | null;
  lastMessage: string | null;
  lastAuthorId: string | null;
  unread: number;
};

export type PersonalNote =
  Database["public"]["Tables"]["personal_notes"]["Row"];
export type PersonalNoteItem =
  Database["public"]["Tables"]["personal_note_items"]["Row"];

/** A note with its checklist, in display order. */
export type PersonalNoteShare =
  Database["public"]["Tables"]["personal_note_shares"]["Row"];

/**
 * A list with everything the page shows: its lines, who owns it, and who else
 * is on it. `mine` saves every component re-deriving the same comparison.
 */
export type NoteWithItems = PersonalNote & {
  items: PersonalNoteItem[];
  owner: Profile | null;
  collaborators: Profile[];
  mine: boolean;
};

/** A notification joined with the person who caused it. */
export type NotificationWithActor = Notification & { actor: Profile | null };

/** A task joined with the profiles assigned to it. */
export type TaskWithAssignees = Task & { assignees: Profile[] };

/** A comment joined with its author (null when the account was removed). */
export type TeamMessage = Database["public"]["Tables"]["team_messages"]["Row"];

/** A message with whoever wrote it, which is how the room reads. */
export type TeamMessageWithAuthor = TeamMessage & { author: Profile | null };

export type CommentWithAuthor = Comment & { author: Profile | null };

/** An activity row joined with the profile that caused it. */
export type TaskActivityWithActor = TaskActivity & { actor: Profile | null };
