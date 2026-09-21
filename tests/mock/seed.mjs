/**
 * The workspace the end-to-end specs run against.
 *
 * Six people, six projects and a month of tasks around a fixed "today", so a
 * spec can say "the overdue list holds three" and still be true next year.
 * Nothing here is real: the names are the ones the screenshots in the README
 * use, and every id is a literal so a failing assertion names something a
 * person can find.
 */

export const IDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  sara: "00000000-0000-4000-8000-000000000002",
  omar: "00000000-0000-4000-8000-000000000003",
  priya: "00000000-0000-4000-8000-000000000004",
  yusuf: "00000000-0000-4000-8000-000000000005",
  lina: "00000000-0000-4000-8000-000000000006",
};

/** The instant the seeded board is built around. */
export const NOW = "2026-09-21T09:00:00.000Z";

const person = (id, name, email, role, title) => ({
  id,
  email,
  full_name: name,
  role,
  avatar_url: null,
  job_title: title,
  telegram_chat_id: null,
  whatsapp_number: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const day = (offsetDays, hour = 13) => {
  const base = new Date(NOW);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hour, 0, 0, 0);
  return base.toISOString();
};

export function seed() {
  const profiles = [
    person(IDS.admin, "Admin", "admin@almailgroup.com", "admin", "Director"),
    person(IDS.sara, "Sara Khan", "sara@almailgroup.com", "manager", "Operations Manager"),
    person(IDS.omar, "Omar Haddad", "omar@almailgroup.com", "member", "Accountant"),
    person(IDS.priya, "Priya Nair", "priya@almailgroup.com", "member", "Designer"),
    person(IDS.yusuf, "Yusuf Rahman", "yusuf@almailgroup.com", "member", "Logistics"),
    person(IDS.lina, "Lina Aboud", "lina@almailgroup.com", "member", "Marketing"),
  ];

  const projects = [
    { id: "11111111-1111-4111-8111-000000000001", name: "Kuwait Bank Portal", description: "Corporate banking rollout." },
    { id: "11111111-1111-4111-8111-000000000002", name: "Warehouse Move", description: "Shuwaikh to Sulaibiya." },
    { id: "11111111-1111-4111-8111-000000000003", name: "Brand Refresh", description: "Signage, cards, site." },
  ].map((p) => ({
    ...p,
    colour: null,
    created_by: IDS.admin,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  }));

  /** [title, status, priority, project index, due offset in days, assignee] */
  const shape = [
    ["Sign the custody agreement", "todo", "urgent", 0, -3, IDS.sara],
    ["Chase the QR code artwork", "in_progress", "high", 2, -1, IDS.priya],
    ["Reconcile August freight", "todo", "medium", 1, -2, IDS.omar],
    ["Meet with Kuwait banks", "todo", "high", 0, 0, IDS.admin],
    ["Container MSKU4471 clearance", "in_progress", "urgent", 1, 0, IDS.yusuf],
    ["Draft the September invoice", "in_review", "medium", 1, 0, IDS.omar],
    ["Camera installation", "todo", "low", 1, 3, IDS.yusuf],
    ["New letterhead proof", "in_review", "medium", 2, 5, IDS.priya],
    ["Staff parking list", "todo", "low", 1, 9, IDS.lina],
    ["Quarterly board pack", "done", "high", 0, -8, IDS.sara],
    ["Archive 2025 contracts", "done", "low", 0, -14, IDS.omar],
    ["Website copy review", "todo", "medium", 2, null, IDS.lina],
  ];

  const tasks = [];
  const task_assignments = [];
  shape.forEach(([title, status, priority, projectIndex, due, assignee], index) => {
    const id = `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`;
    tasks.push({
      id,
      title,
      description: null,
      status,
      priority,
      project_id: projects[projectIndex].id,
      created_by: IDS.admin,
      due_at: due === null ? null : day(due),
      follow_up_at: null,
      position: index,
      deleted_at: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    });
    task_assignments.push({
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
      task_id: id,
      user_id: assignee,
      created_at: "2026-09-01T00:00:00Z",
    });
  });

  const team_messages = [
    { id: "44444444-4444-4444-8444-000000000001", author_id: IDS.sara, body: "Morning all — the Kuwait bank meeting moved to 3pm.", created_at: "2026-09-20T06:10:00Z", edited_at: null },
    { id: "44444444-4444-4444-8444-000000000002", author_id: IDS.omar, body: "Noted. The September numbers are in the sheet.", created_at: "2026-09-20T06:26:00Z", edited_at: null },
    { id: "44444444-4444-4444-8444-000000000003", author_id: IDS.admin, body: "I will take the QR code task this evening.", created_at: "2026-09-20T12:40:00Z", edited_at: null },
  ];

  const conversations = [
    {
      id: "55555555-5555-4555-8555-000000000001",
      member_low: IDS.admin < IDS.sara ? IDS.admin : IDS.sara,
      member_high: IDS.admin < IDS.sara ? IDS.sara : IDS.admin,
      created_at: "2026-09-19T08:00:00Z",
      last_message_at: "2026-09-20T15:30:00Z",
    },
  ];

  const conversation_participants = [
    { conversation_id: conversations[0].id, user_id: IDS.admin, last_read_at: "2026-09-20T15:31:00Z" },
    { conversation_id: conversations[0].id, user_id: IDS.sara, last_read_at: "2026-09-20T15:31:00Z" },
  ];

  const direct_messages = [
    { id: "66666666-6666-4666-8666-000000000001", conversation_id: conversations[0].id, author_id: IDS.sara, body: "Can you approve the custody agreement today?", created_at: "2026-09-20T15:29:00Z", edited_at: null },
    { id: "66666666-6666-4666-8666-000000000002", conversation_id: conversations[0].id, author_id: IDS.admin, body: "Reading it now.", created_at: "2026-09-20T15:30:00Z", edited_at: null },
  ];

  return {
    profiles,
    projects,
    tasks,
    task_assignments,
    team_messages,
    conversations,
    conversation_participants,
    direct_messages,
    project_members: [],
    notifications: [],
    personal_notes: [],
    personal_note_items: [],
    personal_note_shares: [],
    comments: [],
    task_activity: [],
    task_attachments: [],
    notification_preferences: [],
    reminder_queue: [],
  };
}
