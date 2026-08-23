import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSupportResponse } from "@/lib/ai/gemini";
import { NextResponse, type NextRequest } from "next/server";

const VISITOR_ID_REGEX = /^vis_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * automatically creates or resolves the active conversation first.
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

  // If conversation_id is not provided, atomically create or retrieve active conversation
  if (!conversationId) {
    const { data: convData, error: convError } = await supabase.rpc(
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

  // Send visitor message via public RPC
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

  // 1. Retrieve existing conversation history (including the newly created visitor message)
  const { data: historyMessages } = await supabase.rpc(
    "get_conversation_messages",
    {
      p_public_widget_key: widgetKey,
      p_visitor_id: visitorId,
      p_conversation_id: conversationId,
    },
  );

  const rawHistory: Array<{ sender_type: string; content: string }> =
    (historyMessages as unknown as Array<{ sender_type: string; content: string }>) || [];

  const historyItems = rawHistory.length > 0
    ? rawHistory
    : [{ sender_type: "user", content }];

  // 2. Generate Gemini AI Response
  const botReplyText = await generateSupportResponse(historyItems);

  // 3. Persist Bot Message as sender_type = 'bot'
  let botMessageRecord: {
    id: string;
    sender_type: string;
    content: string;
    created_at: string;
  } | null = null;

  if (botReplyText && conversationId) {
    const activeConversationId: string = conversationId;
    const adminClient = createAdminClient();
    if (adminClient) {
      try {
        const { data: convRecord } = await adminClient
          .from("conversations")
          .select("workspace_id")
          .eq("id", activeConversationId)
          .maybeSingle();

        const typedConv = convRecord as { workspace_id: string } | null;
        if (typedConv?.workspace_id) {
          const { data: savedMsg, error: insertErr } = await adminClient
            .from("messages")
            .insert({
              workspace_id: typedConv.workspace_id,
              conversation_id: activeConversationId,
              sender_type: "bot",
              content: botReplyText,
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
        }
      } catch (dbErr) {
        console.error(
          "Failed to persist bot message:",
          dbErr instanceof Error ? dbErr.message : "DB error",
        );
      }
    }

    if (!botMessageRecord) {
      botMessageRecord = {
        id: crypto.randomUUID(),
        sender_type: "bot",
        content: botReplyText,
        created_at: new Date().toISOString(),
      };
    }
  }

  return NextResponse.json(
    {
      conversation_id: conversationId,
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

  return NextResponse.json({
    conversation_id: conversationId,
    messages: messageList.map((msg: MessageRow) => ({
      id: msg.message_id,
      sender_type: msg.sender_type,
      content: msg.content,
      created_at: msg.created_at,
    })),
  });
}
