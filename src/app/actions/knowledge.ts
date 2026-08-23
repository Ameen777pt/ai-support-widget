"use server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface KnowledgeActionState {
  error: string | null;
  message?: string | null;
  success?: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createKnowledgeDocAction(
  _prevState: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  const { user, workspace, membership } = await requireWorkspace();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return {
      error: "Forbidden: Only workspace owners and admins can create knowledge entries.",
      success: false,
    };
  }

  const title = (formData.get("title") as string | null)?.trim();
  const content = (formData.get("content") as string | null)?.trim();

  // Validate Title
  if (!title || title.length < 2 || title.length > 150) {
    return {
      error: "Title must be between 2 and 150 characters.",
      success: false,
    };
  }

  // Validate Content
  if (!content || content.length < 10 || content.length > 20000) {
    return {
      error: "Content must be between 10 and 20,000 characters.",
      success: false,
    };
  }

  const fileSizeBytes = Buffer.byteLength(content, "utf8");

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("documents").insert({
    workspace_id: workspace.id,
    title,
    content,
    source_type: "raw_text",
    status: "ready",
    mime_type: "text/plain",
    file_size_bytes: fileSizeBytes,
    created_by: user.id,
  });

  if (insertError) {
    return {
      error: `Failed to create knowledge entry: ${insertError.message}`,
      success: false,
    };
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    message: "Knowledge entry created successfully.",
    success: true,
  };
}

export async function updateKnowledgeDocAction(
  _prevState: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  const { workspace, membership } = await requireWorkspace();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return {
      error: "Forbidden: Only workspace owners and admins can edit knowledge entries.",
      success: false,
    };
  }

  const documentId = (formData.get("document_id") as string | null)?.trim();
  const title = (formData.get("title") as string | null)?.trim();
  const content = (formData.get("content") as string | null)?.trim();

  // Validate Document ID
  if (!documentId || !UUID_REGEX.test(documentId)) {
    return {
      error: "Invalid document identifier.",
      success: false,
    };
  }

  // Validate Title
  if (!title || title.length < 2 || title.length > 150) {
    return {
      error: "Title must be between 2 and 150 characters.",
      success: false,
    };
  }

  // Validate Content
  if (!content || content.length < 10 || content.length > 20000) {
    return {
      error: "Content must be between 10 and 20,000 characters.",
      success: false,
    };
  }

  const fileSizeBytes = Buffer.byteLength(content, "utf8");

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("documents")
    .update({
      title,
      content,
      file_size_bytes: fileSizeBytes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return {
      error: `Failed to update knowledge entry: ${updateError.message}`,
      success: false,
    };
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    message: "Knowledge entry updated successfully.",
    success: true,
  };
}

export async function deleteKnowledgeDocAction(
  _prevState: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  const { workspace, membership } = await requireWorkspace();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return {
      error: "Forbidden: Only workspace owners and admins can delete knowledge entries.",
      success: false,
    };
  }

  const documentId = (formData.get("document_id") as string | null)?.trim();

  // Validate Document ID
  if (!documentId || !UUID_REGEX.test(documentId)) {
    return {
      error: "Invalid document identifier.",
      success: false,
    };
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("workspace_id", workspace.id);

  if (deleteError) {
    return {
      error: `Failed to delete knowledge entry: ${deleteError.message}`,
      success: false,
    };
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    message: "Knowledge entry deleted successfully.",
    success: true,
  };
}
