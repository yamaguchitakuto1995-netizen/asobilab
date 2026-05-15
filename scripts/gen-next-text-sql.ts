/**
 * courseNextText から Supabase 用の CHECK・schema・patches を更新する。
 * Usage: npm run gen:next-text-sql
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  PROGRAMMING_NEXT_TEXT_OPTIONS,
  ROBOT_NEXT_TEXT_OPTIONS,
  sqlQuoteLiteral,
} from "../src/lib/courseNextText";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../supabase/generated");

function arraySqlLines(values: readonly string[]): string {
  const lines = values.map((v) => `    ${sqlQuoteLiteral(v)}`);
  return `ARRAY[\n${lines.join(",\n")}\n]::text[]`;
}

function dumpTxt() {
  let s = "-- === ROBOT ===\n\n-- robot (" + ROBOT_NEXT_TEXT_OPTIONS.length + " values)\n";
  s += arraySqlLines(ROBOT_NEXT_TEXT_OPTIONS) + "\n\n";
  s +=
    "-- === PROGRAMMING ===\n\n-- programming (" +
    PROGRAMMING_NEXT_TEXT_OPTIONS.length +
    " values)\n";
  s += arraySqlLines(PROGRAMMING_NEXT_TEXT_OPTIONS) + "\n";
  writeFileSync(join(outDir, "course_next_text_arrays.txt"), s, "utf8");
}

function incRobot() {
  const arr = arraySqlLines(ROBOT_NEXT_TEXT_OPTIONS);
  const body = `next_text_robot is null
or next_text_robot = any (
${arr}
)`;
  writeFileSync(join(outDir, "students_next_text_robot_check.inc.sql"), body + "\n", "utf8");
}

function incProgramming() {
  const arr = arraySqlLines(PROGRAMMING_NEXT_TEXT_OPTIONS);
  const body = `next_text_programming is null
or next_text_programming = any (
${arr}
)`;
  writeFileSync(
    join(outDir, "students_next_text_programming_check.inc.sql"),
    body + "\n",
    "utf8"
  );
}

function indentBlock(s: string, spaces = 6): string {
  const p = " ".repeat(spaces);
  return s
    .split("\n")
    .map((line) => (line.trim() ? p + line : line))
    .join("\n");
}

function syncSchema() {
  const robotInc = readFileSync(
    join(outDir, "students_next_text_robot_check.inc.sql"),
    "utf8"
  ).trim();
  const progInc = readFileSync(
    join(outDir, "students_next_text_programming_check.inc.sql"),
    "utf8"
  ).trim();

  const robotBlock = `-- 次回テキスト（大枠[/ 周] / 単元）。再生成: npm run gen:next-text-sql
alter table public.students add column if not exists next_text_robot text;
do $$ begin
  alter table public.students add constraint students_next_text_robot_check
    check (
${indentBlock(robotInc, 6)}
    );
exception when duplicate_object then null; end $$;

alter table public.students add column if not exists next_text_programming text;
do $$ begin
  alter table public.students add constraint students_next_text_programming_check
    check (
${indentBlock(progInc, 6)}
    );
exception when duplicate_object then null; end $$;
`;

  const schemaPath = join(__dirname, "../supabase/schema.sql");
  let schema = readFileSync(schemaPath, "utf8");
  const startMarker = "-- 次回テキスト（";
  const start = schema.indexOf(startMarker);
  if (start < 0) {
    throw new Error("schema.sql: 次回テキストブロックの開始コメントが見つかりません");
  }
  const endMarker = "-- ------------------------------------------------------------\n-- 5.5) parent_student_links";
  const end = schema.indexOf(endMarker, start);
  if (end < 0) {
    throw new Error("schema.sql: parent_student_links マーカーが見つかりません");
  }
  schema = schema.slice(0, start) + robotBlock + "\n" + schema.slice(end);
  writeFileSync(schemaPath, schema, "utf8");
}

function partAfterFirstOr(s: string): string {
  const i = s.indexOf("or ");
  if (i < 0) throw new Error("inc.sql: 'or ' が見つかりません");
  return s.slice(i + 3).trim();
}

function syncPatches() {
  const robotInc = readFileSync(
    join(outDir, "students_next_text_robot_check.inc.sql"),
    "utf8"
  ).trim();
  const progInc = readFileSync(
    join(outDir, "students_next_text_programming_check.inc.sql"),
    "utf8"
  ).trim();

  const robotAny = partAfterFirstOr(robotInc);
  const progAny = partAfterFirstOr(progInc);

  const robotPatch = `-- ロボット次回テキスト CHECK 更新（npm run gen:next-text-sql 生成）

alter table public.students add column if not exists next_text_robot text;

alter table public.students drop constraint if exists students_next_text_robot_check;

update public.students
  set next_text_robot = null
  where next_text_robot is not null
    and not (${robotAny});

do $$ begin
  alter table public.students add constraint students_next_text_robot_check
    check (
${indentBlock(robotInc, 6)}
    );
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
`;

  const progPatch = `-- プログラミング次回テキスト CHECK 更新（npm run gen:next-text-sql 生成）

alter table public.students add column if not exists next_text_programming text;

alter table public.students drop constraint if exists students_next_text_programming_check;

update public.students
  set next_text_programming = null
  where next_text_programming is not null
    and not (${progAny});

do $$ begin
  alter table public.students add constraint students_next_text_programming_check
    check (
${indentBlock(progInc, 6)}
    );
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
`;

  writeFileSync(
    join(__dirname, "../supabase/patches/students_next_text_robot.sql"),
    robotPatch,
    "utf8"
  );
  writeFileSync(
    join(__dirname, "../supabase/patches/students_next_text_programming.sql"),
    progPatch,
    "utf8"
  );
}

dumpTxt();
incRobot();
incProgramming();
syncSchema();
syncPatches();
console.log(
  "Wrote supabase/generated/*, schema.sql 次回テキストブロック, patches/*"
);
