import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type User } from "@supabase/supabase-js";
import { type WorkspaceRole } from "@/types/database.types";

export interface WorkspaceContext {
  user: User;
  workspace: {
    id: string;
    name: string;
    slug: string;
    public_widget_key: string;
    created_at: string;
    updated_at: string;
  };
  membership: {
    id: string;
    role: WorkspaceRole;
    created_at: string;
  };
}

interface RawWorkspaceMembership {
  id: string;
  role: WorkspaceRole;
  created_at: string;
  workspace_id: string;
  workspaces: {
    id: string;
    name: string;
    slug: string;
    public_widget_key: string;
    created_at: string;
    updated_at: string;
  } | null;
}

/**
 * Resolves the primary active workspace for the currently authenticated user.
 * Returns null if the user is unauthenticated or has no workspace.
 * Deduplicated per request lifecycle via React.cache().
 */
export const getCurrentWorkspace = cache(async (): Promise<WorkspaceContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: memberRecords, error: memberError } = await supabase
    .from("workspace_members")
    .select("id, role, created_at, workspace_id, workspaces(id, name, slug, public_widget_key, created_at, updated_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (memberError || !memberRecords || memberRecords.length === 0) {
    return null;
  }

  const membershipRecord = memberRecords[0] as unknown as RawWorkspaceMembership;
  if (!membershipRecord.workspaces) {
    return null;
  }

  return {
    user,
    workspace: membershipRecord.workspaces,
    membership: {
      id: membershipRecord.id,
      role: membershipRecord.role,
      created_at: membershipRecord.created_at,
    },
  };
});

/**
 * Requires an authenticated user with an active workspace.
 * - Redirects unauthenticated users to /login.
 * - Redirects users without a workspace to /onboarding.
 * - Returns a guaranteed non-null WorkspaceContext.
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const context = await getCurrentWorkspace();
  if (!context) {
    redirect("/onboarding");
  }

  return context;
}
