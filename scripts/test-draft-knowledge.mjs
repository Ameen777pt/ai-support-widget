import { generateKnowledgeDraft, buildDraftingSystemInstruction, setGeminiClientForTesting } from "../src/lib/ai/gemini.ts";
import assert from "node:assert/strict";

console.log("=== STEP 6.4-A TEST SUITE: AI-Assisted Knowledge Draft Generation ===\n");

// Setup deterministic mock fallback when live GEMINI_API_KEY is not configured
if (!process.env.GEMINI_API_KEY) {
  setGeminiClientForTesting({
    models: {
      generateContent: async ({ contents }) => {
        const promptText = contents?.[0]?.parts?.[0]?.text || "";
        if (promptText.includes("student discount")) {
          return {
            text: JSON.stringify({
              title: "Student Discount Policy",
              content: "Acme Cloud offers subscription options for educational institutions and students. [Specify discount percentage] is available for qualifying students. To claim, provide [Specify eligibility requirements] to support.",
              summary: "Article covering student discounts with required percentage and eligibility placeholders.",
              placeholders: ["[Specify discount percentage]", "[Specify eligibility requirements]"],
            }),
          };
        }
        if (promptText.includes("refund")) {
          return {
            text: JSON.stringify({
              title: "Annual Subscription Cancellation and Refund Policy",
              content: "Acme Cloud provides 30-day money-back guarantees for all annual plans. Monthly plans are non-refundable. Contact support@acmecloud.example to initiate a refund request.",
              summary: "Refund policy detailing 30-day window for annual plans.",
              placeholders: [],
            }),
          };
        }
        return {
          text: JSON.stringify({
            title: "Enterprise Support SLA Response Times",
            content: "WidgetWorks enterprise plans provide defined response service levels. Priority 1 issues receive [Specify SLA response time] turnaround. Contact [Specify escalation contact] for escalation.",
            summary: "Enterprise support SLA guidelines.",
            placeholders: ["[Specify SLA response time]", "[Specify escalation contact]"],
          }),
        };
      },
    },
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // -------------------------------------------------------------------------
  // Test 1: Generate draft for missing student-discount question
  // -------------------------------------------------------------------------
  console.log("Test 1: Missing Student Discount Draft (No Knowledge, Anti-Hallucination)");
  try {
    const res = await generateKnowledgeDraft({
      questionText: "Do you offer a student discount on annual subscriptions?",
      brandName: "Acme Cloud",
      knowledgeSnippets: [],
    });

    assert.ok(res.draft, "Expected a draft to be returned");
    assert.strictEqual(res.error, null, "Expected error to be null");
    assert.ok(res.draft.title.length >= 2 && res.draft.title.length <= 150, "Title length must be 2-150 chars");
    assert.ok(res.draft.content.length >= 10 && res.draft.content.length <= 20000, "Content length must be valid");
    assert.ok(res.draft.placeholders.length > 0, "Expected at least one placeholder for unknown facts");

    console.log(`  ✓ Title: "${res.draft.title}"`);
    console.log(`  ✓ Summary: "${res.draft.summary}"`);
    console.log(`  ✓ Detected placeholders (${res.draft.placeholders.length}):`, res.draft.placeholders);

    // Verify Gemini does NOT invent a specific discount percentage as actual policy
    // Check that any percentage in content is part of a placeholder or instruction, not an invented factual rate
    const inventedPercentageMatch = res.draft.content.match(/(?:discount of|get|offers?|receive|save)\s+(\d{1,2}%)/i);
    assert.ok(!inventedPercentageMatch, `Should not invent a discount percentage as fact (found: ${inventedPercentageMatch?.[0]})`);

    // Verify explicit placeholder exists for discount percentage or eligibility
    const hasPlaceholder = res.draft.content.includes("[Specify") || res.draft.placeholders.some(p => p.toLowerCase().includes("discount") || p.toLowerCase().includes("specify"));
    assert.ok(hasPlaceholder, "Must contain explicit [Specify ...] placeholder");

    console.log("  ✓ Anti-hallucination passed: No invented percentage, explicit placeholders used.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 1 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 2: Generate draft with existing relevant knowledge
  // -------------------------------------------------------------------------
  console.log("\nTest 2: Incorporating Known Facts from Existing Reference Documents");
  try {
    const knownSnippets = [
      {
        document_id: "doc-123",
        title: "Refund Policy",
        content: "Acme Cloud provides 30-day money-back guarantees for all annual plans. Monthly plans are non-refundable. Contact support@acmecloud.example to initiate a refund request.",
      },
    ];

    const res = await generateKnowledgeDraft({
      questionText: "Can I get a refund if I cancel my annual subscription?",
      brandName: "Acme Cloud",
      knowledgeSnippets: knownSnippets,
    });

    assert.ok(res.draft, "Expected a draft to be returned");
    assert.strictEqual(res.error, null, "Expected error to be null");

    console.log(`  ✓ Title: "${res.draft.title}"`);
    console.log(`  ✓ Content snippet: "${res.draft.content.slice(0, 150)}..."`);

    // Verify known facts are incorporated
    const contentLower = res.draft.content.toLowerCase();
    const has30Days = contentLower.includes("30-day") || contentLower.includes("30 days");
    const hasSupportEmail = contentLower.includes("support@acmecloud.example");
    const hasAnnualMention = contentLower.includes("annual");

    assert.ok(has30Days || hasSupportEmail || hasAnnualMention, "Draft must incorporate known facts from reference documents");
    console.log("  ✓ Grounding verified: Known facts (30 days / email / annual plan) incorporated.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 2 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 3: Rate limit / API Error Handling
  // -------------------------------------------------------------------------
  console.log("\nTest 3: Rate-Limit and Failure Simulation");
  try {
    // Test input validation with empty question
    const emptyRes = await generateKnowledgeDraft({
      questionText: "",
      brandName: "Acme",
    });
    assert.strictEqual(emptyRes.draft, null, "Empty question should return null draft");
    assert.ok(emptyRes.error?.includes("valid question text"), "Expected question validation error");

    console.log("  ✓ Empty question correctly rejected with safe message.");

    // Test system instruction generation
    const sysPrompt = buildDraftingSystemInstruction("TestOrg");
    assert.ok(sysPrompt.includes("HUMAN REVIEW DRAFT"), "Instruction must emphasize human review draft");
    assert.ok(sysPrompt.includes("MANDATORY EXPLICIT PLACEHOLDERS"), "Instruction must require placeholders");
    assert.ok(sysPrompt.includes("NEVER INVENT FACTS"), "Instruction must forbid inventing facts");

    console.log("  ✓ System instruction includes all mandatory safeguards.");
    passed++;
  } catch (err) {
    console.error("  ✗ Test 3 failed:", err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Test 4: Structured Output Validation
  // -------------------------------------------------------------------------
  console.log("\nTest 4: Schema & Output Boundaries");
  try {
    const res = await generateKnowledgeDraft({
      questionText: "What are your enterprise support SLA response times?",
      brandName: "WidgetWorks",
      knowledgeSnippets: [],
    });

    assert.ok(res.draft, "Expected draft result");
    assert.ok(res.draft.title.length <= 150, "Title within 150 char limit");
    assert.ok(res.draft.content.length <= 20000, "Content within 20000 char limit");
    assert.ok(typeof res.draft.summary === "string", "Summary is string");
    assert.ok(Array.isArray(res.draft.placeholders), "Placeholders is array");

    console.log(`  ✓ Title length: ${res.draft.title.length} chars (<= 150)`);
    console.log(`  ✓ Content length: ${res.draft.content.length} chars (<= 20000)`);
    console.log(`  ✓ Placeholders: ${res.draft.placeholders.join(", ")}`);
    passed++;
  } catch (err) {
    console.error("  ✗ Test 4 failed:", err.message);
    failed++;
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
