import { signOutAction } from "@/app/actions/auth";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { WidgetSettingsForm } from "./widget-settings-form";
import { KnowledgeSection, type KnowledgeDocumentItem } from "./knowledge-section";

interface WidgetSettingsRow {
  brand_name: string;
  brand_color: string;
  welcome_message: string;
  logo_url: string | null;
  position: string;
}

export default async function DashboardPage() {
  const { user, workspace, membership } = await requireWorkspace();

  const supabase = await createClient();
  const [{ data: settingsData }, { data: documentsData }] = await Promise.all([
    supabase
      .from("widget_settings")
      .select("brand_name, brand_color, welcome_message, logo_url, position")
      .eq("workspace_id", workspace.id)
      .single(),
    supabase
      .from("documents")
      .select("id, title, content, source_type, status, file_size_bytes, created_at, updated_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
  ]);

  const settings: WidgetSettingsRow = settingsData || {
    brand_name: workspace.name,
    brand_color: "#0F172A",
    welcome_message: "Hi! How can we help you today?",
    logo_url: null,
    position: "bottom-right",
  };

  const documents: KnowledgeDocumentItem[] = (documentsData as KnowledgeDocumentItem[]) || [];
  const isReadOnly = membership.role === "member";

  return (
    <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Top Navigation / Header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
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
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Sign out
            </button>
          </form>
        </div>

        {/* Workspace Details Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Workspace Identifier
            </span>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {workspace.slug}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Unique URL slug for this organization
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Public Widget Key
            </span>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {workspace.public_widget_key}
              </code>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Client key for public widget resolution
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Workspace Created
            </span>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {new Date(workspace.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Tenant database isolation active
            </p>
          </div>
        </div>

        {/* Widget Settings & Configuration Form */}
        <WidgetSettingsForm
          initialSettings={settings}
          isReadOnly={isReadOnly}
          publicWidgetKey={workspace.public_widget_key}
        />

        {/* Workspace Knowledge Management Section */}
        <KnowledgeSection
          documents={documents}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
