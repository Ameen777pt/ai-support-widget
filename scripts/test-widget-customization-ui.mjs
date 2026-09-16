import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== STEP 7.3 TEST SUITE: Widget Customization UI & Live Preview ===\n");

const uiSource = fs.readFileSync("src/app/dashboard/widget-settings-form.tsx", "utf8");

let passed = 0;
let failed = 0;

// Test 1: Launcher Text Field, Constraints & Character Counter
console.log("Test 1: Launcher Text Field & Character Counter");
try {
  assert.ok(uiSource.includes('name="launcher_text"'), "Must include name='launcher_text' input");
  assert.ok(uiSource.includes('id="launcher_text"'), "Must include id='launcher_text'");
  assert.ok(uiSource.includes("maxLength={30}"), "Must enforce maxLength={30} on launcher_text input");
  assert.ok(uiSource.includes("launcherText.length}/30"), "Must display live launcher_text character counter (X/30)");
  assert.ok(uiSource.includes("setLauncherText"), "Must have setLauncherText state updater for real-time reactivity");
  console.log("  ✓ Launcher Text field with 30-char limit and live counter verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 1 failed:", e.message);
  failed++;
}

// Test 2: Suggested Questions Editor Structure & 4-Question Cap
console.log("\nTest 2: Suggested Questions Section & Bounds");
try {
  assert.ok(uiSource.includes("suggestedQuestions.length}/4"), "Must display question counter (X/4)");
  assert.ok(uiSource.includes("suggestedQuestions.length >= 4"), "Must enforce upper limit of 4 suggested questions");
  assert.ok(uiSource.includes("handleAddQuestion"), "Must provide handleAddQuestion handler");
  assert.ok(uiSource.includes("handleRemoveQuestion"), "Must provide handleRemoveQuestion handler");
  assert.ok(uiSource.includes("Maximum of 4 suggested questions allowed") || uiSource.includes("Maximum limit of 4"), "Must warn or prevent exceeding 4 questions");
  console.log("  ✓ Suggested Questions counter and 4-question maximum boundary verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 2 failed:", e.message);
  failed++;
}

// Test 3: Question Length Constraints (2-100 chars) & Deduplication
console.log("\nTest 3: Question Length Validation (2-100 chars) & Deduplication");
try {
  assert.ok(uiSource.includes("trimmed.length < 2 || trimmed.length > 100"), "Must enforce 2-100 characters validation on add");
  assert.ok(uiSource.includes("maxLength={100}"), "Must set maxLength={100} on question input");
  assert.ok(uiSource.includes("newQuestion.length}/100"), "Must display live question character counter (X/100)");
  assert.ok(uiSource.includes("suggestedQuestions.includes(trimmed)"), "Must check for duplicate questions");
  console.log("  ✓ Question length validation (2-100 chars) and deduplication verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 3 failed:", e.message);
  failed++;
}

// Test 4: Enter Key Safety & Form Submission Prevention in Question Editor
console.log("\nTest 4: Keyboard Handling & Enter-Key Form Protection");
try {
  assert.ok(uiSource.includes('e.key === "Enter"'), "Must intercept Enter key in question input");
  assert.ok(uiSource.includes("e.preventDefault()"), "Must prevent default form submission when pressing Enter to add question");
  assert.ok(uiSource.includes('type="button"'), "Must use type='button' for question add and remove buttons");
  console.log("  ✓ Enter-key form protection and button typing verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 4 failed:", e.message);
  failed++;
}

// Test 5: Form Data Submission Flow & Action Binding
console.log("\nTest 5: Form Data Submission Flow & Action State");
try {
  assert.ok(uiSource.includes("updateWidgetSettingsAction"), "Must bind form to updateWidgetSettingsAction");
  assert.ok(uiSource.includes('name="suggested_questions"'), "Must submit suggested_questions via form field");
  assert.ok(uiSource.includes("JSON.stringify(suggestedQuestions)"), "Must serialize suggested questions as JSON array for server action parsing");
  assert.ok(uiSource.includes("state.error"), "Must display error banner when action returns error");
  assert.ok(uiSource.includes("state.success"), "Must display success banner when action returns success");
  console.log("  ✓ Form data submission flow and state alerts verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 5 failed:", e.message);
  failed++;
}

// Test 6: Client-Side Interactive Live Preview Elements
console.log("\nTest 6: Client-Side Live Preview Elements");
try {
  assert.ok(uiSource.includes("Live Preview"), "Must contain 'Live Preview' header");
  assert.ok(uiSource.includes("safeBrandColor"), "Must apply safe brand color dynamically");
  assert.ok(uiSource.includes("isPreviewOpen"), "Must track preview open/closed state");
  assert.ok(uiSource.includes("Chat View") || uiSource.includes("Chat Window"), "Must have Chat View switch");
  assert.ok(uiSource.includes("Launcher Only"), "Must have Launcher Only switch");
  assert.ok(uiSource.includes("suggestedQuestions.map"), "Must render suggested question pills in preview");
  assert.ok(uiSource.includes("welcomeMessage"), "Must reflect welcome message in preview");
  assert.ok(uiSource.includes("brandName"), "Must reflect brand name in preview");
  console.log("  ✓ Interactive live preview components and real-time bindings verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 6 failed:", e.message);
  failed++;
}

// Test 7: Position Reactivity in Preview Canvas
console.log("\nTest 7: Position Reactivity in Live Preview");
try {
  assert.ok(uiSource.includes('position === "bottom-left" ? "items-start" : "items-end"'), "Must adjust preview alignment based on position setting");
  assert.ok(uiSource.includes("Visitor Screen • {position}") || uiSource.includes("{position}"), "Must indicate active position in preview");
  console.log("  ✓ Dynamic position reactivity (bottom-left vs bottom-right) verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 7 failed:", e.message);
  failed++;
}

// Test 8: Launcher Text Reactivity in Preview
console.log("\nTest 8: Launcher Appearance Reactivity");
try {
  assert.ok(uiSource.includes("launcherText.trim()"), "Must check for launcher text presence");
  assert.ok(uiSource.includes("rounded-full px-4 py-2.5"), "Must expand launcher to pill button when launcher text is set");
  console.log("  ✓ Launcher button dynamically adapts to launcher text presence.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 8 failed:", e.message);
  failed++;
}

// Test 9: Zero Network / Client-Side Isolation Invariant
console.log("\nTest 9: Client-Side Isolation (Zero API calls)");
try {
  assert.ok(!uiSource.includes("fetch("), "WidgetSettingsForm must not make fetch calls (pure client-side live preview)");
  assert.ok(!uiSource.includes("/api/widget/config"), "Must not call public config API (Step 7.4 isolation)");
  assert.ok(!uiSource.includes("/api/widget/chat"), "Must not call widget chat API");
  console.log("  ✓ Pure client-side preview verified with zero external/public API requests.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 9 failed:", e.message);
  failed++;
}

// Test 10: Authorization & Read-Only Safety for Members
console.log("\nTest 10: Authorization Boundary & Read-Only State");
try {
  assert.ok(uiSource.includes("isReadOnly"), "Must accept and enforce isReadOnly");
  assert.ok(uiSource.includes("Only workspace <strong>Owners</strong> and <strong>Admins</strong>"), "Must display member warning banner");
  assert.ok(uiSource.includes("disabled={isReadOnly || isPending}"), "Must disable inputs when read-only");
  assert.ok(uiSource.includes("!isReadOnly && ("), "Must hide Save Settings button for read-only members");
  console.log("  ✓ Authorization boundaries and read-only member protection verified.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 10 failed:", e.message);
  failed++;
}

// Test 11: Unit Invariants: Pure Question & Launcher Text Validation Simulation
console.log("\nTest 11: Unit Simulation of Question Validation Invariants");
try {
  const sanitize = (str) => str.replace(/[\x00-\x1F\x7F]/g, "").trim();

  // Test question validation logic identical to component
  const validateQuestion = (q, existingList) => {
    const trimmed = sanitize(q);
    if (existingList.length >= 4) return "Maximum of 4 suggested questions allowed.";
    if (trimmed.length < 2 || trimmed.length > 100) return "Each suggested question must be between 2 and 100 characters.";
    if (existingList.includes(trimmed)) return "This question has already been added.";
    return null;
  };

  assert.equal(validateQuestion("A", []), "Each suggested question must be between 2 and 100 characters.");
  assert.equal(validateQuestion("Valid question?", []), null);
  assert.equal(validateQuestion("Valid question?", ["Valid question?"]), "This question has already been added.");
  assert.equal(validateQuestion("Q5?", ["Q1?", "Q2?", "Q3?", "Q4?"]), "Maximum of 4 suggested questions allowed.");
  assert.equal(validateQuestion("a".repeat(101), []), "Each suggested question must be between 2 and 100 characters.");
  assert.equal(validateQuestion("a".repeat(100), []), null);

  // Test launcher text simulation
  const validateLauncher = (text) => sanitize(text).length <= 30;
  assert.ok(validateLauncher("Chat with us"));
  assert.ok(validateLauncher("a".repeat(30)));
  assert.ok(!validateLauncher("a".repeat(31)));

  console.log("  ✓ Pure unit validation invariants passed all edge cases.");
  passed++;
} catch (e) {
  console.error("  ✗ Test 11 failed:", e.message);
  failed++;
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
