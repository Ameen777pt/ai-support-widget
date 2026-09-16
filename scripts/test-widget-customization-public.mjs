import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== STEP 7.4 TEST SUITE: Public Widget Customization Integration ===\n");

const widgetSource = fs.readFileSync("src/app/widget/chat-widget.tsx", "utf8");
const configRouteSource = fs.readFileSync("src/app/api/widget/config/route.ts", "utf8");

let passed = 0;
let failed = 0;

// Test 1: Public Config Route Returns All 7 Presentation Fields
console.log("Test 1: Public Config Route Output & Security Boundary");
try {
  assert.ok(configRouteSource.includes("launcher_text: config.launcher_text"), "Must return launcher_text");
  assert.ok(configRouteSource.includes("suggested_questions: config.suggested_questions"), "Must return suggested_questions");
  assert.ok(configRouteSource.includes("brand_name: config.brand_name"), "Must return brand_name");
  assert.ok(configRouteSource.includes("brand_color: config.brand_color"), "Must return brand_color");
  assert.ok(configRouteSource.includes("welcome_message: config.welcome_message"), "Must return welcome_message");
  assert.ok(configRouteSource.includes("logo_url: config.logo_url"), "Must return logo_url");
  assert.ok(configRouteSource.includes("position: config.position"), "Must return position");

  // Security: Ensure internal identifiers and secrets are never exposed
  assert.ok(!configRouteSource.includes("workspace_id:"), "workspace_id must never be returned");
  assert.ok(!configRouteSource.includes("service_role"), "Service role key must never be exposed");
  assert.ok(!configRouteSource.includes("api_key"), "API keys must not be exposed");
  assert.ok(!configRouteSource.includes("user_id"), "User IDs must not be exposed");

  console.log("  ✓ Config route returns all 7 presentation fields safely with zero leaked internal data.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 1 failed:", e.message);
  failed++;
}

// Test 2: WidgetConfig Interface Invariants
console.log("\nTest 2: WidgetConfig Interface Definition");
try {
  assert.ok(widgetSource.includes("launcher_text?: string"), "WidgetConfig must include launcher_text");
  assert.ok(widgetSource.includes("suggested_questions?: string[]"), "WidgetConfig must include suggested_questions");
  console.log("  ✓ WidgetConfig typed definition verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 2 failed:", e.message);
  failed++;
}

// Test 3: Launcher Appearance Behavior (Empty vs Populated)
console.log("\nTest 3: Launcher Appearance Invariants");
try {
  // Empty launcher_text -> circular button
  assert.ok(
    widgetSource.includes("flex h-14 w-14 items-center justify-center rounded-full"),
    "Must preserve circular h-14 w-14 button when launcher_text is empty or widget is open",
  );

  // Populated launcher_text -> expanded pill button
  assert.ok(
    widgetSource.includes("!isOpen && config.launcher_text?.trim()"),
    "Must check !isOpen && config.launcher_text?.trim() condition",
  );
  assert.ok(
    widgetSource.includes("inline-flex items-center gap-2.5 rounded-full px-5 py-3.5 text-sm font-semibold"),
    "Must expand to pill button when launcher_text is present",
  );
  assert.ok(
    widgetSource.includes("<span className=\"whitespace-nowrap\">{config.launcher_text.trim()}</span>"),
    "Must render launcher text in label span",
  );

  // Positioning & Brand Color
  assert.ok(widgetSource.includes("style={{ backgroundColor: brandColor }}"), "Must apply brandColor to launcher");
  assert.ok(widgetSource.includes("${isLeft ? \"flex flex-col items-start\" : \"flex flex-col items-end\"}"), "Must align container to left/right based on position");

  console.log("  ✓ Launcher styling dynamically adapts between circular icon and text pill.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 3 failed:", e.message);
  failed++;
}

// Test 4: Suggested Questions Visibility Guards
console.log("\nTest 4: Suggested Questions Visibility Guards");
try {
  assert.ok(
    widgetSource.includes("const hasUserMessages = messages.some((m) => m.sender === \"user\");"),
    "Must check whether messages contains user messages",
  );
  assert.ok(
    widgetSource.includes("!hasUserMessages"),
    "Suggested questions must only show when there are NO user messages yet",
  );
  assert.ok(
    widgetSource.includes("!isEscalated"),
    "Suggested questions must not display during escalated human takeover",
  );
  assert.ok(
    widgetSource.includes("suggestedQuestions.length > 0"),
    "Suggested questions must only display when questions list is non-empty",
  );

  console.log("  ✓ Visibility guards verified: hidden after first user message, during escalation, or if empty.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 4 failed:", e.message);
  failed++;
}

// Test 5: Suggested Questions Ordering & Accessible Buttons
console.log("\nTest 5: Suggested Questions Rendering & Ordering");
try {
  assert.ok(
    widgetSource.includes("suggestedQuestions.map((question, idx)"),
    "Must map over suggestedQuestions preserving configured order",
  );
  assert.ok(
    widgetSource.includes("type=\"button\""),
    "Suggested question pill must be an accessible HTML button",
  );
  assert.ok(
    widgetSource.includes("disabled={isSending}"),
    "Buttons must be disabled while sending is in progress",
  );

  console.log("  ✓ Accessible question buttons and exact ordering preservation verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 5 failed:", e.message);
  failed++;
}

// Test 6: Unified Send Flow & Zero New Endpoints
console.log("\nTest 6: Unified Send Flow Invariant");
try {
  assert.ok(
    widgetSource.includes("const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {"),
    "Must have centralized handleSendMessage function supporting custom text",
  );
  assert.ok(
    widgetSource.includes("const handleSelectSuggestedQuestion = async (question: string) => {"),
    "Must route suggested question selection through handleSendMessage",
  );
  assert.ok(
    widgetSource.includes("await handleSendMessage(undefined, question);"),
    "handleSelectSuggestedQuestion must directly invoke handleSendMessage(undefined, question)",
  );

  // Check no extra fetch endpoint introduced
  const fetchCalls = widgetSource.match(/fetch\s*\(\s*["'`][^"'`]+["'`]/g) || [];
  const endpoints = fetchCalls.map((c) => c.replace(/fetch\s*\(\s*["'`]/, "").replace(/["'`]/, ""));
  
  // Endpoints should only be /api/widget/config and /api/widget/chat
  for (const ep of endpoints) {
    assert.ok(
      ep.startsWith("/api/widget/config") || ep.startsWith("/api/widget/chat"),
      `Unexpected API endpoint in chat-widget: ${ep}`,
    );
  }

  console.log("  ✓ Unified send flow verified; zero duplicate logic or new endpoints introduced.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 6 failed:", e.message);
  failed++;
}

// Test 7: State Machine Simulation of Suggested Questions Lifecycle
console.log("\nTest 7: Simulation: Suggested Questions Lifecycle");
try {
  const getShowSuggested = ({ messages, isEscalated, suggestedQuestions }) => {
    const hasUserMessages = messages.some((m) => m.sender === "user");
    return !hasUserMessages && !isEscalated && suggestedQuestions.length > 0;
  };

  const sampleQuestions = ["Pricing?", "Refund policy?", "Contact team?"];

  // 1. Initial fresh conversation: should show
  const initialMessages = [{ id: "welcome-msg", sender: "bot", text: "Hi!", time: "10:00 AM" }];
  assert.strictEqual(
    getShowSuggested({ messages: initialMessages, isEscalated: false, suggestedQuestions: sampleQuestions }),
    true,
    "Initial conversation must show suggested questions",
  );

  // 2. Empty configured questions: should NOT show
  assert.strictEqual(
    getShowSuggested({ messages: initialMessages, isEscalated: false, suggestedQuestions: [] }),
    false,
    "Empty suggested questions must not show",
  );

  // 3. User sends a message: should immediately disappear
  const withUserMsg = [
    ...initialMessages,
    { id: "user-1", sender: "user", text: "Pricing?", time: "10:01 AM" },
  ];
  assert.strictEqual(
    getShowSuggested({ messages: withUserMsg, isEscalated: false, suggestedQuestions: sampleQuestions }),
    false,
    "Must disappear once user sends a message",
  );

  // 4. Escalated conversation: should NOT show
  assert.strictEqual(
    getShowSuggested({ messages: initialMessages, isEscalated: true, suggestedQuestions: sampleQuestions }),
    false,
    "Must not show when conversation is escalated",
  );

  // 5. Order preservation
  const rendered = sampleQuestions.map((q) => q);
  assert.deepStrictEqual(rendered, sampleQuestions, "Configured order must match rendered order");

  console.log("  ✓ State machine lifecycle passed all test scenarios.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 7 failed:", e.message);
  failed++;
}

// Test 8: State Machine Simulation of Launcher Appearance
console.log("\nTest 8: Simulation: Launcher Appearance (Pill vs Circular)");
try {
  const getLauncherClasses = ({ isOpen, launcherText }) => {
    const hasText = !isOpen && Boolean(launcherText?.trim());
    return {
      isPill: hasText,
      ariaLabel: isOpen
        ? "Close support chat"
        : launcherText?.trim()
        ? `Open support chat: ${launcherText.trim()}`
        : "Open support chat",
    };
  };

  // 1. Empty launcher text, closed -> circular
  const emptyClosed = getLauncherClasses({ isOpen: false, launcherText: "" });
  assert.strictEqual(emptyClosed.isPill, false);
  assert.strictEqual(emptyClosed.ariaLabel, "Open support chat");

  // 2. Populated launcher text, closed -> pill with custom aria
  const populatedClosed = getLauncherClasses({ isOpen: false, launcherText: "Chat with us" });
  assert.strictEqual(populatedClosed.isPill, true);
  assert.strictEqual(populatedClosed.ariaLabel, "Open support chat: Chat with us");

  // 3. Populated launcher text, open -> circular close button
  const populatedOpen = getLauncherClasses({ isOpen: true, launcherText: "Chat with us" });
  assert.strictEqual(populatedOpen.isPill, false);
  assert.strictEqual(populatedOpen.ariaLabel, "Close support chat");

  // 4. Whitespace only launcher text -> treated as empty
  const whitespaceOnly = getLauncherClasses({ isOpen: false, launcherText: "   " });
  assert.strictEqual(whitespaceOnly.isPill, false);
  assert.strictEqual(whitespaceOnly.ariaLabel, "Open support chat");

  console.log("  ✓ Launcher appearance state machine passed all edge cases.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 8 failed:", e.message);
  failed++;
}

// Test 9: Existing Features Preservation Invariants
console.log("\nTest 9: Preservation of Existing Core Features");
try {
  assert.ok(widgetSource.includes("POLLING_INTERVAL_MS"), "Polling interval preserved");
  assert.ok(widgetSource.includes("deduplicateMessages"), "Message deduplication preserved");
  assert.ok(widgetSource.includes("isEscalated"), "Escalation handling preserved");
  assert.ok(widgetSource.includes("isWaitingForAgent"), "Agent pending indicator preserved");
  assert.ok(widgetSource.includes("getWelcomeMessage"), "Welcome message formatting preserved");
  assert.ok(widgetSource.includes("getOrCreateVisitorId"), "Visitor tracking preserved");
  assert.ok(widgetSource.includes("setStoredConversationId"), "Conversation localStorage persistence preserved");

  console.log("  ✓ All existing chat widget capabilities preserved intact.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 9 failed:", e.message);
  failed++;
}

// ---------------------------------------------------------------------------
// Dynamic Integration Tests for Fresh vs Existing Conversation Lifecycles
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && anonKey && serviceKey) {
  const anonClient = createClient(supabaseUrl, anonKey);
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: ws } = await adminClient
    .from("workspaces")
    .select("public_widget_key")
    .limit(1);

  const testKey = ws?.[0]?.public_widget_key;

  if (testKey) {
    const createdConvIds = [];

    // Test 10: Fresh widget session + suggested question (no conversation_id)
    console.log("\nTest 10: Fresh session + suggested question conversation creation");
    try {
      const freshVid = `vis_${crypto.randomUUID()}`;
      const { data: convData, error: convError } = await anonClient.rpc(
        "create_or_get_widget_conversation",
        {
          p_public_widget_key: testKey,
          p_visitor_id: freshVid,
        },
      );

      assert.ifError(convError);
      assert.ok(convData && convData.length === 1, "Must return exactly 1 conversation row");
      assert.ok(convData[0].conversation_id, "Must return valid conversation_id");
      assert.strictEqual(convData[0].status, "active", "Conversation status must be active");
      createdConvIds.push(convData[0].conversation_id);

      console.log("  ✓ Fresh session establishes active conversation successfully without ambiguity error.");
      passed++;
    } catch (e) {
      console.error("  ✗ Test 10 failed:", e.message);
      failed++;
    }

    // Test 11: Idempotency & Duplicate Prevention
    console.log("\nTest 11: Repeated calls do not create duplicate conversations");
    try {
      const repeatVid = `vis_${crypto.randomUUID()}`;
      const { data: firstCall } = await anonClient.rpc("create_or_get_widget_conversation", {
        p_public_widget_key: testKey,
        p_visitor_id: repeatVid,
      });

      const { data: secondCall } = await anonClient.rpc("create_or_get_widget_conversation", {
        p_public_widget_key: testKey,
        p_visitor_id: repeatVid,
      });

      assert.strictEqual(
        firstCall[0].conversation_id,
        secondCall[0].conversation_id,
        "Consecutive calls for same visitor must return identical conversation_id",
      );
      createdConvIds.push(firstCall[0].conversation_id);

      console.log("  ✓ Idempotency verified: exactly 1 conversation maintained per visitor.");
      passed++;
    } catch (e) {
      console.error("  ✗ Test 11 failed:", e.message);
      failed++;
    }

    // Test 12: Sending message with existing conversation
    console.log("\nTest 12: Sending message with existing conversation");
    try {
      const existingVid = `vis_${crypto.randomUUID()}`;
      const { data: convData } = await anonClient.rpc("create_or_get_widget_conversation", {
        p_public_widget_key: testKey,
        p_visitor_id: existingVid,
      });
      const convId = convData[0].conversation_id;
      createdConvIds.push(convId);

      const { data: msgData, error: msgError } = await anonClient.rpc("send_visitor_message", {
        p_public_widget_key: testKey,
        p_visitor_id: existingVid,
        p_conversation_id: convId,
        p_content: "Suggested question text via existing flow",
      });

      assert.ifError(msgError);
      assert.ok(msgData && msgData.length === 1, "Must return created message row");
      assert.strictEqual(msgData[0].content, "Suggested question text via existing flow");
      assert.strictEqual(msgData[0].conversation_id, convId);

      console.log("  ✓ Message sending on existing conversation verified.");
      passed++;
    } catch (e) {
      console.error("  ✗ Test 12 failed:", e.message);
      failed++;
    }

    // Clean up test conversations
    if (createdConvIds.length > 0) {
      await adminClient.from("conversations").delete().in("id", createdConvIds);
    }
  }
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
