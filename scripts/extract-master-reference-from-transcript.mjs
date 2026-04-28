import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One-off helper: extract the pasted “Trailblaize Master Reference Dataset”
 * markdown from a Cursor agent-transcript .jsonl (user message line).
 *
 * Usage:
 *   node scripts/extract-master-reference-from-transcript.mjs <path-to.jsonl>
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const transcriptArg = process.argv[2];
if (!transcriptArg) {
  console.error(
    "Usage: node scripts/extract-master-reference-from-transcript.mjs <transcript.jsonl>",
  );
  process.exit(1);
}
const transcriptPath = path.isAbsolute(transcriptArg)
  ? transcriptArg
  : path.resolve(process.cwd(), transcriptArg);

const outPath = path.join(
  repoRoot,
  "data",
  "seeds",
  "sources",
  "TRAILBLAIZE_MASTER_REFERENCE_DATASET.md",
);

const lines = fs.readFileSync(transcriptPath, "utf8").split("\n");
const line = lines.find(
  (l) => l.includes('"role":"user"') && l.includes("Trailblaize Master Reference Dataset"),
);
if (!line) {
  console.error("User line with master reference not found in:", transcriptPath);
  process.exit(1);
}

const obj = JSON.parse(line);
const text = obj.message.content[0].text;
const re =
  /# Trailblaize Master Reference Dataset[\s\S]*?for Devin \(DB import\)\.\*/;
const m = text.match(re);
if (!m) {
  console.error("Regex did not match extracted user text.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, m[0], "utf8");
console.log("Wrote", outPath, "length", m[0].length);
