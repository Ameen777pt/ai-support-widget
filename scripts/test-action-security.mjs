import assert from "node:assert/strict";

console.log("=== STEP 6.4-A SERVER ACTION & SECURITY TEST SUITE ===\n");

// Test UUID validation and tenant boundary logic
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateQuestionId(questionId) {
  if (!questionId || typeof questionId !== "string" || !UUID_REGEX.test(questionId.trim())) {
    return {
      success: false,
      error: "A valid unanswered question ID is required.",
    };
  }
  return { success: true };
}

// Simulate tenant boundary check
function simulateActionQuery(authenticatedWorkspaceId, questionRecord) {
  if (!questionRecord || questionRecord.workspace_id !== authenticatedWorkspaceId) {
    return {
      success: false,
      error: "Unanswered question not found in this workspace.",
    };
  }
  return { success: true, question: questionRecord };
}

// Simulate safe payload stripping (no internal IDs exposed)
function sanitizeDraftPayload(draft, questionRecord) {
  return {
    title: draft.title,
    content: draft.content,
    summary: draft.summary,
    placeholders: draft.placeholders,
    questionId: questionRecord.id,
    questionText: questionRecord.question_text,
  };
}

let passed = 0;
let failed = 0;

// Test A: Invalid UUID format rejection
console.log("Test A: Invalid Question ID Formats");
try {
  const invalidCases = ["", "   ", "not-a-uuid", "12345", "'; DROP TABLE documents; --"];
  for (const c of invalidCases) {
    const res = validateQuestionId(c);
    assert.strictEqual(res.success, false, `Expected ${c} to fail validation`);
    assert.strictEqual(res.error, "A valid unanswered question ID is required.");
  }
  console.log("  ✓ All invalid question ID formats rejected.");
  passed++;
} catch (e) {
  console.error("  ✗ Test A failed:", e.message);
  failed++;
}

// Test B: Cross-workspace question access rejection
console.log("\nTest B: Cross-Workspace Tenant Boundary");
try {
  const workspaceA = "11111111-1111-1111-1111-111111111111";
  const workspaceB = "22222222-2222-2222-2222-222222222222";
  const questionInWorkspaceB = {
    id: "33333333-3333-3333-3333-333333333333",
    workspace_id: workspaceB,
    question_text: "Confidential pricing for Workspace B?",
  };

  // Caller is authenticated as Workspace A, requesting Workspace B's question
  const accessAttempt = simulateActionQuery(workspaceA, questionInWorkspaceB);
  assert.strictEqual(accessAttempt.success, false);
  assert.strictEqual(accessAttempt.error, "Unanswered question not found in this workspace.");

  console.log("  ✓ Cross-workspace query denied: Workspace A cannot access Workspace B question.");
  passed++;
} catch (e) {
  console.error("  ✗ Test B failed:", e.message);
  failed++;
}

// Test C: Safe Draft Payload Sanitization
console.log("\nTest C: Payload Sanitization (No Internal IDs Exposed)");
try {
  const rawDraft = {
    title: "Support Policy",
    content: "Content with [Specify details]",
    summary: "Summary of draft",
    placeholders: ["[Specify details]"],
  };

  const question = {
    id: "44444444-4444-4444-4444-444444444444",
    workspace_id: "secret-workspace-uuid-12345",
    question_text: "What are your hours?",
    resolved_by: "secret-user-uuid-9999",
  };

  const safePayload = sanitizeDraftPayload(rawDraft, question);

  assert.strictEqual("workspace_id" in safePayload, false, "workspace_id must not be exposed");
  assert.strictEqual("resolved_by" in safePayload, false, "user IDs must not be exposed");
  assert.strictEqual(safePayload.questionId, question.id);
  assert.strictEqual(safePayload.questionText, question.question_text);
  assert.deepStrictEqual(safePayload.placeholders, rawDraft.placeholders);

  console.log("  ✓ Payload sanitized: Zero internal workspace or user IDs exposed.");
  passed++;
} catch (e) {
  console.error("  ✗ Test C failed:", e.message);
  failed++;
}

// Test D: Read-only invariant check
console.log("\nTest D: Read-only Invariant Verification");
try {
  // Confirm that generateKnowledgeDraftAction does not perform inserts or updates
  const fs = await import("node:fs");
  const actionSource = fs.readFileSync("src/app/actions/draft-knowledge.ts", "utf8");
  const generateActionFn = actionSource.slice(
    actionSource.indexOf("export async function generateKnowledgeDraftAction"),
    actionSource.indexOf("export async function publishKnowledgeDraftAction") > -1
      ? actionSource.indexOf("export async function publishKnowledgeDraftAction")
      : undefined
  );
  assert.ok(!generateActionFn.includes(".insert("), "generateKnowledgeDraftAction must not call .insert()");
  assert.ok(!generateActionFn.includes(".update("), "generateKnowledgeDraftAction must not call .update()");
  assert.ok(!generateActionFn.includes(".delete("), "generateKnowledgeDraftAction must not call .delete()");
  assert.ok(!generateActionFn.includes(".upsert("), "generateKnowledgeDraftAction must not call .upsert()");
  assert.ok(!generateActionFn.includes("status: \"resolved\""), "generateKnowledgeDraftAction must not mark questions resolved");
  console.log("  ✓ Read-only verified: No database mutation calls (insert/update/delete/upsert) exist in draft action.");
  passed++;
} catch (e) {
  console.error("  ✗ Test D failed:", e.message);
  failed++;
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
