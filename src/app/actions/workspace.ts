"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface WorkspaceActionState {
  error: string | null;
  success?: boolean;
}

export async function createWorkspaceAction(
  _prevState: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const name = (formData.get("name") as string | null)?.trim();
  const slug = (formData.get("slug") as string | null)?.trim() || null;

  if (!name || name.length < 2) {
    return { error: "Workspace name must be at least 2 characters long." };
  }

  if (name.length > 60) {
    return { error: "Workspace name must be 60 characters or fewer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("create_workspace_for_user", {
    p_name: name,
    p_slug: slug,
  });

  if (error) {
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    return { error: "Failed to provision workspace. Please try again." };
  }

  redirect("/dashboard");
}
