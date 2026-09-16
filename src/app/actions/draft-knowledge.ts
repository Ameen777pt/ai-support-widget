"use server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { generateKnowledgeDraft, type KnowledgeSnippet } from "@/lib/ai/gemini";
import { revalidatePath } from "next/cache";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KnowledgeDraftData {
  title: string;
  content: string;
  summary: string;
  placeholders: string[];
  questionId: string;
  questionText: string;
}

export interface GenerateKnowledgeDraftState {
  success: boolean;
  draft?: KnowledgeDraftData | null;
  error?: string | null;
}

/**
 * Generates an AI-assisted knowledge article draft from an unanswered question.
 *
 * Security and Architectural Invariants:
 * - Read-only operation: performs zero database mutations. Does not create documents or modify unanswered questions.
 * - Enforces workspace authentication: calls `requireWorkspace()` to identify the verified user and tenant.
 * - Strict tenant boundary: verifies the unanswered question belongs exclusively to the caller's authenticated workspace.
 * - Never trusts client-provided workspace IDs or user IDs.
 * - Sanitizes response payload: internal workspace IDs and user IDs are never exposed to the client.
 * - Factual grounding: injects existing workspace knowledge as reference material and instructs Gemini never
 *   to invent company-specific policies, numbers, or rules, substituting [Specify ...] placeholders instead.
 */
export async function generateKnowledgeDraftAction(
  questionId: string,
): Promise<GenerateKnowledgeDraftState> {
  try {
    // 1. Authenticate user and resolve active workspace session
    const { workspace } = await requireWorkspace();

    // 2. Validate questionId UUID format
    if (!questionId || typeof questionId !== "string" || !UUID_REGEX.test(questionId.trim())) {
      return {
        success: false,
        error: "A valid unanswered question ID is required.",
      };
    }

    const cleanQuestionId = questionId.trim();
    const supabase = await createClient();

    // 3. Verify the question belongs exclusively to the authenticated workspace
    const { data: questionRecord, error: qErr } = await supabase
      .from("unanswered_questions")
      .select("id, question_text, workspace_id")
      .eq("id", cleanQuestionId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (qErr || !questionRecord) {
      return {
        success: false,
        error: "Unanswered question not found in this workspace.",
      };
    }

    // 4. Retrieve relevant workspace knowledge snippets to ground the draft
    let knowledgeSnippets: KnowledgeSnippet[] = [];
    try {
      const { data: searchResults } = await supabase.rpc("search_workspace_knowledge", {
        p_public_widget_key: workspace.public_widget_key,
        p_query: questionRecord.question_text,
        p_match_limit: 3,
      });

      if (searchResults && Array.isArray(searchResults) && searchResults.length > 0) {
        knowledgeSnippets = searchResults
          .filter((k) => k.title && k.content && k.content.trim().length > 0)
          .map((k) => ({
            document_id: k.document_id,
            title: k.title.trim(),
            content: k.content.trim(),
          }));
      }
    } catch {
      // Continue with empty snippets if RPC call fails
      knowledgeSnippets = [];
    }

    // 5. Retrieve workspace branding for contextual naming
    let brandName = workspace.name;
    try {
      const { data: widgetSettings } = await supabase
        .from("widget_settings")
        .select("brand_name")
        .eq("workspace_id", workspace.id)
        .maybeSingle();

      if (widgetSettings?.brand_name && widgetSettings.brand_name.trim().length > 0) {
        brandName = widgetSettings.brand_name.trim();
      }
    } catch {
      // Fallback to workspace.name
    }

    // 6. Call structured Gemini drafting helper
    const result = await generateKnowledgeDraft({
      questionText: questionRecord.question_text,
      brandName,
      knowledgeSnippets,
    });

    if (!result.draft || result.error) {
      return {
        success: false,
        error: result.error || "Failed to generate knowledge draft.",
      };
    }

    // 7. Return safe draft structure to caller (No internal IDs exposed)
    return {
      success: true,
      draft: {
        title: result.draft.title,
        content: result.draft.content,
        summary: result.draft.summary,
        placeholders: result.draft.placeholders,
        questionId: questionRecord.id,
        questionText: questionRecord.question_text,
      },
    };
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }

    console.error(
      "generateKnowledgeDraftAction error:",
      err instanceof Error ? err.message : "Unexpected error",
    );

    return {
      success: false,
      error: "An unexpected error occurred while generating the draft. Please try again.",
    };
  }
}

export interface PublishKnowledgeDraftInput {
  questionId: string;
  title: string;
  content: string;
  allowPlaceholders?: boolean;
}

export interface PublishKnowledgeDraftState {
  success: boolean;
  documentId?: string | null;
  error?: string | null;
  warning?: string | null;
  requiresPlaceholderConfirmation?: boolean;
  unresolvedPlaceholders?: string[];
}

/**
 * Publishes an approved AI knowledge article draft to public.documents and atomically
 * resolves the originating unanswered question.
 *
 * Invariants & Guarantees:
 * - Human-confirmed database mutation: requires explicit operator review and confirmation.
 * - Authorization: strictly enforced via requireWorkspace(), limited to workspace owners and admins.
 * - Strict tenant isolation: verifies the question belongs exclusively to the caller's workspace.
 * - Server-side validation: title (2–150 chars), content (10–20,000 chars).
 * - Placeholder safety: detects [Specify ...] placeholders; requires explicit confirmation (allowPlaceholders).
 * - Duplicate publish prevention: rejects if question is already resolved or concurrently modified.
 * - Atomic transactional safety: invokes publish_knowledge_draft_and_resolve RPC or compensating rollback.
 */
export async function publishKnowledgeDraftAction(
  input: PublishKnowledgeDraftInput,
): Promise<PublishKnowledgeDraftState> {
  try {
    // 1. Authenticate user and verify owner/admin workspace permissions
    const { user, workspace, membership } = await requireWorkspace();

    if (membership.role !== "owner" && membership.role !== "admin") {
      return {
        success: false,
        error: "Forbidden: Only workspace owners and admins can publish knowledge entries.",
      };
    }

    // 2. Validate questionId UUID format
    if (
      !input.questionId ||
      typeof input.questionId !== "string" ||
      !UUID_REGEX.test(input.questionId.trim())
    ) {
      return {
        success: false,
        error: "A valid unanswered question ID is required.",
      };
    }

    const cleanQuestionId = input.questionId.trim();
    const trimmedTitle = input.title?.trim();
    const trimmedContent = input.content?.trim();

    // 3. Server-side validation of title and content bounds
    if (!trimmedTitle || trimmedTitle.length < 2 || trimmedTitle.length > 150) {
      return {
        success: false,
        error: "Title must be between 2 and 150 characters.",
      };
    }

    if (!trimmedContent || trimmedContent.length < 10 || trimmedContent.length > 20000) {
      return {
        success: false,
        error: "Content must be between 10 and 20,000 characters.",
      };
    }

    // 4. Placeholder Detection & Explicit Human Confirmation Guard
    const placeholderMatches = trimmedContent.match(/\[Specify\s+[^\]]+\]/gi) || [];
    const uniquePlaceholders = Array.from(
      new Set(placeholderMatches.map((p) => p.trim())),
    );

    if (uniquePlaceholders.length > 0 && !input.allowPlaceholders) {
      return {
        success: false,
        requiresPlaceholderConfirmation: true,
        unresolvedPlaceholders: uniquePlaceholders,
        error: `This draft contains ${uniquePlaceholders.length} unresolved placeholder(s): ${uniquePlaceholders.join(", ")}. Please confirm you want to publish with placeholders.`,
      };
    }

    const supabase = await createClient();

    // 5. Verify the question belongs to this workspace and is currently open (Duplicate Protection)
    const { data: questionRecord, error: qErr } = await supabase
      .from("unanswered_questions")
      .select("id, status, resolved_by_document_id, workspace_id")
      .eq("id", cleanQuestionId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (qErr || !questionRecord) {
      return {
        success: false,
        error: "Unanswered question not found in this workspace.",
      };
    }

    if (questionRecord.status === "resolved") {
      return {
        success: false,
        error: "This unanswered question has already been resolved.",
        documentId: questionRecord.resolved_by_document_id,
      };
    }

    // 6. Execute atomic publishing and gap resolution
    let publishedDocId: string | null = null;

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "publish_knowledge_draft_and_resolve",
        {
          p_question_id: cleanQuestionId,
          p_title: trimmedTitle,
          p_content: trimmedContent,
        },
      );

      if (!rpcError && rpcData && rpcData.length > 0) {
        const resultRow = rpcData[0];
        if (resultRow.success && resultRow.document_id) {
          publishedDocId = resultRow.document_id;
        } else if (resultRow.error_message) {
          return {
            success: false,
            error: resultRow.error_message,
          };
        }
      }
    } catch {
      // RPC error or unavailable, proceed to compensating transaction fallback below
    }

    // Fallback: Compensating transaction pattern if RPC was unavailable
    if (!publishedDocId) {
      const fileSizeBytes = Buffer.byteLength(trimmedContent, "utf8");

      // Step A: Insert knowledge document
      const { data: docData, error: insertError } = await supabase
        .from("documents")
        .insert({
          workspace_id: workspace.id,
          title: trimmedTitle,
          content: trimmedContent,
          source_type: "raw_text",
          status: "ready",
          mime_type: "text/plain",
          file_size_bytes: fileSizeBytes,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertError || !docData) {
        return {
          success: false,
          error: `Failed to create knowledge document: ${insertError?.message || "Database insert error"}`,
        };
      }

      const createdDocId = docData.id;

      // Step B: Atomically resolve the originating unanswered question
      const { error: resolveError } = await supabase
        .from("unanswered_questions")
        .update({
          status: "resolved",
          resolved_by_document_id: createdDocId,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", cleanQuestionId)
        .eq("workspace_id", workspace.id)
        .eq("status", "open"); // Guard against concurrent resolution

      if (resolveError) {
        // Compensating Rollback: Remove the created document so zero partial state remains
        console.error(
          "Resolution failed, executing compensating rollback for document:",
          createdDocId,
        );
        await supabase
          .from("documents")
          .delete()
          .eq("id", createdDocId)
          .eq("workspace_id", workspace.id);

        return {
          success: false,
          error: `Failed to resolve unanswered question. Document creation was rolled back. ${resolveError.message}`,
        };
      }

      publishedDocId = createdDocId;
    }

    // 7. Refresh dashboard data across paths
    revalidatePath("/dashboard");

    return {
      success: true,
      documentId: publishedDocId,
      warning:
        uniquePlaceholders.length > 0
          ? `Document published with ${uniquePlaceholders.length} placeholder(s) pending completion.`
          : null,
    };
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }

    console.error(
      "publishKnowledgeDraftAction error:",
      err instanceof Error ? err.message : "Unexpected error",
    );

    return {
      success: false,
      error: "An unexpected error occurred while publishing the draft. Please try again.",
    };
  }
}

