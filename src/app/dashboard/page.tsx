import { signOutAction } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  public_widget_key: string;
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // Fetch the user's primary workspace membership
  const { data: memberRecords, error: memberError } = await supabase
    .from("workspace_members")
    .select("role, workspace_id, workspaces(id, name, slug, public_widget_key, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (memberError || !memberRecords || memberRecords.length === 0) {
    redirect("/onboarding");
  }

  const primaryMembership = memberRecords[0];
  const workspace = primaryMembership.workspaces as unknown as WorkspaceInfo;
  const userRole = primaryMembership.role;

  if (!workspace) {
    redirect("/onboarding");
  }

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
                Role: {userRole}
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
              Client key for embedding the chat widget
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

        {/* Status Callout */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500"></div>
            <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              Workspace Provisioning Active (Day 3B.1)
            </h2>
          </div>
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
            Your workspace has been initialized with owner permissions, unique slug constraints, and default widget settings.
          </p>
        </div>
      </div>
    </div>
  );
}
