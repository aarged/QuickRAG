import { seedAllBooks } from "./seed-defaults";

async function seed() {
  const failures = await seedAllBooks({ dryRun: !!process.env.DRY_RUN, verbose: !!process.env.VERBOSE });
  if (failures.length > 0) {
    console.error(`\nFailed to seed: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\nAll done. Run seed-chromadb.ts to index new chunks into ChromaDB.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
