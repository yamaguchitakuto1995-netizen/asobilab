import {
  textbookCourseChipClass,
  textbookCourseChipLabel,
} from "@/lib/textbookCourseColors";

type Props = {
  course: string;
  subject: string;
  size?: "sm" | "md";
};

export function TextbookCourseChip({ course, subject, size = "sm" }: Props) {
  const label = textbookCourseChipLabel(course);
  if (!label || label === "—") return null;
  const sizeClass =
    size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${sizeClass} ${textbookCourseChipClass(course, subject)}`}
    >
      {label}
    </span>
  );
}
