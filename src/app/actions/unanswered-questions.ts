"use server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UnansweredQuestionActionState {
  success: boolean;
  error?: string;
}

/**
 * Resolves an unanswered question by linking it to an existing workspace knowledge document.
 */
export async function resolveUnansweredQuestionAction(
  questionId: string,
  documentId: string,
): Promise<UnansweredQuestionActionState> {
  try {
    const { user, workspace } = await requireWorkspace();

    if (!questionId || !UUID_REGEX.test(questionId)) {
      return { success: false, error: "Valid unanswered question ID is required." };
    }

    if (!documentId || !UUID_REGEX.test(documentId)) {
      return { success: false, error: "Valid knowledge document ID is required." };
    }

    const supabase = await createClient();

    // 1. Verify the question belongs to the authenticated workspace
    const { data: question, error: qErr } = await supabase
      .from("unanswered_questions")
      .select("id, workspace_id")
      .eq("id", questionId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (qErr || !question) {
      return { success: false, error: "Unanswered question not found in this workspace." };
    }

    // 2. Verify the referenced document belongs to the same authenticated workspace
    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, workspace_id")
      .eq("id", documentId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (docErr || !document) {
      return { success: false, error: "Selected knowledge document does not belong to this workspace." };
    }

    // 3. Update the question to resolved status and link the document
    const { error: updateErr } = await supabase
      .from("unanswered_questions")
      .update({
        status: "resolved",
        resolved_by_document_id: documentId,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", questionId)
      .eq("workspace_id", workspace.id);

    if (updateErr) {
      return { success: false, error: updateErr.message || "Failed to resolve question." };
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}

/**
 * Marks an unanswered question as ignored/dismissed.
 */
export async function ignoreUnansweredQuestionAction(
  questionId: string,
): Promise<UnansweredQuestionActionState> {
  try {
    const { user, workspace } = await requireWorkspace();

    if (!questionId || !UUID_REGEX.test(questionId)) {
      return { success: false, error: "Valid unanswered question ID is required." };
    }

    const supabase = await createClient();

    // 1. Verify the question belongs to the authenticated workspace
    const { data: question, error: qErr } = await supabase
      .from("unanswered_questions")
      .select("id, workspace_id")
      .eq("id", questionId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (qErr || !question) {
      return { success: false, error: "Unanswered question not found in this workspace." };
    }

    // 2. Update status to ignored
    const { error: updateErr } = await supabase
      .from("unanswered_questions")
      .update({
        status: "ignored",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", questionId)
      .eq("workspace_id", workspace.id);

    if (updateErr) {
      return { success: false, error: updateErr.message || "Failed to ignore question." };
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}

/**
 * Reopens an ignored or resolved question back to open status.
 */
export async function reopenUnansweredQuestionAction(
  questionId: string,
): Promise<UnansweredQuestionActionState> {
  try {
    const { workspace } = await requireWorkspace();

    if (!questionId || !UUID_REGEX.test(questionId)) {
      return { success: false, error: "Valid unanswered question ID is required." };
    }

    const supabase = await createClient();

    // 1. Verify the question belongs to the authenticated workspace
    const { data: question, error: qErr } = await supabase
      .from("unanswered_questions")
      .select("id, workspace_id")
      .eq("id", questionId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (qErr || !question) {
      return { success: false, error: "Unanswered question not found in this workspace." };
    }

    // 2. Clear resolution fields and set status back to open
    const { error: updateErr } = await supabase
      .from("unanswered_questions")
      .update({
        status: "open",
        resolved_by_document_id: null,
        resolved_by: null,
        resolved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", questionId)
      .eq("workspace_id", workspace.id);

    if (updateErr) {
      return { success: false, error: updateErr.message || "Failed to reopen question." };
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}
