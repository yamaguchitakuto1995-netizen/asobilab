import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mdToPdf from "md-to-pdf";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manualDir = join(root, "docs/取扱説明書");
const pdfDir = join(manualDir, "pdf");
const cssPath = join(manualDir, "styles/manual.css");

const targets: { input: string; output: string }[] = [
  { input: "README.md", output: "00-目次・用語集.pdf" },
  { input: "01-管理者用.md", output: "01-管理者用.pdf" },
  { input: "02-スタッフ用.md", output: "02-スタッフ用.pdf" },
  { input: "03-保護者用.md", output: "03-保護者用.pdf" },
];

async function main() {
  mkdirSync(pdfDir, { recursive: true });

  for (const { input, output } of targets) {
    const inputPath = join(manualDir, input);
    const outputPath = join(pdfDir, output);
    process.stdout.write(`Generating ${output} … `);

    await mdToPdf(
      { path: inputPath },
      {
        dest: outputPath,
        css: cssPath,
        pdf_options: {
          format: "A4",
          printBackground: true,
          margin: { top: "18mm", right: "16mm", bottom: "20mm", left: "16mm" },
        },
        launch_options: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      }
    );

    process.stdout.write("done\n");
  }

  console.log(`\nPDF files written to:\n  ${pdfDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
