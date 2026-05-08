import { ATTENDANCE_BADGE, ATTENDANCE_LABEL, type AttendanceStatus } from "@/lib/types";

type Props = {
  status: AttendanceStatus;
  size?: "sm" | "md";
};

export function AttendanceBadge({ status, size = "sm" }: Props) {
  const sizeClass = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${sizeClass} ${ATTENDANCE_BADGE[status]}`}
    >
      {ATTENDANCE_LABEL[status]}
    </span>
  );
}
