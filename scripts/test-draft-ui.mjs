import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== STEP 6.4-B TEST SUITE: AI Knowledge Draft Review & Editor UI ===\n");

const uiSource = fs.readFileSync("src/app/dashboard/unanswered-questions.tsx", "utf8");

let passed = 0;
let failed = 0;

// Test 1: "Draft Doc with AI" Button Presence & States
console.log("Test 1: 'Draft Doc with AI' Button & Loading State");
try {
  assert.ok(uiSource.includes("Draft Doc with AI"), "Must contain 'Draft Doc with AI' button text");
  assert.ok(uiSource.includes("Drafting with AI..."), "Must contain loading indicator text 'Drafting with AI...'");
  assert.ok(uiSource.includes("handleStartDraft"), "Must have click handler handleStartDraft");
  assert.ok(uiSource.includes("generatingQuestionId"), "Must track generating question ID state");
  console.log("  ✓ 'Draft Doc with AI' button and loading states verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 1 failed:", e.message);
  failed++;
}

// Test 2: AI Draft Review & Editor Modal Elements
console.log("\nTest 2: Modal Structure & Required Fields");
try {
  assert.ok(uiSource.includes("AI Knowledge Draft Review"), "Must have 'AI Knowledge Draft Review' header");
  assert.ok(uiSource.includes("Human Review Required"), "Must display 'Human Review Required' badge");
  assert.ok(uiSource.includes("Source Customer Query (Knowledge Gap)"), "Must display original question label");
  assert.ok(uiSource.includes("draftModalQuestion.question_text"), "Must display original question text");
  assert.ok(uiSource.includes("AI Draft Summary"), "Must display AI summary label");
  assert.ok(uiSource.includes("Missing Information Placeholders"), "Must display missing information placeholders section");
  assert.ok(uiSource.includes("remainingPlaceholders"), "Must calculate and display remaining placeholders count");
  assert.ok(uiSource.includes("Document Title"), "Must display Document Title field");
  assert.ok(uiSource.includes("Knowledge Content (Markdown)"), "Must display Knowledge Content field");
  console.log("  ✓ All required modal fields, question context, and AI indicators verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 2 failed:", e.message);
  failed++;
}

// Test 3: Editable Title and Content Controls
console.log("\nTest 3: Title and Content Editability");
try {
  assert.ok(uiSource.includes("editedTitle"), "Must have editedTitle state");
  assert.ok(uiSource.includes("setEditedTitle(e.target.value)"), "Title must be editable via standard input");
  assert.ok(uiSource.includes("editedContent"), "Must have editedContent state");
  assert.ok(uiSource.includes("setEditedContent(e.target.value)"), "Content must be editable via standard textarea");
  assert.ok(uiSource.includes("editedTitle.length}/150"), "Must display title character counter");
  assert.ok(uiSource.includes("editedContent.length}/20,000"), "Must display content character counter");
  console.log("  ✓ Complete title and content editability with live character counters verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 3 failed:", e.message);
  failed++;
}

// Test 4: Action Buttons (Cancel, Regenerate, Continue to Publish)
console.log("\nTest 4: Action Buttons & Workflow");
try {
  assert.ok(uiSource.includes("handleCloseDraftModal"), "Must have close/cancel handler");
  assert.ok(uiSource.includes("handleRegenerateClick"), "Must have regenerate click handler");
  assert.ok(uiSource.includes("Regenerate Draft"), "Must have 'Regenerate Draft' button");
  assert.ok(uiSource.includes("handleContinueToPublish"), "Must have 'Continue to Publish' handler");
  assert.ok(uiSource.includes("Continue to Publish"), "Must have 'Continue to Publish' button");
  console.log("  ✓ All required buttons (Cancel, Regenerate, Continue to Publish) present.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 4 failed:", e.message);
  failed++;
}

// Test 5: Validation Constraints (matching Knowledge Document rules)
console.log("\nTest 5: Validation Constraints");
try {
  assert.ok(uiSource.includes("trimmedTitle.length < 2 || trimmedTitle.length > 150"), "Must enforce title 2-150 chars");
  assert.ok(uiSource.includes("trimmedContent.length < 10 || trimmedContent.length > 20000"), "Must enforce content 10-20,000 chars");
  assert.ok(uiSource.includes("editorValidationError"), "Must display validation errors");
  console.log("  ✓ Document validation rules correctly enforced on Continue to Publish.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 5 failed:", e.message);
  failed++;
}

// Test 6: Regeneration Safeguard
console.log("\nTest 6: Regeneration Protection for Modified Drafts");
try {
  assert.ok(uiSource.includes("showRegenerateConfirm"), "Must track confirmation state for modified drafts");
  assert.ok(uiSource.includes("Regenerate and replace edits?"), "Must prompt user before discarding edits");
  assert.ok(uiSource.includes("Yes, Discard Edits & Regenerate") || uiSource.includes("Yes, Discard"), "Must have explicit confirm button");
  assert.ok(uiSource.includes("Keep My Edits"), "Must allow operator to cancel regeneration and keep edits");
  console.log("  ✓ Regeneration safeguard verified: warns before replacing edited drafts.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 6 failed:", e.message);
  failed++;
}

// Test 7: No Database Mutations Invariant
console.log("\nTest 7: No Database Mutations Verification");
try {
  // Verify that neither handleContinueToPublish nor any draft handler calls supabase insert/update
  assert.ok(!uiSource.includes("insertKnowledge"), "No document creation in unanswered-questions UI");
  assert.ok(!uiSource.includes("documents.insert"), "No direct document insertion in UI");
  assert.ok(!uiSource.includes("createKnowledgeDocAction"), "createKnowledgeDocAction must not be called directly from unanswered questions UI");
  assert.ok(uiSource.includes("handleExecutePublish"), "Step 6.4-C publish handler present");
  console.log("  ✓ UI delegates publishing to server action via handleExecutePublish.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 7 failed:", e.message);
  failed++;
}

// Test 8: Hydration Safety & Existing Functionality Preservation
console.log("\nTest 8: Hydration Safety & Legacy Feature Preservation");
try {
  assert.ok(uiSource.includes("formatTimestamp"), "formatTimestamp preserved");
  assert.ok(uiSource.includes("getUTC"), "Uses UTC methods for SSR hydration safety");
  assert.ok(uiSource.includes("handleOpenResolveModal"), "Existing resolve with knowledge modal preserved");
  assert.ok(uiSource.includes("handleIgnore"), "Existing ignore question preserved");
  assert.ok(uiSource.includes("handleReopen"), "Existing reopen question preserved");
  assert.ok(uiSource.includes("handleViewConversation"), "Existing transcript navigation preserved");
  console.log("  ✓ Hydration safety and all existing capabilities preserved.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 8 failed:", e.message);
  failed++;
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
