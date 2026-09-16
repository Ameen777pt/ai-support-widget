import { spawnSync } from "node:child_process";

console.log("===============================================================================");
console.log("RUNNING COMPLETE AUTOMATED TEST SUITE FOR AI-SUPPORT-WIDGET");
console.log("===============================================================================\n");

const testFiles = [
  { name: "Step 6.4-A: Action Security & Tenant Boundary", file: "scripts/test-action-security.mjs", useStripTypes: false },
  { name: "Step 6.4-A: AI Draft Generation Logic", file: "scripts/test-draft-knowledge.mjs", useStripTypes: true },
  { name: "Step 6.4-B: AI Draft Review & Editor UI", file: "scripts/test-draft-ui.mjs", useStripTypes: false },
  { name: "Step 6.4-C: Publish Knowledge Draft & Resolve Gap", file: "scripts/test-publish-knowledge.mjs", useStripTypes: false },
  { name: "Regression: Complete Unknown-Question-to-Publish Workflow", file: "scripts/test-workflow-regression.mjs", useStripTypes: true },
  { name: "Step 7.2: Widget Customization Server Action & Data Flow", file: "scripts/test-widget-customization-settings.mjs", useStripTypes: false },
  { name: "Step 7.3: Widget Customization UI & Live Preview", file: "scripts/test-widget-customization-ui.mjs", useStripTypes: false },
  { name: "Step 7.4: Public Widget Customization Integration", file: "scripts/test-widget-customization-public.mjs", useStripTypes: false },
];

let allPassed = true;
const summary = [];

for (const suite of testFiles) {
  console.log(`\n>>> Running: ${suite.name} (${suite.file}) ...`);
  const args = suite.useStripTypes
    ? ["--experimental-strip-types", suite.file]
    : [suite.file];

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });

  if (result.status === 0) {
    summary.push({ suite: suite.name, status: "PASSED" });
  } else {
    summary.push({ suite: suite.name, status: "FAILED" });
    allPassed = false;
  }
}

console.log("\n===============================================================================");
console.log("ALL TEST SUITES SUMMARY:");
console.log("===============================================================================");
for (const s of summary) {
  console.log(`- [${s.status}] ${s.suite}`);
}
console.log("===============================================================================");

if (!allPassed) {
  process.exit(1);
} else {
  console.log("ALL TEST SUITES COMPLETED SUCCESSFULLY!\n");
}
