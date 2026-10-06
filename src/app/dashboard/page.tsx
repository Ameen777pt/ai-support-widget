import { signOutAction } from "@/app/actions/auth";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { WidgetSettingsForm } from "./widget-settings-form";
import { KnowledgeSection, type KnowledgeDocumentItem } from "./knowledge-section";
import { ConversationsInbox, type ConversationThreadItem } from "./conversations-inbox";
import { UnansweredQuestionsSection, type UnansweredQuestionItem } from "./unanswered-questions";
import { DashboardNav, type DashboardView } from "./dashboard-nav";
import { OverviewSection } from "./overview-section";

interface WidgetSettingsRow {
  brand_name: string;
  brand_color: string;
  welcome_message: string;
  logo_url: string | null;
  position: string;
  launcher_text: string;
  suggested_questions: string[];
}

interface DashboardPageProps {
  searchParams?: Promise<{ view?: string; conversationId?: string }>;
}

export default async function DashboardPage(props: DashboardPageProps) {
  const { user, workspace, membership } = await requireWorkspace();
  const resolvedParams = props.searchParams ? await props.searchParams : {};

  const validViews: DashboardView[] = ["overview", "inbox", "knowledge", "gaps", "widget"];
  const rawView = resolvedParams?.view;
  const activeView: DashboardView = (
    typeof rawView === "string" && (validViews as string[]).includes(rawView)
      ? rawView
      : "overview"
  ) as DashboardView;

  const activeConversationId =
    typeof resolvedParams?.conversationId === "string"
      ? resolvedParams.conversationId
      : undefined;

  const supabase = await createClient();
  const [
    { data: settingsData },
    { data: documentsData },
    { data: conversationsData },
    { data: unansweredData },
  ] = await Promise.all([
    supabase
      .from("widget_settings")
      .select("brand_name, brand_color, welcome_message, logo_url, position, launcher_text, suggested_questions")
      .eq("workspace_id", workspace.id)
      .single(),
    supabase
      .from("documents")
      .select("id, title, content, source_type, status, file_size_bytes, created_at, updated_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select(`
        id,
        visitor_id,
        customer_name,
        customer_email,
        status,
        last_message_at,
        created_at,
        updated_at,
        messages (
          id,
          conversation_id,
          sender_type,
          sender_id,
          content,
          tokens_prompt,
          tokens_completion,
          latency_ms,
          created_at
        ),
        escalations (
          id,
          reason,
          status,
          assigned_to,
          customer_email,
          notes,
          resolved_at,
          created_at,
          updated_at
        )
      `)
      .eq("workspace_id", workspace.id)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("unanswered_questions")
      .select(`
        id,
        workspace_id,
        question_text,
        normalized_query,
        occurrence_count,
        sample_conversation_id,
        status,
        resolved_by_document_id,
        resolved_by,
        resolved_at,
        first_seen_at,
        last_seen_at,
        created_at,
        updated_at,
        resolved_document:documents!unanswered_questions_resolved_by_document_id_fkey (
          id,
          title
        )
      `)
      .eq("workspace_id", workspace.id)
      .order("occurrence_count", { ascending: false })
      .order("last_seen_at", { ascending: false }),
  ]);

  const settings: WidgetSettingsRow = settingsData || {
    brand_name: workspace.name,
    brand_color: "#0F172A",
    welcome_message: "Hi! How can we help you today?",
    logo_url: null,
    position: "bottom-right",
    launcher_text: "",
    suggested_questions: [],
  };

  const documents: KnowledgeDocumentItem[] = (documentsData as KnowledgeDocumentItem[]) || [];
  const conversations: ConversationThreadItem[] = (conversationsData as unknown as ConversationThreadItem[]) || [];
  const unansweredQuestions: UnansweredQuestionItem[] = (unansweredData as unknown as UnansweredQuestionItem[]) || [];
  const isReadOnly = membership.role === "member";

  const escalatedCount = conversations.filter((c) => c.status === "escalated").length;
  const openGapsCount = unansweredQuestions.filter((q) => q.status === "open").length;

  return (
    <div className="min-h-screen bg-zinc-50 p-4 sm:p-6 lg:p-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
        {/* Top Header */}
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {workspace.name}
              </h1>
              <span className="inline-flex items-center rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 capitalize dark:bg-zinc-800 dark:text-zinc-300">
                Role: {membership.role}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Logged in as <span className="font-medium text-zinc-700 dark:text-zinc-300">{user.email}</span>
            </p>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 min-h-[40px]"
            >
              Sign out
            </button>
          </form>
        </header>

        {/* Dashboard Navigation */}
        <DashboardNav
          activeView={activeView}
          escalatedCount={escalatedCount}
          openGapsCount={openGapsCount}
        />

        {/* Active View Content */}
        {activeView === "overview" && (
          <OverviewSection
            workspace={workspace}
            membership={membership}
            conversations={conversations}
            documents={documents}
            unansweredQuestions={unansweredQuestions}
            settings={settings}
          />
        )}

        {activeView === "inbox" && (
          <div id="conversations-inbox">
            <ConversationsInbox
              key={activeConversationId || "inbox-default"}
              conversations={conversations}
              currentUserId={user.id}
              initialConversationId={activeConversationId}
            />
          </div>
        )}

        {activeView === "knowledge" && (
          <KnowledgeSection
            documents={documents}
            isReadOnly={isReadOnly}
          />
        )}

        {activeView === "gaps" && (
          <UnansweredQuestionsSection
            questions={unansweredQuestions}
            documents={documents}
            isReadOnly={isReadOnly}
          />
        )}

        {activeView === "widget" && (
          <WidgetSettingsForm
            initialSettings={settings}
            isReadOnly={isReadOnly}
            publicWidgetKey={workspace.public_widget_key}
          />
        )}
      </div>
    </div>
  );
}
