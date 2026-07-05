import { formatPromotionScheduleLabel } from "@/lib/studentPromotion";
import type { PromotionType } from "@/lib/studentPromotion";

type Props = {
  promotionScheduledYm?: string | null;
  promotionType?: PromotionType | string | null;
  compact?: boolean;
};

export function PromotionScheduleNotice({
  promotionScheduledYm,
  promotionType,
  compact = false,
}: Props) {
  const label = formatPromotionScheduleLabel(
    promotionScheduledYm,
    promotionType
  );
  if (!label) return null;

  return (
    <p
      className={
        compact
          ? "text-center text-[10px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5"
          : "text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
      }
    >
      {label}
    </p>
  );
}
