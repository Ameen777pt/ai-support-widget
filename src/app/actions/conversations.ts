"use server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import type { ConversationStatus } from "@/types/database.types";
import { revalidatePath } from "next/cache";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES: readonly ConversationStatus[] = [
  "active",
  "escalated",
  "resolved",
  "closed",
] as const;

export interface ConversationActionState {
  success: boolean;
  error: string | null;
  message?: string | null;
  assigned_to?: string | null;
}

/**
 * Atomically claims an escalated conversation for the authenticated agent.
 * Calls the atomic claim_escalated_conversation RPC with row-level locking.
 */
export async function claimConversationAction(
  conversationId: string,
): Promise<ConversationActionState> {
  await requireWorkspace();

  if (!conversationId || !UUID_REGEX.test(conversationId.trim())) {
    return {
      success: false,
      error: "Invalid conversation identifier format.",
    };
  }

  const cleanConvId = conversationId.trim();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("claim_escalated_conversation", {
    p_conversation_id: cleanConvId,
  });

  if (error) {
    return {
      success: false,
      error: `Failed to claim conversation: ${error.message}`,
    };
  }

  const claimResult = data && data.length > 0 ? data[0] : null;

  if (!claimResult || !claimResult.success) {
    return {
      success: false,
      error: claimResult?.message || "Failed to claim conversation. It may already be claimed.",
      assigned_to: claimResult?.assigned_to || null,
    };
  }

  revalidatePath("/dashboard");

  return {
    success: true,
    error: null,
    message: claimResult.message || "Conversation claimed successfully.",
    assigned_to: claimResult.assigned_to,
  };
}

/**
 * Sends a human support agent reply on a conversation.
 * Verifies tenant workspace isolation, validates message length, and inserts as sender_type = 'agent'.
 */
export async function sendAgentReplyAction(
  conversationId: string,
  content: string,
): Promise<ConversationActionState> {
  const { user, workspace } = await requireWorkspace();

  if (!conversationId || !UUID_REGEX.test(conversationId.trim())) {
    return {
      success: false,
      error: "Invalid conversation identifier format.",
    };
  }

  const cleanConvId = conversationId.trim();
  const cleanContent = content ? content.trim() : "";

  if (!cleanContent || cleanContent.length < 1 || cleanContent.length > 3000) {
    return {
      success: false,
      error: "Message content must be between 1 and 3,000 characters.",
    };
  }

  const supabase = await createClient();

  // 1. Verify conversation belongs to the authenticated workspace
  const { data: convRecord, error: convError } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("id", cleanConvId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (convError || !convRecord) {
    return {
      success: false,
      error: "Conversation not found or access denied.",
    };
  }

  if (convRecord.status === "closed") {
    return {
      success: false,
      error: "Cannot send a message to a closed conversation.",
    };
  }

  // 2. Insert human agent message using authenticated client (preserves RLS)
  const { error: insertError } = await supabase.from("messages").insert({
    workspace_id: workspace.id,
    conversation_id: cleanConvId,
    sender_type: "agent",
    sender_id: user.id,
    content: cleanContent,
    grounded: false,
    sources: [],
  });

  if (insertError) {
    return {
      success: false,
      error: `Failed to send agent reply: ${insertError.message}`,
    };
  }

  // 3. Update conversation last_message_at timestamp
  const nowIso = new Date().toISOString();
  await supabase
    .from("conversations")
    .update({
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", cleanConvId)
    .eq("workspace_id", workspace.id);

  revalidatePath("/dashboard");

  return {
    success: true,
    error: null,
    message: "Agent reply sent successfully.",
  };
}

/**
 * Updates the conversation lifecycle status (active, escalated, resolved, closed).
 * Automatically handles linked escalation record lifecycle.
 */
export async function updateConversationStatusAction(
  conversationId: string,
  newStatus: ConversationStatus,
): Promise<ConversationActionState> {
  const { workspace } = await requireWorkspace();

  if (!conversationId || !UUID_REGEX.test(conversationId.trim())) {
    return {
      success: false,
      error: "Invalid conversation identifier format.",
    };
  }

  if (!ALLOWED_STATUSES.includes(newStatus)) {
    return {
      success: false,
      error: `Invalid status '${newStatus}'. Allowed values: ${ALLOWED_STATUSES.join(", ")}.`,
    };
  }

  const cleanConvId = conversationId.trim();
  const supabase = await createClient();

  // 1. Verify conversation belongs to the authenticated workspace
  const { data: convRecord, error: convError } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("id", cleanConvId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (convError || !convRecord) {
    return {
      success: false,
      error: "Conversation not found or access denied.",
    };
  }

  const nowIso = new Date().toISOString();

  // 2. Update conversation status
  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      status: newStatus,
      updated_at: nowIso,
    })
    .eq("id", cleanConvId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return {
      success: false,
      error: `Failed to update conversation status: ${updateError.message}`,
    };
  }

  // 3. Synchronize linked escalation status
  if (newStatus === "resolved" || newStatus === "closed") {
    await supabase
      .from("escalations")
      .update({
        status: "resolved",
        resolved_at: nowIso,
        updated_at: nowIso,
      })
      .eq("conversation_id", cleanConvId)
      .eq("workspace_id", workspace.id);
  } else if (newStatus === "active") {
    await supabase
      .from("escalations")
      .update({
        status: "dismissed",
        updated_at: nowIso,
      })
      .eq("conversation_id", cleanConvId)
      .eq("workspace_id", workspace.id);
  } else if (newStatus === "escalated") {
    const { data: existingEsc } = await supabase
      .from("escalations")
      .select("id, status")
      .eq("conversation_id", cleanConvId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (!existingEsc) {
      await supabase.from("escalations").insert({
        workspace_id: workspace.id,
        conversation_id: cleanConvId,
        reason: "manual",
        status: "pending",
      });
    } else if (existingEsc.status === "dismissed" || existingEsc.status === "resolved") {
      await supabase
        .from("escalations")
        .update({
          status: "pending",
          resolved_at: null,
          updated_at: nowIso,
        })
        .eq("id", existingEsc.id)
        .eq("workspace_id", workspace.id);
    }
  }

  revalidatePath("/dashboard");

  return {
    success: true,
    error: null,
    message: `Conversation status updated to ${newStatus}.`,
  };
}
