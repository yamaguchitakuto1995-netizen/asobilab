import { classroomBadgeClass } from "@/lib/types";

type Props = {
  classroom: string | null | undefined;
  size?: "sm" | "md";
};

/** 所属教室を色分けバッジで表示。null なら何も表示しない */
export function ClassroomBadge({ classroom, size = "sm" }: Props) {
  if (!classroom) return null;
  const sizeClass =
    size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${sizeClass} ${classroomBadgeClass(classroom)}`}
      title="所属教室"
    >
      {classroom}
    </span>
  );
}
