import Link from "next/link";
import { CopyKeyButton } from "./copy-key-button";
import type { ConversationThreadItem } from "./conversations-inbox";
import type { KnowledgeDocumentItem } from "./knowledge-section";
import type { UnansweredQuestionItem } from "./unanswered-questions";

interface WidgetSettingsData {
  brand_name: string;
  brand_color: string;
  welcome_message: string;
  logo_url: string | null;
  position: string;
  launcher_text: string;
  suggested_questions: string[];
}

interface OverviewSectionProps {
  workspace: {
    id: string;
    name: string;
    slug: string;
    public_widget_key: string;
    created_at: string;
  };
  membership: {
    role: string;
  };
  conversations: ConversationThreadItem[];
  documents: KnowledgeDocumentItem[];
  unansweredQuestions: UnansweredQuestionItem[];
  settings: WidgetSettingsData;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatVisitorId(id: string): string {
  if (id.startsWith("vis_") && id.length > 12) {
    return `Visitor ${id.slice(4, 12)}...`;
  }
  return id.length > 16 ? `${id.slice(0, 16)}...` : id;
}

export function OverviewSection({
  workspace,
  membership,
  conversations,
  documents,
  unansweredQuestions,
  settings,
}: OverviewSectionProps) {
  const escalatedConversations = conversations.filter((c) => c.status === "escalated");
  const openGaps = unansweredQuestions.filter((q) => q.status === "open");

  // Priority conversations: escalated first, then active
  const priorityConversations = [
    ...escalatedConversations,
    ...conversations.filter((c) => c.status === "active"),
  ].slice(0, 3);

  // Recent open gaps
  const priorityGaps = openGaps.slice(0, 3);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Lightweight Operational KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
        {/* KPI 1: Escalated Conversations */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Open Escalations
              </span>
              {escalatedConversations.length > 0 && (
                <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {escalatedConversations.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {escalatedConversations.length === 1
                ? "Thread requiring human takeover"
                : "Threads requiring human takeover"}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/dashboard?view=inbox"
              scroll={false}
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-700 dark:text-zinc-200 dark:hover:text-white"
            >
              <span>Go to Inbox</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* KPI 2: Knowledge Gaps */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Knowledge Gaps
              </span>
              {openGaps.length > 0 && (
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {openGaps.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {openGaps.length === 1
                ? "Unanswered customer query detected"
                : "Unanswered customer queries detected"}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/dashboard?view=gaps"
              scroll={false}
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-700 dark:text-zinc-200 dark:hover:text-white"
            >
              <span>Review Gaps</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* KPI 3: Knowledge Base */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Knowledge Documents
            </span>
            <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {documents.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {documents.length === 1
                ? "Active published article"
                : "Active published articles"}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/dashboard?view=knowledge"
              scroll={false}
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-700 dark:text-zinc-200 dark:hover:text-white"
            >
              <span>Manage Knowledge</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* KPI 4: Widget Status */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Widget Status
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span
                style={{ backgroundColor: settings.brand_color || "#0F172A" }}
                className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/10"
              />
              <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {settings.brand_name || workspace.name}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Position: {settings.position} • {settings.suggested_questions?.length || 0} prompts
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/dashboard?view=widget"
              scroll={false}
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-700 dark:text-zinc-200 dark:hover:text-white"
            >
              <span>Configure Widget</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Workspace Identity & Metadata Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Workspace Identifier
          </span>
          <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {workspace.slug}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Unique URL slug for this organization
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Public Widget Key
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 break-all">
              {workspace.public_widget_key}
            </code>
            <CopyKeyButton value={workspace.public_widget_key} />
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Client key for public widget resolution
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Workspace Created
          </span>
          <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {formatDate(workspace.created_at)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Tenant database isolation active • Role: {membership.role}
          </p>
        </div>
      </div>

      {/* High-Priority Attention Queues */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Urgent / Active Conversations */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Priority Conversations
              </h3>
              {escalatedConversations.length > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {escalatedConversations.length} Needs Attention
                </span>
              )}
            </div>
            <Link
              href="/dashboard?view=inbox"
              scroll={false}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              View all →
            </Link>
          </div>

          <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {priorityConversations.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
                No active or escalated conversations at this time.
              </p>
            ) : (
              priorityConversations.map((conv) => {
                const lastMsg = conv.messages?.[conv.messages.length - 1];
                const isEsc = conv.status === "escalated";

                return (
                  <Link
                    key={conv.id}
                    href={`/dashboard?view=inbox&conversationId=${encodeURIComponent(conv.id)}`}
                    scroll={false}
                    className="flex flex-col gap-1 py-3 group hover:opacity-90"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-zinc-900 group-hover:underline dark:text-zinc-100">
                        {conv.customer_name || formatVisitorId(conv.visitor_id)}
                      </span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                          isEsc
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        }`}
                      >
                        {conv.status}
                      </span>
                    </div>
                    {lastMsg && (
                      <p className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {lastMsg.content}
                      </p>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Urgent Knowledge Gaps */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Recent Knowledge Gaps
              </h3>
              {openGaps.length > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  {openGaps.length} Open
                </span>
              )}
            </div>
            <Link
              href="/dashboard?view=gaps"
              scroll={false}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              View all →
            </Link>
          </div>

          <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {priorityGaps.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
                All customer questions are currently answered by your documentation.
              </p>
            ) : (
              priorityGaps.map((q) => (
                <Link
                  key={q.id}
                  href="/dashboard?view=gaps"
                  scroll={false}
                  className="flex flex-col gap-1 py-3 group hover:opacity-90"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-semibold text-zinc-900 group-hover:underline dark:text-zinc-100">
                      &ldquo;{q.question_text}&rdquo;
                    </span>
                    <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      Asked {q.occurrence_count}×
                    </span>
                  </div>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
                    Draft response with AI →
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
