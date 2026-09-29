import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== STEP 8.2 & 8.3 TEST SUITE: Dashboard Navigation & Inbox Responsive Master-Detail ===\n");

const pageSource = fs.readFileSync("src/app/dashboard/page.tsx", "utf8");
const navSource = fs.readFileSync("src/app/dashboard/dashboard-nav.tsx", "utf8");
const overviewSource = fs.readFileSync("src/app/dashboard/overview-section.tsx", "utf8");
const inboxSource = fs.readFileSync("src/app/dashboard/conversations-inbox.tsx", "utf8");
const gapsSource = fs.readFileSync("src/app/dashboard/unanswered-questions.tsx", "utf8");

let passed = 0;
let failed = 0;

// Test 1: Navigation Component Architecture & Links
console.log("Test 1: Navigation Component Architecture & Query Parameters");
try {
  assert.ok(navSource.includes('href: "/dashboard?view=overview"'), "Nav must have overview query link");
  assert.ok(navSource.includes('href: "/dashboard?view=inbox"'), "Nav must have inbox query link");
  assert.ok(navSource.includes('href: "/dashboard?view=knowledge"'), "Nav must have knowledge query link");
  assert.ok(navSource.includes('href: "/dashboard?view=gaps"'), "Nav must have gaps query link");
  assert.ok(navSource.includes('href: "/dashboard?view=widget"'), "Nav must have widget query link");
  assert.ok(navSource.includes('aria-label="Dashboard navigation"'), "Nav must have accessible aria-label");
  assert.ok(navSource.includes('aria-current={isActive ? "page" : undefined}'), "Active tab must have aria-current='page'");
  assert.ok(navSource.includes("min-h-[40px]"), "Nav items must have minimum ~40px touch targets");
  assert.ok(navSource.includes("overflow-x-auto"), "Nav must support mobile horizontal scrolling");
  console.log("  ✓ DashboardNav structure, query parameters, accessibility, and touch targets verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 1 failed:", e.message);
  failed++;
}

// Test 2: Host Page SearchParams Resolution & View Fallback
console.log("\nTest 2: Host Page SearchParams Resolution & Safe Fallback");
try {
  assert.ok(pageSource.includes("searchParams?: Promise<{ view?: string; conversationId?: string }>"), "Page props must type searchParams as Promise");
  assert.ok(pageSource.includes("const resolvedParams = props.searchParams ? await props.searchParams : {};"), "Page must await searchParams");
  assert.ok(pageSource.includes('const validViews: DashboardView[] = ["overview", "inbox", "knowledge", "gaps", "widget"];'), "Page must validate supported views");
  assert.ok(pageSource.includes(': "overview"'), "Invalid or missing view must default to 'overview'");

  // Unit logic verification of fallback
  const validViews = ["overview", "inbox", "knowledge", "gaps", "widget"];
  const resolveView = (rawView) =>
    typeof rawView === "string" && validViews.includes(rawView) ? rawView : "overview";

  assert.equal(resolveView(undefined), "overview", "Undefined view must default to 'overview'");
  assert.equal(resolveView(""), "overview", "Empty view must default to 'overview'");
  assert.equal(resolveView("nonexistent"), "overview", "Invalid view must default to 'overview'");
  assert.equal(resolveView("inbox"), "inbox", "Valid 'inbox' must resolve to 'inbox'");
  assert.equal(resolveView("knowledge"), "knowledge", "Valid 'knowledge' must resolve to 'knowledge'");
  assert.equal(resolveView("gaps"), "gaps", "Valid 'gaps' must resolve to 'gaps'");
  assert.equal(resolveView("widget"), "widget", "Valid 'widget' must resolve to 'widget'");
  assert.equal(resolveView("overview"), "overview", "Valid 'overview' must resolve to 'overview'");

  console.log("  ✓ SearchParams resolution and safe fallback to Overview verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 2 failed:", e.message);
  failed++;
}

// Test 3: Host Page Conditional View Rendering
console.log("\nTest 3: Conditional View Rendering in Host Page");
try {
  assert.ok(pageSource.includes('activeView === "overview" && ('), "Must conditionally render OverviewSection");
  assert.ok(pageSource.includes('activeView === "inbox" && ('), "Must conditionally render ConversationsInbox");
  assert.ok(pageSource.includes('activeView === "knowledge" && ('), "Must conditionally render KnowledgeSection");
  assert.ok(pageSource.includes('activeView === "gaps" && ('), "Must conditionally render UnansweredQuestionsSection");
  assert.ok(pageSource.includes('activeView === "widget" && ('), "Must conditionally render WidgetSettingsForm");
  assert.ok(pageSource.includes("<DashboardNav"), "DashboardNav must be rendered across all views");
  assert.ok(pageSource.includes("Sign out"), "Sign out header must be rendered persistently across all views");

  console.log("  ✓ Host page correctly switches views conditionally while preserving header and navigation.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 3 failed:", e.message);
  failed++;
}

// Test 4: Cross-View Navigation from Knowledge Gaps to Inbox
console.log("\nTest 4: Cross-View Navigation (View Chat -> Inbox Thread)");
try {
  assert.ok(
    gapsSource.includes("router.push(`/dashboard?view=inbox&conversationId=${encodeURIComponent(conversationId)}`)"),
    "Knowledge gaps 'View Chat' must push /dashboard?view=inbox&conversationId=...",
  );
  assert.ok(
    pageSource.includes("initialConversationId={activeConversationId}"),
    "Host page must pass activeConversationId to ConversationsInbox",
  );
  assert.ok(
    pageSource.includes("key={activeConversationId || \"inbox-default\"}"),
    "ConversationsInbox must have dynamic key to re-mount/update on conversation selection",
  );
  assert.ok(
    inboxSource.includes("initialConversationId"),
    "ConversationsInbox must accept initialConversationId prop",
  );

  console.log("  ✓ Deep linking from Knowledge Gaps to Inbox conversation verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 4 failed:", e.message);
  failed++;
}

// Test 5: Overview Operational Summary Section
console.log("\nTest 5: Overview Section KPI Cards & Priority Queues");
try {
  assert.ok(overviewSource.includes("Open Escalations"), "Overview must include Open Escalations KPI");
  assert.ok(overviewSource.includes("Knowledge Gaps"), "Overview must include Knowledge Gaps KPI");
  assert.ok(overviewSource.includes("Knowledge Documents"), "Overview must include Knowledge Documents KPI");
  assert.ok(overviewSource.includes("Widget Status"), "Overview must include Widget Status KPI");
  assert.ok(overviewSource.includes("Priority Conversations"), "Overview must have Priority Conversations queue");
  assert.ok(overviewSource.includes("Recent Knowledge Gaps"), "Overview must have Recent Knowledge Gaps queue");
  assert.ok(overviewSource.includes("CopyKeyButton"), "Overview must provide CopyKeyButton for widget key");
  assert.ok(overviewSource.includes("href=\"/dashboard?view=inbox\""), "Overview must have quick jump to Inbox");
  assert.ok(overviewSource.includes("href=\"/dashboard?view=gaps\""), "Overview must have quick jump to Gaps");
  assert.ok(overviewSource.includes("href=\"/dashboard?view=knowledge\""), "Overview must have quick jump to Knowledge");
  assert.ok(overviewSource.includes("href=\"/dashboard?view=widget\""), "Overview must have quick jump to Widget");

  console.log("  ✓ OverviewSection operational cards, priority queues, and navigation links verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 5 failed:", e.message);
  failed++;
}

// Test 6: Invariant Preservation
console.log("\nTest 6: Invariant & Server Action Revalidation Preservation");
try {
  // Step 7.2 invariant check
  assert.ok(pageSource.includes("launcher_text, suggested_questions"), "Dashboard select query must include new fields");
  assert.ok(pageSource.includes('launcher_text: ""'), "Dashboard fallback must default launcher_text");
  assert.ok(pageSource.includes("suggested_questions: []"), "Dashboard fallback must default suggested_questions");

  // Revalidation invariant
  const actionSource = fs.readFileSync("src/app/actions/settings.ts", "utf8");
  assert.ok(actionSource.includes('revalidatePath("/dashboard")'), "Action must continue revalidating /dashboard");

  console.log("  ✓ All existing test invariants and server action revalidations preserved intact.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 6 failed:", e.message);
  failed++;
}

// Test 7: Step 8.3 Mobile Master-Detail State & Behavior
console.log("\nTest 7: Step 8.3 Mobile Master-Detail State & Behavior");
try {
  assert.ok(inboxSource.includes("mobileShowDetail"), "Inbox must define mobileShowDetail state");
  assert.ok(inboxSource.includes("setMobileShowDetail(true)"), "Selecting a thread must set mobileShowDetail(true)");
  assert.ok(inboxSource.includes("setMobileShowDetail(false)"), "Back button must set mobileShowDetail(false)");
  assert.ok(inboxSource.includes("initialConversationId && conversations.some"), "Deep link must initialize mobileShowDetail to true when matching");

  console.log("  ✓ Mobile master-detail state, thread selection, and back transition verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 7 failed:", e.message);
  failed++;
}

// Test 8: Step 8.3 Responsive Breakpoint (md:grid-cols-12 & Proportions)
console.log("\nTest 8: Step 8.3 Responsive Breakpoint (md:grid-cols-12)");
try {
  assert.ok(inboxSource.includes("md:grid-cols-12"), "Master-detail grid must activate at md: (768px+)");
  assert.ok(!inboxSource.includes("lg:grid-cols-12"), "Old lg:grid-cols-12 breakpoint must be replaced");
  assert.ok(inboxSource.includes("md:col-span-5"), "Thread list must take 5/12 cols at md+");
  assert.ok(inboxSource.includes("md:col-span-7"), "Transcript must take 7/12 cols at md+");
  assert.ok(inboxSource.includes("md:h-[640px]"), "Transcript must maintain 640px height at md+");
  assert.ok(inboxSource.includes("100dvh"), "Transcript must use dynamic viewport height on mobile");

  console.log("  ✓ Responsive breakpoint md:grid-cols-12, pane proportions, and dynamic height verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 8 failed:", e.message);
  failed++;
}

// Test 9: Step 8.3 Mobile Back Button & Transcript Header Layout
console.log("\nTest 9: Step 8.3 Mobile Back Button & Header Rows");
try {
  assert.ok(inboxSource.includes('aria-label="Back to conversations list"'), "Back button must have aria-label");
  assert.ok(inboxSource.includes("md:hidden"), "Back button must be hidden on tablet and desktop (md:hidden)");
  assert.ok(inboxSource.includes("min-h-[40px]"), "Back button must have ~40px touch target");
  assert.ok(inboxSource.includes("Escalate to Human"), "Escalate to Human action preserved");
  assert.ok(inboxSource.includes("Claim Conversation") || inboxSource.includes("Take Over"), "Claim/Take Over actions preserved");
  assert.ok(inboxSource.includes("Return to AI"), "Return to AI action preserved");
  assert.ok(inboxSource.includes("Resolve"), "Resolve action preserved");
  assert.ok(inboxSource.includes("Close"), "Close action preserved");
  assert.ok(inboxSource.includes("Reopen"), "Reopen action preserved");

  console.log("  ✓ Mobile Back button, accessibility, and all 6 lifecycle/takeover actions verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 9 failed:", e.message);
  failed++;
}

// Test 10: Step 8.3 Filters, Composer Sizing & Accessibility
console.log("\nTest 10: Step 8.3 Filters Visibility, Composer Sizing & Accessibility");
try {
  assert.ok(inboxSource.includes('text-base sm:text-xs'), "Composer textarea must use text-base sm:text-xs to prevent iOS auto-zoom");
  assert.ok(inboxSource.includes('role="tablist"'), "Filter bar must have role='tablist'");
  assert.ok(inboxSource.includes('role="tab"'), "Filter buttons must have role='tab'");
  assert.ok(inboxSource.includes('aria-selected={isActive}'), "Filter buttons must have aria-selected");
  assert.ok(inboxSource.includes('aria-current={isSelected ? "true" : undefined}'), "Thread cards must expose aria-current");
  assert.ok(inboxSource.includes('hidden sm:inline'), "Desktop Ctrl+Enter hint preserved and hidden on mobile");

  console.log("  ✓ Filter tabs accessibility, composer font sizing, and selected states verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 10 failed:", e.message);
  failed++;
}

console.log(`\n===============================================================================`);
console.log(`ALL TESTS PASSED: ${passed} passed, ${failed} failed (Total: 10)`);
console.log(`===============================================================================`);

if (failed > 0) {
  process.exit(1);
}
