import assert from "node:assert/strict";
import fs from "node:fs";

console.log("===============================================================================");
console.log("STEP 7.2 TEST SUITE: WIDGET CUSTOMIZATION SERVER ACTION & DATA FLOW");
console.log("===============================================================================\n");

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// -----------------------------------------------------------------------------
// Pure Server Action Validation Logic (Mirrors src/app/actions/settings.ts)
// -----------------------------------------------------------------------------
function validateSettingsForm(role, formData, sessionWorkspaceId) {
  // 1. Authorization check: owner or admin only
  if (role !== "owner" && role !== "admin") {
    return { error: "Forbidden: Only workspace owners and admins can modify widget settings." };
  }

  const brandName = (formData.get("brand_name") || "")?.trim();
  const brandColor = (formData.get("brand_color") || "#0F172A")?.trim();
  const welcomeMessage = (formData.get("welcome_message") || "")?.trim();
  const rawLogoUrl = (formData.get("logo_url") || "")?.trim();
  const position = (formData.get("position") || "bottom-right")?.trim();

  // Validate Brand Name
  if (!brandName || brandName.length < 1 || brandName.length > 60) {
    return { error: "Brand name must be between 1 and 60 characters." };
  }

  // Validate Brand Color
  if (!HEX_COLOR_REGEX.test(brandColor)) {
    return { error: "Brand color must be a valid 3-digit or 6-digit hex code (e.g. #0F172A)." };
  }

  // Validate Welcome Message
  if (!welcomeMessage || welcomeMessage.length < 1 || welcomeMessage.length > 500) {
    return { error: "Welcome message must be between 1 and 500 characters." };
  }

  // Validate Position
  if (position !== "bottom-right" && position !== "bottom-left") {
    return { error: "Position must be either 'bottom-right' or 'bottom-left'." };
  }

  // Validate Logo URL if provided
  let logoUrl = null;
  if (rawLogoUrl.length > 0) {
    try {
      const parsed = new URL(rawLogoUrl);
      if (parsed.protocol !== "https:") {
        return { error: "Logo URL must use a secure HTTPS address (e.g. https://...)." };
      }
      logoUrl = rawLogoUrl;
    } catch {
      return { error: "Please enter a valid URL for the logo." };
    }
  }

  // Validate Launcher Text if provided
  let launcherText = "";
  if (formData.has("launcher_text")) {
    const rawLauncherText = formData.get("launcher_text") ?? "";
    launcherText = rawLauncherText.replace(/[\x00-\x1F\x7F]/g, "").trim();
    if (launcherText.length > 30) {
      return { error: "Launcher text must be at most 30 characters." };
    }
  }

  // Validate Suggested Questions if provided
  let suggestedQuestions = [];
  const hasSuggestedQuestions =
    formData.has("suggested_questions") || formData.has("suggested_questions[]");

  if (hasSuggestedQuestions) {
    const rawEntries = [
      ...formData.getAll("suggested_questions"),
      ...formData.getAll("suggested_questions[]"),
    ];

    const candidates = [];
    for (const entry of rawEntries) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === "string") {
                candidates.push(item);
              }
            }
            continue;
          }
        } catch {
          // Fallback to literal
        }
      }

      if (trimmed.includes("\n")) {
        for (const line of trimmed.split("\n")) {
          if (line.trim().length > 0) {
            candidates.push(line);
          }
        }
        continue;
      }

      candidates.push(trimmed);
    }

    if (candidates.length > 4) {
      return { error: "You can specify a maximum of 4 suggested questions." };
    }

    for (const rawQ of candidates) {
      const cleaned = rawQ.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (cleaned.length < 2 || cleaned.length > 100) {
        return {
          error: "Each suggested question must be between 2 and 100 characters.",
        };
      }
      suggestedQuestions.push(cleaned);
    }
  }

  return {
    success: true,
    data: {
      workspace_id: sessionWorkspaceId, // strictly derived from session
      brand_name: brandName,
      brand_color: brandColor,
      welcome_message: welcomeMessage,
      logo_url: logoUrl,
      position,
      launcher_text: launcherText,
      suggested_questions: suggestedQuestions,
    },
  };
}

// -----------------------------------------------------------------------------
// Test Execution
// -----------------------------------------------------------------------------
async function runTests() {
  let passed = 0;
  let failed = 0;

  function makeBaseForm() {
    const fd = new Map();
    fd.set("brand_name", ["Acme Support"]);
    fd.set("brand_color", ["#0F172A"]);
    fd.set("welcome_message", ["Hi there! How can we help?"]);
    fd.set("position", ["bottom-right"]);
    return {
      get(k) {
        const arr = fd.get(k);
        return arr ? arr[0] : null;
      },
      getAll(k) {
        return fd.get(k) || [];
      },
      has(k) {
        return fd.has(k);
      },
      set(k, val) {
        fd.set(k, Array.isArray(val) ? val : [val]);
      },
      append(k, val) {
        const existing = fd.get(k) || [];
        existing.push(val);
        fd.set(k, existing);
      },
    };
  }

  const SESSION_WS_ID = "11111111-1111-1111-1111-111111111111";

  // Test 1: Valid launcher_text
  console.log("Test 1: Valid launcher_text accepted");
  try {
    const form = makeBaseForm();
    form.set("launcher_text", "Chat with us");
    const res = validateSettingsForm("owner", form, SESSION_WS_ID);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.launcher_text, "Chat with us");
    console.log("  ✓ Valid launcher_text accepted:", res.data.launcher_text);
    passed++;
  } catch (e) {
    console.error("  ✗ Test 1 failed:", e.message);
    failed++;
  }

  // Test 2: launcher_text > 30 chars rejected
  console.log("\nTest 2: launcher_text > 30 chars rejected");
  try {
    const form = makeBaseForm();
    form.set("launcher_text", "This launcher text is way too long to fit");
    const res = validateSettingsForm("owner", form, SESSION_WS_ID);

    assert.strictEqual(res.success, undefined);
    assert.strictEqual(res.error, "Launcher text must be at most 30 characters.");
    console.log("  ✓ Long launcher_text correctly rejected with error:", res.error);
    passed++;
  } catch (e) {
    console.error("  ✗ Test 2 failed:", e.message);
    failed++;
  }

  // Test 3: Valid suggested questions
  console.log("\nTest 3: Valid suggested questions accepted");
  try {
    const form = makeBaseForm();
    form.set("suggested_questions", [
      "What are your support hours?",
      "How do I request a refund?",
      "Can I change my plan?",
    ]);
    const res = validateSettingsForm("admin", form, SESSION_WS_ID);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.suggested_questions.length, 3);
    assert.strictEqual(res.data.suggested_questions[0], "What are your support hours?");
    console.log("  ✓ Valid suggested questions accepted (3 items):", res.data.suggested_questions);
    passed++;
  } catch (e) {
    console.error("  ✗ Test 3 failed:", e.message);
    failed++;
  }

  // Test 4: >4 questions rejected
  console.log("\nTest 4: >4 questions rejected");
  try {
    const form = makeBaseForm();
    form.set("suggested_questions", ["Q1 valid", "Q2 valid", "Q3 valid", "Q4 valid", "Q5 too many"]);
    const res = validateSettingsForm("owner", form, SESSION_WS_ID);

    assert.strictEqual(res.success, undefined);
    assert.strictEqual(res.error, "You can specify a maximum of 4 suggested questions.");
    console.log("  ✓ >4 questions rejected with error:", res.error);
    passed++;
  } catch (e) {
    console.error("  ✗ Test 4 failed:", e.message);
    failed++;
  }

  // Test 5: Question <2 chars rejected
  console.log("\nTest 5: Question <2 chars rejected");
  try {
    const form = makeBaseForm();
    form.set("suggested_questions", ["?", "Valid question"]);
    const res = validateSettingsForm("owner", form, SESSION_WS_ID);

    assert.strictEqual(res.success, undefined);
    assert.strictEqual(res.error, "Each suggested question must be between 2 and 100 characters.");
    console.log("  ✓ Question <2 chars rejected with error:", res.error);
    passed++;
  } catch (e) {
    console.error("  ✗ Test 5 failed:", e.message);
    failed++;
  }

  // Test 6: Question >100 chars rejected
  console.log("\nTest 6: Question >100 chars rejected");
  try {
    const form = makeBaseForm();
    form.set("suggested_questions", ["A".repeat(101)]);
    const res = validateSettingsForm("owner", form, SESSION_WS_ID);

    assert.strictEqual(res.success, undefined);
    assert.strictEqual(res.error, "Each suggested question must be between 2 and 100 characters.");
    console.log("  ✓ Question >100 chars rejected with error:", res.error);
    passed++;
  } catch (e) {
    console.error("  ✗ Test 6 failed:", e.message);
    failed++;
  }

  // Test 7: Whitespace normalization & control char stripping
  console.log("\nTest 7: Whitespace normalization and control characters");
  try {
    const form = makeBaseForm();
    form.set("launcher_text", "   \x00Need Help?\x07   ");
    form.set("suggested_questions", [
      "   What are your hours?   ",
      "\x02Pricing details\x1F",
    ]);
    const res = validateSettingsForm("owner", form, SESSION_WS_ID);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.launcher_text, "Need Help?");
    assert.strictEqual(res.data.suggested_questions[0], "What are your hours?");
    assert.strictEqual(res.data.suggested_questions[1], "Pricing details");
    console.log("  ✓ Whitespace trimmed and control chars stripped safely.");
    passed++;
  } catch (e) {
    console.error("  ✗ Test 7 failed:", e.message);
    failed++;
  }

  // Test 8: Owner/admin authorization allowed
  console.log("\nTest 8: Owner and admin authorization allowed");
  try {
    const formOwner = makeBaseForm();
    const resOwner = validateSettingsForm("owner", formOwner, SESSION_WS_ID);
    assert.strictEqual(resOwner.success, true);

    const formAdmin = makeBaseForm();
    const resAdmin = validateSettingsForm("admin", formAdmin, SESSION_WS_ID);
    assert.strictEqual(resAdmin.success, true);

    console.log("  ✓ Both owner and admin roles permitted to update settings.");
    passed++;
  } catch (e) {
    console.error("  ✗ Test 8 failed:", e.message);
    failed++;
  }

  // Test 9: Member rejection
  console.log("\nTest 9: Member rejection");
  try {
    const formMember = makeBaseForm();
    const resMember = validateSettingsForm("member", formMember, SESSION_WS_ID);
    assert.strictEqual(resMember.success, undefined);
    assert.strictEqual(resMember.error, "Forbidden: Only workspace owners and admins can modify widget settings.");

    console.log("  ✓ Member role strictly forbidden from modifying settings.");
    passed++;
  } catch (e) {
    console.error("  ✗ Test 9 failed:", e.message);
    failed++;
  }

  // Test 10: Cross-workspace isolation
  console.log("\nTest 10: Cross-workspace isolation (session-derived workspace)");
  try {
    const form = makeBaseForm();
    // Even if client attempts to inject an unauthorized workspace_id
    form.set("workspace_id", "malicious-foreign-workspace-id");
    const res = validateSettingsForm("owner", form, SESSION_WS_ID);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.workspace_id, SESSION_WS_ID, "Must strictly use session workspace ID");
    console.log("  ✓ Client workspace_id ignored; session workspace strictly enforced.");
    passed++;
  } catch (e) {
    console.error("  ✗ Test 10 failed:", e.message);
    failed++;
  }

  // Test 11: Existing settings validation still works
  console.log("\nTest 11: Existing settings validation preserved");
  try {
    // 11a: Invalid brand_name
    const formShortBrand = makeBaseForm();
    formShortBrand.set("brand_name", "");
    assert.strictEqual(validateSettingsForm("owner", formShortBrand, SESSION_WS_ID).error, "Brand name must be between 1 and 60 characters.");

    // 11b: Invalid brand_color
    const formBadColor = makeBaseForm();
    formBadColor.set("brand_color", "not-a-color");
    assert.strictEqual(validateSettingsForm("owner", formBadColor, SESSION_WS_ID).error, "Brand color must be a valid 3-digit or 6-digit hex code (e.g. #0F172A).");

    // 11c: Invalid welcome_message
    const formBadWelcome = makeBaseForm();
    formBadWelcome.set("welcome_message", "");
    assert.strictEqual(validateSettingsForm("owner", formBadWelcome, SESSION_WS_ID).error, "Welcome message must be between 1 and 500 characters.");

    // 11d: Invalid position
    const formBadPos = makeBaseForm();
    formBadPos.set("position", "top-middle");
    assert.strictEqual(validateSettingsForm("owner", formBadPos, SESSION_WS_ID).error, "Position must be either 'bottom-right' or 'bottom-left'.");

    // 11e: Invalid logo_url (HTTP or invalid)
    const formHttpLogo = makeBaseForm();
    formHttpLogo.set("logo_url", "http://insecure.com/logo.png");
    assert.strictEqual(validateSettingsForm("owner", formHttpLogo, SESSION_WS_ID).error, "Logo URL must use a secure HTTPS address (e.g. https://...).");

    console.log("  ✓ All existing validations (brand_name, brand_color, welcome_message, position, logo_url) preserved.");
    passed++;
  } catch (e) {
    console.error("  ✗ Test 11 failed:", e.message);
    failed++;
  }

  // Test 12: Source code static invariant verification
  console.log("\nTest 12: Source code static invariants verification");
  try {
    const actionSource = fs.readFileSync("src/app/actions/settings.ts", "utf8");
    const pageSource = fs.readFileSync("src/app/dashboard/page.tsx", "utf8");
    const formSource = fs.readFileSync("src/app/dashboard/widget-settings-form.tsx", "utf8");

    // actionSource checks
    assert.ok(actionSource.includes("hasLauncherText"), "Action must check launcher_text");
    assert.ok(actionSource.includes("launcherText.length > 30"), "Action must enforce launcher_text <= 30");
    assert.ok(actionSource.includes("candidates.length > 4"), "Action must enforce max 4 questions");
    assert.ok(actionSource.includes("cleaned.length < 2 || cleaned.length > 100"), "Action must enforce question 2-100 chars");
    assert.ok(actionSource.includes("eq(\"workspace_id\", workspace.id)"), "Action must enforce workspace isolation");
    assert.ok(actionSource.includes("revalidatePath(\"/dashboard\")"), "Action must revalidate dashboard");

    // pageSource checks
    assert.ok(pageSource.includes("launcher_text, suggested_questions"), "Dashboard select query must include new fields");
    assert.ok(pageSource.includes("launcher_text: \"\""), "Dashboard fallback must default launcher_text");
    assert.ok(pageSource.includes("suggested_questions: []"), "Dashboard fallback must default suggested_questions");

    // formSource checks
    assert.ok(formSource.includes("launcher_text?: string"), "WidgetSettingsData must type launcher_text");
    assert.ok(formSource.includes("suggested_questions?: string[]"), "WidgetSettingsData must type suggested_questions");
    assert.ok(formSource.includes("name=\"launcher_text\""), "Form must have launcher_text input");
    assert.ok(formSource.includes("name=\"suggested_questions\""), "Form must have suggested_questions input");

    console.log("  ✓ All source code static invariants across action, page, and form verified.");
    passed++;
  } catch (e) {
    console.error("  ✗ Test 12 failed:", e.message);
    failed++;
  }

  console.log(`\n===============================================================================`);
  console.log(`STEP 7.2 RESULTS: ${passed} passed, ${failed} failed (Total: 12)`);
  console.log(`===============================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
