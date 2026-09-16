import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSupportResponse } from "@/lib/ai/gemini";
import { NextResponse, type NextRequest } from "next/server";

const VISITOR_ID_REGEX = /^vis_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HUMAN_HANDOFF_MESSAGE =
  "I've transferred your request to our support team. A human agent will join and respond shortly.";

/**
 * Detects whether the visitor message expresses a clear intent to escalate to a human agent.
 * Uses targeted phrase patterns to avoid false positives on general queries.
 */
export function isHumanEscalationIntent(text: string): boolean {
  const normalized = text.toLowerCase().trim();

  const explicitPhrases = [
    /\b(talk|speak|connect|transfer)\s+(to|with)\s+(a\s+)?(human|agent|person|representative|operator|someone|somebody)\b/i,
    /\b(need|want)\s+(a\s+)?(human|agent|person|representative|operator|real person)\b/i,
    /\b(human|live|real)\s+(support|agent|person|help|representative|operator)\b/i,
    /\b(customer\s+service|support)\s+(agent|representative|person|human|operator)\b/i,
    /\b(escalate|escalation)\s+(to|this|my|issue|ticket|request|please)?\b/i,
    /\b(transfer\s+me|connect\s+me)\b/i,
    /\b(agent\s+please|human\s+please)\b/i,
    /\b(talk\s+to\s+someone|speak\s+to\s+someone)\b/i,
  ];

  for (const pattern of explicitPhrases) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes question text for consistent aggregation and deduplication.
 * Conservative: lowercase, collapse whitespace, strip punctuation noise.
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Records or increments an unanswered question in public.unanswered_questions.
 * Uses atomic/upsert handling based on (workspace_id, normalized_query).
 */
export async function recordUnansweredQuestion(
  adminClient: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  questionText: string,
  conversationId: string | null,
): Promise<void> {
  if (!adminClient || !workspaceId || !questionText) return;

  const normalized = normalizeQuestion(questionText);
  if (!normalized || normalized.length < 2) return;

  try {
    const { data: existing } = await adminClient
      .from("unanswered_questions")
      .select("id, occurrence_count")
      .eq("workspace_id", workspaceId)
      .eq("normalized_query", normalized)
      .maybeSingle();

    const typedExisting = existing as { id: string; occurrence_count: number } | null;

    if (typedExisting) {
      await adminClient
        .from("unanswered_questions")
        .update({
          occurrence_count: (typedExisting.occurrence_count || 1) + 1,
          last_seen_at: new Date().toISOString(),
          sample_conversation_id: conversationId || undefined,
        })
        .eq("id", typedExisting.id);
    } else {
      const { error: insertErr } = await adminClient
        .from("unanswered_questions")
        .insert({
          workspace_id: workspaceId,
          question_text: questionText.trim(),
          normalized_query: normalized,
          occurrence_count: 1,
          sample_conversation_id: conversationId || null,
          status: "open",
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        });

      if (insertErr && (insertErr.code === "23505" || insertErr.message?.includes("duplicate key"))) {
        const { data: raceExisting } = await adminClient
          .from("unanswered_questions")
          .select("id, occurrence_count")
          .eq("workspace_id", workspaceId)
          .eq("normalized_query", normalized)
          .maybeSingle();

        const typedRace = raceExisting as { id: string; occurrence_count: number } | null;
        if (typedRace) {
          await adminClient
            .from("unanswered_questions")
            .update({
              occurrence_count: (typedRace.occurrence_count || 1) + 1,
              last_seen_at: new Date().toISOString(),
              sample_conversation_id: conversationId || undefined,
            })
            .eq("id", typedRace.id);
        }
      }
    }
  } catch (err) {
    console.error(
      "Failed to record unanswered question:",
      err instanceof Error ? err.message : "DB error",
    );
  }
}

interface PostChatRequestBody {
  key?: string;
  public_widget_key?: string;
  visitor_id?: string;
  conversation_id?: string | null;
  content?: string;
  message?: string;
}

/**
 * POST /api/widget/chat
 * Sends a visitor message. If conversation_id is omitted or null,
 * automatically creates or resolves the active/escalated conversation first.
 */
export async function POST(request: NextRequest) {
  let body: PostChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const widgetKey = (body.key || body.public_widget_key)?.trim();
  const visitorId = body.visitor_id?.trim();
  const content = (body.content || body.message)?.trim();
  let conversationId = body.conversation_id?.trim() || null;

  // 1. Validate widget key
  if (!widgetKey || !widgetKey.startsWith("pk_live_") || widgetKey.length < 16) {
    return NextResponse.json(
      { error: "Valid public widget key is required (e.g. pk_live_...)." },
      { status: 400 },
    );
  }

  // 2. Validate visitor ID
  if (!visitorId || !VISITOR_ID_REGEX.test(visitorId)) {
    return NextResponse.json(
      { error: "Valid visitor identifier is required (format: vis_<UUID>)." },
      { status: 400 },
    );
  }

  // 3. Validate message content
  if (!content || content.length < 1 || content.length > 3000) {
    return NextResponse.json(
      { error: "Message content must be between 1 and 3000 characters." },
      { status: 400 },
    );
  }

  // 4. Validate conversation_id if provided
  if (conversationId && !UUID_REGEX.test(conversationId)) {
    return NextResponse.json(
      { error: "Invalid conversation identifier format." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // If conversation_id is not provided, atomically create or retrieve open conversation
  if (!conversationId) {
    const client = adminClient || supabase;
    const { data: convData, error: convError } = await client.rpc(
      "create_or_get_widget_conversation",
      {
        p_public_widget_key: widgetKey,
        p_visitor_id: visitorId,
      },
    );

    if (convError || !convData || convData.length === 0) {
      return NextResponse.json(
        { error: "Failed to establish or retrieve active conversation." },
        { status: 400 },
      );
    }

    conversationId = convData[0].conversation_id;
  }

  // Send visitor message via public RPC (supports active and escalated)
  const { data: msgData, error: msgError } = await supabase.rpc(
    "send_visitor_message",
    {
      p_public_widget_key: widgetKey,
      p_visitor_id: visitorId,
      p_conversation_id: conversationId,
      p_content: content,
    },
  );

  if (msgError || !msgData || msgData.length === 0) {
    return NextResponse.json(
      { error: "Failed to send message. Conversation may be closed or access denied." },
      { status: 400 },
    );
  }

  const createdMsg = msgData[0];
  const activeConversationId: string = conversationId || createdMsg.conversation_id;

  // Resolve current conversation status and workspace ID securely via admin client
  let convStatus = "active";
  let workspaceId: string | null = null;

  if (adminClient) {
    try {
      const { data: convRecord } = await adminClient
        .from("conversations")
        .select("workspace_id, status")
        .eq("id", activeConversationId)
        .maybeSingle();

      const typedConv = convRecord as { workspace_id: string; status: string } | null;
      if (typedConv) {
        convStatus = typedConv.status;
        workspaceId = typedConv.workspace_id;
      }
    } catch {
      // Fall back to active status if query fails
    }
  }

  // 1. If conversation is already escalated, mute AI and return visitor message
  if (convStatus === "escalated") {
    return NextResponse.json(
      {
        conversation_id: activeConversationId,
        message: {
          id: createdMsg.message_id,
          sender_type: createdMsg.sender_type,
          content: createdMsg.content,
          created_at: createdMsg.created_at,
        },
        reply: null,
        status: "escalated",
      },
      { status: 201 },
    );
  }

  // 2. Check for human escalation intent
  const requestedHuman = isHumanEscalationIntent(content);
  if (requestedHuman) {
    let handoffMsgRecord: {
      id: string;
      sender_type: string;
      content: string;
      created_at: string;
    } | null = null;

    if (adminClient && workspaceId) {
      try {
        const nowIso = new Date().toISOString();

        // Transition conversation to escalated
        await adminClient
          .from("conversations")
          .update({ status: "escalated", updated_at: nowIso, last_message_at: nowIso })
          .eq("id", activeConversationId);

        // Upsert escalation record with reason = 'user_requested'
        await adminClient
          .from("escalations")
          .upsert(
            {
              workspace_id: workspaceId,
              conversation_id: activeConversationId,
              reason: "user_requested",
              status: "pending",
              updated_at: nowIso,
            },
            { onConflict: "conversation_id" },
          );

        // Insert handoff message from bot
        const { data: savedMsg } = await adminClient
          .from("messages")
          .insert({
            workspace_id: workspaceId,
            conversation_id: activeConversationId,
            sender_type: "bot",
            content: HUMAN_HANDOFF_MESSAGE,
          })
          .select("id, sender_type, content, created_at")
          .maybeSingle();

        const typedMsg = savedMsg as {
          id: string;
          sender_type: string;
          content: string;
          created_at: string;
        } | null;

        if (typedMsg) {
          handoffMsgRecord = {
            id: typedMsg.id,
            sender_type: typedMsg.sender_type,
            content: typedMsg.content,
            created_at: typedMsg.created_at,
          };
        }
      } catch (escErr) {
        console.error("Failed to process human escalation handoff:", escErr);
      }
    }

    if (!handoffMsgRecord) {
      handoffMsgRecord = {
        id: crypto.randomUUID(),
        sender_type: "bot",
        content: HUMAN_HANDOFF_MESSAGE,
        created_at: new Date().toISOString(),
      };
    }

    return NextResponse.json(
      {
        conversation_id: activeConversationId,
        message: {
          id: createdMsg.message_id,
          sender_type: createdMsg.sender_type,
          content: createdMsg.content,
          created_at: createdMsg.created_at,
        },
        reply: handoffMsgRecord,
        status: "escalated",
      },
      { status: 201 },
    );
  }

  // 3. Normal Active Flow: Retrieve history, branding config, and knowledge concurrently
  const [historyResult, configResult, knowledgeResult] = await Promise.all([
    supabase.rpc("get_conversation_messages", {
      p_public_widget_key: widgetKey,
      p_visitor_id: visitorId,
      p_conversation_id: activeConversationId,
    }),
    supabase.rpc("get_public_widget_config", {
      p_public_widget_key: widgetKey,
    }),
    supabase.rpc("search_workspace_knowledge", {
      p_public_widget_key: widgetKey,
      p_query: content,
      p_match_limit: 3,
    }),
  ]);

  const rawHistory: Array<{ sender_type: string; content: string }> =
    (historyResult.data as unknown as Array<{ sender_type: string; content: string }>) || [];

  const historyItems = rawHistory.length > 0
    ? rawHistory
    : [{ sender_type: "user", content }];

  // Extract public branding context safely (only brand_name and welcome_message)
  const configRows = configResult.data as Array<{
    brand_name?: string;
    welcome_message?: string;
  }> | null;
  const widgetConfig = configRows && configRows.length > 0 ? configRows[0] : null;

  // Extract retrieved knowledge snippets safely (only title and content, max 3)
  const rawKnowledge = (knowledgeResult.data as Array<{
    document_id: string;
    title: string;
    content: string;
  }>) || [];
  const knowledgeSnippets = rawKnowledge
    .filter((k) => k.title && k.content && k.content.trim().length > 0)
    .map((k) => ({
      document_id: k.document_id,
      title: k.title.trim(),
      content: k.content.trim(),
    }));

  const aiContext = {
    brandName: widgetConfig?.brand_name || null,
    welcomeMessage: widgetConfig?.welcome_message || null,
    knowledgeSnippets: knowledgeSnippets.length > 0 ? knowledgeSnippets : null,
  };

  // 4. Generate Gemini AI Response with workspace context and grounded knowledge
  const aiResponse = await generateSupportResponse(historyItems, aiContext);
  const botReplyText = aiResponse.reply;

  // 5. Persist Bot Message as sender_type = 'bot' with grounding and sources metadata
  let botMessageRecord: {
    id: string;
    sender_type: string;
    content: string;
    created_at: string;
  } | null = null;

  if (botReplyText && adminClient && workspaceId) {
    try {
      const { data: savedMsg, error: insertErr } = await adminClient
        .from("messages")
        .insert({
          workspace_id: workspaceId,
          conversation_id: activeConversationId,
          sender_type: "bot",
          content: botReplyText,
          grounded: aiResponse.grounded,
          sources:
            aiResponse.grounded && knowledgeSnippets.length > 0
              ? knowledgeSnippets.map((k) => ({
                  id: k.document_id,
                  title: k.title,
                }))
              : [],
        })
        .select("id, sender_type, content, created_at")
        .maybeSingle();

      if (!insertErr && savedMsg) {
        await adminClient
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", activeConversationId);

        const typedMsg = savedMsg as {
          id: string;
          sender_type: string;
          content: string;
          created_at: string;
        };

        botMessageRecord = {
          id: typedMsg.id,
          sender_type: typedMsg.sender_type,
          content: typedMsg.content,
          created_at: typedMsg.created_at,
        };
      }
    } catch (dbErr) {
      console.error(
        "Failed to persist bot message:",
        dbErr instanceof Error ? dbErr.message : "DB error",
      );
    }

    // 6. Record Knowledge Gap in public.unanswered_questions if detected
    if (aiResponse.isKnowledgeGap) {
      try {
        await recordUnansweredQuestion(
          adminClient,
          workspaceId,
          content,
          activeConversationId,
        );
      } catch (uqErr) {
        console.error(
          "Failed to record unanswered question:",
          uqErr instanceof Error ? uqErr.message : "UQ error",
        );
      }
    }
  }

  if (!botMessageRecord && botReplyText) {
    botMessageRecord = {
      id: crypto.randomUUID(),
      sender_type: "bot",
      content: botReplyText,
      created_at: new Date().toISOString(),
    };
  }

  return NextResponse.json(
    {
      conversation_id: activeConversationId,
      message: {
        id: createdMsg.message_id,
        sender_type: createdMsg.sender_type,
        content: createdMsg.content,
        created_at: createdMsg.created_at,
      },
      reply: botMessageRecord
        ? {
            id: botMessageRecord.id,
            sender_type: botMessageRecord.sender_type,
            content: botMessageRecord.content,
            created_at: botMessageRecord.created_at,
          }
        : null,
      status: "active",
    },
    { status: 201 },
  );
}

/**
 * GET /api/widget/chat?key=...&visitor_id=...&conversation_id=...
 * Retrieves up to 100 messages for a visitor's active conversation.
 */
interface MessageRow {
  message_id: string;
  sender_type: string;
  content: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const widgetKey = (searchParams.get("key") || searchParams.get("public_widget_key"))?.trim();
  const visitorId = searchParams.get("visitor_id")?.trim();
  const conversationId = searchParams.get("conversation_id")?.trim();

  // 1. Validate widget key
  if (!widgetKey || !widgetKey.startsWith("pk_live_") || widgetKey.length < 16) {
    return NextResponse.json(
      { error: "Valid public widget key is required (e.g. ?key=pk_live_...)." },
      { status: 400 },
    );
  }

  // 2. Validate visitor ID
  if (!visitorId || !VISITOR_ID_REGEX.test(visitorId)) {
    return NextResponse.json(
      { error: "Valid visitor identifier is required (format: vis_<UUID>)." },
      { status: 400 },
    );
  }

  // 3. Validate conversation ID
  if (!conversationId || !UUID_REGEX.test(conversationId)) {
    return NextResponse.json(
      { error: "Valid conversation UUID is required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: messages, error: fetchError } = await supabase.rpc(
    "get_conversation_messages",
    {
      p_public_widget_key: widgetKey,
      p_visitor_id: visitorId,
      p_conversation_id: conversationId,
    },
  );

  if (fetchError) {
    return NextResponse.json(
      { error: "Unable to retrieve conversation messages." },
      { status: 400 },
    );
  }

  const messageList: MessageRow[] = (messages as unknown as MessageRow[]) || [];

  const adminClient = createAdminClient();
  let convStatus = "active";
  if (adminClient) {
    try {
      const { data: convRecord } = await adminClient
        .from("conversations")
        .select("status")
        .eq("id", conversationId)
        .maybeSingle();

      const typedConv = convRecord as { status: string } | null;
      if (typedConv?.status) {
        convStatus = typedConv.status;
      }
    } catch {
      // Fall back to active
    }
  }

  return NextResponse.json({
    conversation_id: conversationId,
    status: convStatus,
    messages: messageList.map((msg: MessageRow) => ({
      id: msg.message_id,
      sender_type: msg.sender_type,
      content: msg.content,
      created_at: msg.created_at,
    })),
  });
}
