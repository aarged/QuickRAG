import { indexAllDefaults } from "./seed-defaults";

async function seed() {
  const failures = await indexAllDefaults();
  if (failures.length > 0) {
    console.error(`\nFailed to index: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\nAll default documents processed.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("ChromaDB seed failed:", err);
  process.exit(1);
});
