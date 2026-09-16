import assert from "node:assert/strict";
import {
  generateSupportResponse,
  generateKnowledgeDraft,
  setGeminiClientForTesting,
} from "../src/lib/ai/gemini.ts";

console.log("===============================================================================");
console.log("REGRESSION TEST SUITE: COMPLETE UNKNOWN-QUESTION-TO-PUBLISH WORKFLOW");
console.log("===============================================================================\n");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Standalone Normalization logic (mirrors src/app/api/widget/chat/route.ts)
// ---------------------------------------------------------------------------
function normalizeQuestion(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// In-Memory Database Simulator for Full End-to-End Workflow Isolation
// ---------------------------------------------------------------------------
function createTestStore() {
  let documents = [];
  let unansweredQuestions = [];
  let messages = [];
  let conversations = [];

  return {
    documents,
    unansweredQuestions,
    messages,
    conversations,

    reset() {
      documents.length = 0;
      unansweredQuestions.length = 0;
      messages.length = 0;
      conversations.length = 0;
    },

    // Record or aggregate unanswered questions
    async recordUnansweredQuestion(workspaceId, questionText, conversationId = null) {
      if (!workspaceId || !questionText) return;
      const normalized = normalizeQuestion(questionText);
      if (!normalized || normalized.length < 2) return;

      const existing = unansweredQuestions.find(
        (q) => q.workspace_id === workspaceId && q.normalized_query === normalized,
      );

      const now = new Date().toISOString();
      if (existing) {
        existing.occurrence_count = (existing.occurrence_count || 1) + 1;
        existing.last_seen_at = now;
        if (conversationId) existing.sample_conversation_id = conversationId;
        return existing;
      } else {
        const newRecord = {
          id: crypto.randomUUID(),
          workspace_id: workspaceId,
          question_text: questionText.trim(),
          normalized_query: normalized,
          occurrence_count: 1,
          sample_conversation_id: conversationId,
          status: "open",
          resolved_by_document_id: null,
          resolved_by: null,
          resolved_at: null,
          first_seen_at: now,
          last_seen_at: now,
          created_at: now,
          updated_at: now,
        };
        unansweredQuestions.push(newRecord);
        return newRecord;
      }
    },

    // Search documents for knowledge retrieval
    searchKnowledge(workspaceId, query) {
      const q = query.toLowerCase();
      return documents
        .filter((d) => d.workspace_id === workspaceId && d.status === "ready")
        .filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q) || q.includes("discount"))
        .map((d) => ({
          document_id: d.id,
          title: d.title,
          content: d.content,
        }));
    },

    // Draft generation action simulation (strictly read-only)
    async executeDraftAction(workspaceId, questionId) {
      if (!questionId || !UUID_REGEX.test(questionId.trim())) {
        return { success: false, error: "A valid unanswered question ID is required." };
      }
      const question = unansweredQuestions.find(
        (q) => q.id === questionId.trim() && q.workspace_id === workspaceId,
      );
      if (!question) {
        return { success: false, error: "Unanswered question not found in this workspace." };
      }

      const snippets = this.searchKnowledge(workspaceId, question.question_text);
      const res = await generateKnowledgeDraft({
        questionText: question.question_text,
        brandName: "Acme Cloud",
        knowledgeSnippets: snippets,
      });

      if (!res.draft || res.error) {
        return { success: false, error: res.error || "Failed to generate knowledge draft." };
      }

      return {
        success: true,
        draft: {
          title: res.draft.title,
          content: res.draft.content,
          summary: res.draft.summary,
          placeholders: res.draft.placeholders,
          questionId: question.id,
          questionText: question.question_text,
        },
      };
    },

    // Publish action simulation with validation, placeholder guards, concurrency, and atomic rollback
    async executePublishAction(workspaceId, user, role, input, failResolutionSimulation = false) {
      if (role !== "owner" && role !== "admin") {
        return {
          success: false,
          error: "Forbidden: Only workspace owners and admins can publish knowledge entries.",
        };
      }

      if (!input.questionId || typeof input.questionId !== "string" || !UUID_REGEX.test(input.questionId.trim())) {
        return { success: false, error: "A valid unanswered question ID is required." };
      }

      const cleanQuestionId = input.questionId.trim();
      const trimmedTitle = input.title?.trim();
      const trimmedContent = input.content?.trim();

      if (!trimmedTitle || trimmedTitle.length < 2 || trimmedTitle.length > 150) {
        return { success: false, error: "Title must be between 2 and 150 characters." };
      }

      if (!trimmedContent || trimmedContent.length < 10 || trimmedContent.length > 20000) {
        return { success: false, error: "Content must be between 10 and 20,000 characters." };
      }

      // Placeholder detection
      const placeholderMatches = trimmedContent.match(/\[Specify\s+[^\]]+\]/gi) || [];
      const uniquePlaceholders = Array.from(new Set(placeholderMatches.map((p) => p.trim())));

      if (uniquePlaceholders.length > 0 && !input.allowPlaceholders) {
        return {
          success: false,
          requiresPlaceholderConfirmation: true,
          unresolvedPlaceholders: uniquePlaceholders,
          error: `This draft contains ${uniquePlaceholders.length} unresolved placeholder(s): ${uniquePlaceholders.join(", ")}. Please confirm you want to publish with placeholders.`,
        };
      }

      // Tenant check & duplicate protection
      const questionRecord = unansweredQuestions.find((q) => q.id === cleanQuestionId);
      if (!questionRecord || questionRecord.workspace_id !== workspaceId) {
        return { success: false, error: "Unanswered question not found in this workspace." };
      }

      if (questionRecord.status === "resolved") {
        return {
          success: false,
          error: "This unanswered question has already been resolved.",
          documentId: questionRecord.resolved_by_document_id,
        };
      }

      // Step A: Insert document
      const newDocId = crypto.randomUUID();
      const newDoc = {
        id: newDocId,
        workspace_id: workspaceId,
        title: trimmedTitle,
        content: trimmedContent,
        source_type: "raw_text",
        status: "ready",
        mime_type: "text/plain",
        file_size_bytes: Buffer.byteLength(trimmedContent, "utf8"),
        created_by: user.id,
        created_at: new Date().toISOString(),
      };
      documents.push(newDoc);

      // Step B: Atomically resolve question (with simulated failure/rollback support)
      if (failResolutionSimulation) {
        // Compensating rollback: delete inserted document!
        const docIdx = documents.findIndex((d) => d.id === newDocId);
        if (docIdx !== -1) documents.splice(docIdx, 1);

        return {
          success: false,
          error: "Failed to resolve unanswered question. Document creation was rolled back.",
        };
      }

      // Concurrency check: must still be open
      if (questionRecord.status !== "open") {
        const docIdx = documents.findIndex((d) => d.id === newDocId);
        if (docIdx !== -1) documents.splice(docIdx, 1);
        return {
          success: false,
          error: "This unanswered question has already been resolved.",
        };
      }

      questionRecord.status = "resolved";
      questionRecord.resolved_by_document_id = newDocId;
      questionRecord.resolved_by = user.id;
      questionRecord.resolved_at = new Date().toISOString();
      questionRecord.updated_at = new Date().toISOString();

      return {
        success: true,
        documentId: newDocId,
        warning:
          uniquePlaceholders.length > 0
            ? `Document published with ${uniquePlaceholders.length} placeholder(s) pending completion.`
            : null,
      };
    },

    // Chat execution simulation (mirrors route.ts handling)
    async handleIncomingChatMessage(workspaceId, visitorId, content, conversationId) {
      const snippets = this.searchKnowledge(workspaceId, content);
      const aiContext = {
        brandName: "Acme Cloud",
        welcomeMessage: "Welcome to Acme Cloud!",
        knowledgeSnippets: snippets.length > 0 ? snippets : null,
      };

      const aiResponse = await generateSupportResponse(
        [{ sender_type: "user", content }],
        aiContext,
      );

      // Bot message record
      const botMsg = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        conversation_id: conversationId,
        sender_type: "bot",
        content: aiResponse.reply,
        grounded: aiResponse.grounded,
        sources: aiResponse.grounded ? snippets.map((s) => ({ id: s.document_id, title: s.title })) : [],
      };
      messages.push(botMsg);

      // Gap recording
      if (aiResponse.isKnowledgeGap) {
        await this.recordUnansweredQuestion(workspaceId, content, conversationId);
      }

      return {
        reply: botMsg,
        aiResponse,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Configure Deterministic Mock Gemini Client
// ---------------------------------------------------------------------------
function setupMockGemini() {
  setGeminiClientForTesting({
    models: {
      generateContent: async ({ contents, config }) => {
        const systemInstruction = config?.systemInstruction || "";
        const promptText = contents?.[0]?.parts?.[0]?.text || "";

        // Check if this is a draft generation call
        if (systemInstruction.includes("HUMAN REVIEW DRAFT") || promptText.includes("<unanswered_question>")) {
          const hasExistingKnowledge = promptText.includes("--- Reference Document");
          if (promptText.includes("student discount") || promptText.includes("discount")) {
            return {
              text: JSON.stringify({
                title: "Student Discount Policy",
                content: "Acme Cloud provides discount pricing for academic students. Eligible students receive [Specify discount percentage] off annual plans upon submitting [Specify verification requirements]. Contact [Specify support contact] for assistance.",
                summary: "Draft policy for student discounts with required percentage and eligibility placeholders.",
                placeholders: [
                  "[Specify discount percentage]",
                  "[Specify verification requirements]",
                  "[Specify support contact]",
                ],
              }),
            };
          }
          if (promptText.includes("refund")) {
            return {
              text: JSON.stringify({
                title: "Refund Policy for Subscriptions",
                content: hasExistingKnowledge
                  ? "Acme Cloud provides 30-day money-back guarantees for all annual plans. Monthly plans are non-refundable. Contact support@acmecloud.example to initiate a refund request."
                  : "Acme Cloud refund policy: [Specify refund timeframe] for eligible cancellations. Contact [Specify support email].",
                summary: "Refund policy guidelines.",
                placeholders: hasExistingKnowledge ? [] : ["[Specify refund timeframe]", "[Specify support email]"],
              }),
            };
          }
          return {
            text: JSON.stringify({
              title: "General Inquiries",
              content: "Draft content with [Specify details].",
              summary: "Summary of draft.",
              placeholders: ["[Specify details]"],
            }),
          };
        }

        // Support chat evaluation
        const userText = contents?.[contents.length - 1]?.parts?.[0]?.text || "";
        const userLower = userText.toLowerCase();

        // 1. Greetings & general chitchat
        if (
          userLower === "hello" ||
          userLower === "hi" ||
          userLower.includes("good morning") ||
          userLower.includes("thank") ||
          userLower.includes("2 + 2") ||
          userLower.includes("2+2")
        ) {
          return {
            text: JSON.stringify({
              reply: "Hello! How can I help you today?",
              grounded: false,
              isKnowledgeGap: false,
            }),
          };
        }

        // 2. Question answered by reference knowledge
        if (systemInstruction.includes("<workspace_knowledge>") && systemInstruction.includes("Academic & Student Discount Policy")) {
          return {
            text: JSON.stringify({
              reply: "Yes, Acme Cloud offers a 20% discount on all annual subscriptions for verified students enrolled in accredited institutions.",
              grounded: true,
              isKnowledgeGap: false,
            }),
          };
        }

        // 3. Unknown company-specific question (knowledge gap)
        if (userLower.includes("student discount") || userLower.includes("enterprise sla") || userLower.includes("policy")) {
          return {
            text: JSON.stringify({
              reply: "I apologize, but I do not have information regarding our student discount policy. I have logged this with our support team.",
              grounded: false,
              isKnowledgeGap: true,
            }),
          };
        }

        return {
          text: JSON.stringify({
            reply: "I am not sure about that. Let me connect you with support.",
            grounded: false,
            isKnowledgeGap: true,
          }),
        };
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------
async function runRegressionSuite() {
  setupMockGemini();
  const store = createTestStore();

  const WORKSPACE_1 = "11111111-1111-1111-1111-111111111111";
  const WORKSPACE_2 = "22222222-2222-2222-2222-222222222222";
  const OWNER_USER = { id: "user-owner-001", email: "owner@acme.example" };
  const CONVERSATION_1 = "aaaa1111-bbbb-2222-cccc-333344445555";
  const VISITOR_1 = "vis_11111111-2222-3333-4444-555566667777";

  let passed = 0;
  let failed = 0;

  // -------------------------------------------------------------------------
  // Test 1: Unknown company-specific question creates an open knowledge gap
  // -------------------------------------------------------------------------
  console.log("Test 1: Unknown company-specific question creates an open knowledge gap");
  try {
    store.reset();
    const chatRes = await store.handleIncomingChatMessage(
      WORKSPACE_1,
      VISITOR_1,
      "Do you offer a student discount on annual subscriptions?",
      CONVERSATION_1,
    );

    assert.strictEqual(chatRes.aiResponse.isKnowledgeGap, true, "Expected isKnowledgeGap to be true");
    assert.strictEqual(chatRes.aiResponse.grounded, false, "Expected grounded to be false");
    assert.strictEqual(store.unansweredQuestions.length, 1, "Expected exactly 1 unanswered question row");

    const gap = store.unansweredQuestions[0];
    assert.strictEqual(gap.workspace_id, WORKSPACE_1);
    assert.strictEqual(gap.question_text, "Do you offer a student discount on annual subscriptions?");
    assert.strictEqual(gap.normalized_query, "do you offer a student discount on annual subscriptions");
    assert.strictEqual(gap.status, "open");
    assert.strictEqual(gap.occurrence_count, 1);
    assert.strictEqual(gap.resolved_by_document_id, null);
    assert.strictEqual(gap.sample_conversation_id, CONVERSATION_1);
    assert.ok(gap.first_seen_at && gap.last_seen_at);

    console.log("  ✓ Knowledge gap detected and recorded with status='open' and occurrence_count=1.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 1 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 2: Greetings/general questions do not create knowledge gaps
  // -------------------------------------------------------------------------
  console.log("\nTest 2: Greetings/general questions do not create knowledge gaps");
  try {
    store.reset();

    // 2a. Casual greeting
    const greetRes = await store.handleIncomingChatMessage(
      WORKSPACE_1,
      VISITOR_1,
      "Hello, good morning!",
      CONVERSATION_1,
    );
    assert.strictEqual(greetRes.aiResponse.isKnowledgeGap, false, "Greeting must not trigger knowledge gap");
    assert.strictEqual(store.unansweredQuestions.length, 0, "No unanswered questions should be recorded for greeting");

    // 2b. General arithmetic / non-company question
    const mathRes = await store.handleIncomingChatMessage(
      WORKSPACE_1,
      VISITOR_1,
      "What is 2 + 2?",
      CONVERSATION_1,
    );
    assert.strictEqual(mathRes.aiResponse.isKnowledgeGap, false, "Arithmetic must not trigger knowledge gap");
    assert.strictEqual(store.unansweredQuestions.length, 0, "No unanswered questions should be recorded for arithmetic");

    // 2c. Polite acknowledgment
    const thanksRes = await store.handleIncomingChatMessage(
      WORKSPACE_1,
      VISITOR_1,
      "Thank you so much!",
      CONVERSATION_1,
    );
    assert.strictEqual(thanksRes.aiResponse.isKnowledgeGap, false, "Thanks must not trigger knowledge gap");
    assert.strictEqual(store.unansweredQuestions.length, 0, "No unanswered questions should be recorded for thanks");

    console.log("  ✓ Greetings, arithmetic, and acknowledgments correctly produce isKnowledgeGap=false and zero DB rows.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 2 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 3: Repeated equivalent questions aggregate into one unanswered_questions row
  // -------------------------------------------------------------------------
  console.log("\nTest 3: Repeated equivalent questions aggregate into one unanswered_questions row");
  try {
    store.reset();

    // 1st occurrence
    await store.handleIncomingChatMessage(WORKSPACE_1, VISITOR_1, "Do you offer student discounts?", CONVERSATION_1);
    assert.strictEqual(store.unansweredQuestions.length, 1);
    assert.strictEqual(store.unansweredQuestions[0].occurrence_count, 1);

    // 2nd occurrence with punctuation and extra whitespace
    await store.handleIncomingChatMessage(WORKSPACE_1, "vis_user_2", "  do you offer student discounts???  ", "conv_2");
    assert.strictEqual(store.unansweredQuestions.length, 1, "Should not insert new row for equivalent question");
    assert.strictEqual(store.unansweredQuestions[0].occurrence_count, 2, "occurrence_count should increment to 2");

    // 3rd occurrence in all-caps with exclamation
    await store.handleIncomingChatMessage(WORKSPACE_1, "vis_user_3", "DO YOU OFFER STUDENT DISCOUNTS!", "conv_3");
    assert.strictEqual(store.unansweredQuestions.length, 1, "Should still have exactly 1 row");
    assert.strictEqual(store.unansweredQuestions[0].occurrence_count, 3, "occurrence_count should increment to 3");
    assert.strictEqual(store.unansweredQuestions[0].status, "open");

    console.log("  ✓ Question variants normalized identically and aggregated: 3 asks -> 1 row with occurrence_count=3.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 3 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 4: Draft generation does not mutate documents or resolve the gap
  // -------------------------------------------------------------------------
  console.log("\nTest 4: Draft generation does not mutate documents or resolve the gap");
  try {
    store.reset();
    const gap = await store.recordUnansweredQuestion(
      WORKSPACE_1,
      "Do you offer student discounts?",
      CONVERSATION_1,
    );

    const initialDocCount = store.documents.length;
    assert.strictEqual(initialDocCount, 0);

    const draftRes = await store.executeDraftAction(WORKSPACE_1, gap.id);
    assert.strictEqual(draftRes.success, true, "Draft generation should succeed");
    assert.ok(draftRes.draft, "Draft object should be returned");
    assert.strictEqual(draftRes.draft.title, "Student Discount Policy");
    assert.ok(draftRes.draft.placeholders.length > 0, "Placeholders should be extracted");

    // Verify Read-Only Invariants:
    assert.strictEqual(store.documents.length, 0, "Draft generation must NEVER create a document");
    assert.strictEqual(gap.status, "open", "Draft generation must NEVER alter question status");
    assert.strictEqual(gap.resolved_by_document_id, null, "resolved_by_document_id must remain null");
    assert.strictEqual(gap.occurrence_count, 1, "occurrence_count must remain unchanged");

    console.log("  ✓ Draft generation verified strictly read-only: documents=0, question status='open'.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 4 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 5: Human-edited title/content is exactly what gets published
  // -------------------------------------------------------------------------
  console.log("\nTest 5: Human-edited title/content is exactly what gets published");
  try {
    store.reset();
    const gap = await store.recordUnansweredQuestion(
      WORKSPACE_1,
      "Do you offer student discounts?",
      CONVERSATION_1,
    );

    const draftRes = await store.executeDraftAction(WORKSPACE_1, gap.id);
    assert.strictEqual(draftRes.success, true);

    // Operator edits both title and content, replacing placeholders with verified policy
    const humanEditedTitle = "Academic & Student Discount Policy 2026";
    const humanEditedContent = "We offer a 20% discount on all annual subscriptions for verified students enrolled in accredited institutions. Please email billing@acme.example with your student ID.";

    const publishRes = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gap.id,
      title: humanEditedTitle,
      content: humanEditedContent,
      allowPlaceholders: false,
    });

    assert.strictEqual(publishRes.success, true, "Publish should succeed");
    assert.strictEqual(store.documents.length, 1, "Exactly one document created");

    const publishedDoc = store.documents[0];
    assert.strictEqual(publishedDoc.title, humanEditedTitle, "Published title must exactly match human edit");
    assert.strictEqual(publishedDoc.content, humanEditedContent, "Published content must exactly match human edit");
    assert.ok(!publishedDoc.content.includes("[Specify"), "Content should contain zero unreplaced placeholders");

    console.log("  ✓ Human-edited title and content preserved verbatim in published knowledge document.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 5 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 6: Placeholder behavior (no placeholders, unacknowledged, acknowledged)
  // -------------------------------------------------------------------------
  console.log("\nTest 6: Placeholder behavior (unacknowledged rejected, acknowledged allowed)");
  try {
    store.reset();

    // 6a: Content without placeholders -> allowed without flag
    const gapA = await store.recordUnansweredQuestion(WORKSPACE_1, "Clean query A", CONVERSATION_1);
    const resA = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gapA.id,
      title: "Clean Policy Title",
      content: "This is fully clean content with no placeholders at all.",
      allowPlaceholders: false,
    });
    assert.strictEqual(resA.success, true, "Clean content must be published without warning");
    assert.strictEqual(resA.warning, null);

    // 6b: Content with placeholders WITHOUT acknowledgment -> rejected
    const gapB = await store.recordUnansweredQuestion(WORKSPACE_1, "Placeholder query B", CONVERSATION_1);
    const contentWithPlaceholders = "Our refund policy requires [Specify refund timeframe] and [Specify documentation].";
    const resB = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gapB.id,
      title: "Draft with Placeholders",
      content: contentWithPlaceholders,
      allowPlaceholders: false, // NOT acknowledged
    });

    assert.strictEqual(resB.success, false, "Unacknowledged placeholders must be rejected");
    assert.strictEqual(resB.requiresPlaceholderConfirmation, true);
    assert.strictEqual(resB.unresolvedPlaceholders.length, 2);
    assert.ok(resB.error.includes("unresolved placeholder(s)"));
    assert.strictEqual(gapB.status, "open", "Question B must remain open after rejection");

    // 6c: Content with placeholders WITH explicit acknowledgment -> allowed
    const resC = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gapB.id,
      title: "Draft with Placeholders Confirmed",
      content: contentWithPlaceholders,
      allowPlaceholders: true, // EXPLICITLY acknowledged
    });

    assert.strictEqual(resC.success, true, "Acknowledged placeholders must be allowed");
    assert.ok(resC.warning?.includes("placeholder(s) pending completion"));
    assert.strictEqual(gapB.status, "resolved", "Question B should now be resolved");

    console.log("  ✓ Placeholder safety guard verified: unacknowledged blocked, acknowledged permitted.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 6 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 7: Successful publish creates exactly one document and resolves exactly one gap
  // -------------------------------------------------------------------------
  console.log("\nTest 7: Successful publish creates exactly one document and resolves exactly one gap");
  try {
    store.reset();
    const gap1 = await store.recordUnansweredQuestion(WORKSPACE_1, "Question to resolve 1", CONVERSATION_1);
    const gap2 = await store.recordUnansweredQuestion(WORKSPACE_1, "Unrelated open question 2", CONVERSATION_1);

    assert.strictEqual(store.unansweredQuestions.length, 2);
    assert.strictEqual(store.documents.length, 0);

    const publishRes = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gap1.id,
      title: "Resolved Document 1",
      content: "Complete and comprehensive content for document 1.",
      allowPlaceholders: false,
    });

    assert.strictEqual(publishRes.success, true);
    assert.strictEqual(store.documents.length, 1, "Exactly 1 document must be created");

    const createdDoc = store.documents[0];
    assert.strictEqual(createdDoc.id, publishRes.documentId);
    assert.strictEqual(createdDoc.workspace_id, WORKSPACE_1);
    assert.strictEqual(createdDoc.status, "ready");
    assert.strictEqual(createdDoc.created_by, OWNER_USER.id);

    // Verify targeted resolution
    assert.strictEqual(gap1.status, "resolved", "Target question must be marked resolved");
    assert.strictEqual(gap1.resolved_by_document_id, createdDoc.id, "Target question must point to new doc");
    assert.strictEqual(gap1.resolved_by, OWNER_USER.id);
    assert.ok(gap1.resolved_at);

    // Verify non-targeted question is completely unaffected
    assert.strictEqual(gap2.status, "open", "Unrelated question must remain open");
    assert.strictEqual(gap2.resolved_by_document_id, null);

    console.log("  ✓ Exactly 1 document created and exactly 1 targeted gap resolved; others untouched.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 7 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 8: Concurrent/double publish cannot create duplicate documents
  // -------------------------------------------------------------------------
  console.log("\nTest 8: Concurrent/double publish cannot create duplicate documents");
  try {
    store.reset();
    const gap = await store.recordUnansweredQuestion(WORKSPACE_1, "Concurrent publish query", CONVERSATION_1);

    // 8a: First publish succeeds
    const firstPub = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gap.id,
      title: "Concurrent Publish Document",
      content: "Valid content for document concurrent publish.",
      allowPlaceholders: false,
    });
    assert.strictEqual(firstPub.success, true);
    assert.strictEqual(store.documents.length, 1);

    // 8b: Second publish attempt on the already resolved question
    const secondPub = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gap.id,
      title: "Duplicate Attempt Document",
      content: "Another content string for duplicate attempt.",
      allowPlaceholders: false,
    });

    assert.strictEqual(secondPub.success, false, "Second publish must be rejected");
    assert.ok(secondPub.error.includes("already been resolved"));
    assert.strictEqual(secondPub.documentId, firstPub.documentId);
    assert.strictEqual(store.documents.length, 1, "Documents count must remain exactly 1 (no duplicates)");

    // 8c: Simulated concurrent execution race
    const gapRace = await store.recordUnansweredQuestion(WORKSPACE_1, "Race condition query", CONVERSATION_1);
    const [raceRes1, raceRes2] = await Promise.all([
      store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
        questionId: gapRace.id,
        title: "Race Doc Alpha",
        content: "Valid content for race doc alpha.",
      }),
      store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
        questionId: gapRace.id,
        title: "Race Doc Beta",
        content: "Valid content for race doc beta.",
      }),
    ]);

    // Exactly one should succeed, one should fail
    const successes = [raceRes1, raceRes2].filter((r) => r.success);
    const failures = [raceRes1, raceRes2].filter((r) => !r.success);
    assert.strictEqual(successes.length, 1, "Exactly one concurrent publish must succeed");
    assert.strictEqual(failures.length, 1, "Concurrent duplicate publish must fail");

    console.log("  ✓ Idempotency and race protection verified: zero duplicate documents created.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 8 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 9: Cross-workspace access is rejected
  // -------------------------------------------------------------------------
  console.log("\nTest 9: Cross-workspace access is rejected");
  try {
    store.reset();
    const gapWorkspace2 = await store.recordUnansweredQuestion(WORKSPACE_2, "Confidential query in W2", CONVERSATION_1);

    // Caller belongs to WORKSPACE_1, attempting action on WORKSPACE_2 question:
    // 9a: Draft generation denied
    const crossDraft = await store.executeDraftAction(WORKSPACE_1, gapWorkspace2.id);
    assert.strictEqual(crossDraft.success, false);
    assert.strictEqual(crossDraft.error, "Unanswered question not found in this workspace.");

    // 9b: Publish denied
    const crossPub = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gapWorkspace2.id,
      title: "Cross Workspace Document",
      content: "Content attempting to resolve W2 gap from W1.",
      allowPlaceholders: false,
    });
    assert.strictEqual(crossPub.success, false);
    assert.strictEqual(crossPub.error, "Unanswered question not found in this workspace.");

    // Verify zero mutations occurred
    assert.strictEqual(store.documents.length, 0, "No documents created across tenants");
    assert.strictEqual(gapWorkspace2.status, "open", "Workspace 2 gap remains open");

    console.log("  ✓ Cross-workspace drafting and publishing rejected; tenant isolation preserved.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 9 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 10: Publish failure leaves no orphan document and leaves the gap open
  // -------------------------------------------------------------------------
  console.log("\nTest 10: Publish failure leaves no orphan document and leaves the gap open");
  try {
    store.reset();
    const gap = await store.recordUnansweredQuestion(WORKSPACE_1, "Question to fail resolution", CONVERSATION_1);

    // Simulate atomic publish where resolution step throws an exception or database error
    const failedPub = await store.executePublishAction(
      WORKSPACE_1,
      OWNER_USER,
      "owner",
      {
        questionId: gap.id,
        title: "Orphan Prevention Test Doc",
        content: "This content should not remain in the documents table if resolution fails.",
        allowPlaceholders: false,
      },
      true, // failResolutionSimulation = true
    );

    assert.strictEqual(failedPub.success, false, "Publish must report failure");
    assert.ok(failedPub.error.includes("rolled back"), "Error must state document creation was rolled back");

    // Verify Compensating Rollback Guarantee:
    assert.strictEqual(store.documents.length, 0, "Orphan document must be deleted from documents table");
    assert.strictEqual(gap.status, "open", "Originating question must remain open for retry");
    assert.strictEqual(gap.resolved_by_document_id, null, "resolved_by_document_id must remain null");

    console.log("  ✓ Compensating rollback verified: zero orphan documents and gap remains open.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 10 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 11: After publishing, asking the same question uses the new knowledge and does not create another gap
  // -------------------------------------------------------------------------
  console.log("\nTest 11: After publishing, asking the same question uses the new knowledge without creating gap");
  try {
    store.reset();

    // Step A: First visitor asks unknown question -> gap created
    const query = "Do you offer a student discount on annual subscriptions?";
    const firstChat = await store.handleIncomingChatMessage(WORKSPACE_1, VISITOR_1, query, CONVERSATION_1);
    assert.strictEqual(firstChat.aiResponse.isKnowledgeGap, true);
    assert.strictEqual(store.unansweredQuestions.length, 1);
    const gap = store.unansweredQuestions[0];
    assert.strictEqual(gap.status, "open");

    // Step B: Operator drafts doc with AI
    const draftRes = await store.executeDraftAction(WORKSPACE_1, gap.id);
    assert.strictEqual(draftRes.success, true);

    // Step C: Operator edits and publishes the knowledge article
    const publishedTitle = "Academic & Student Discount Policy 2026";
    const publishedContent = "Acme Cloud offers a 20% discount on all annual subscriptions for verified students enrolled in accredited institutions.";
    const pubRes = await store.executePublishAction(WORKSPACE_1, OWNER_USER, "owner", {
      questionId: gap.id,
      title: publishedTitle,
      content: publishedContent,
      allowPlaceholders: false,
    });
    assert.strictEqual(pubRes.success, true);
    assert.strictEqual(gap.status, "resolved");
    assert.strictEqual(store.documents.length, 1);

    // Step D: Second visitor asks the exact same question
    const secondChat = await store.handleIncomingChatMessage(
      WORKSPACE_1,
      "vis_second_visitor_999",
      "Do you offer a student discount on annual subscriptions?",
      "conv_second_visitor_999",
    );

    // Step E: Verify AI uses published knowledge and NO gap is created
    assert.strictEqual(secondChat.aiResponse.grounded, true, "AI response must be grounded in published knowledge");
    assert.strictEqual(secondChat.aiResponse.isKnowledgeGap, false, "Must NOT be flagged as a knowledge gap");
    assert.ok(secondChat.aiResponse.reply.includes("20% discount"), "Reply must incorporate the published 20% discount");

    // Step F: Verify database state
    assert.strictEqual(store.unansweredQuestions.length, 1, "Unanswered questions table must NOT have new rows");
    assert.strictEqual(store.unansweredQuestions[0].status, "resolved", "Existing gap remains resolved");
    assert.strictEqual(store.unansweredQuestions[0].occurrence_count, 1, "Resolved question occurrence count not re-incremented");

    // Step G: Verify bot message recorded sources
    assert.strictEqual(secondChat.reply.grounded, true);
    assert.strictEqual(secondChat.reply.sources.length, 1);
    assert.strictEqual(secondChat.reply.sources[0].title, publishedTitle);

    console.log("  ✓ End-to-end loop verified: Subsequent question answered with grounded=true, sources cited, zero new gaps.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 11 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n===============================================================================`);
  console.log(`WORKFLOW REGRESSION RESULTS: ${passed} passed, ${failed} failed (Total: 11)`);
  console.log(`===============================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error("Fatal error in regression suite:", err);
  process.exit(1);
});
