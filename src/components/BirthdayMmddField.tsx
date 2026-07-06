import { Field, inputClass } from "@/components/Field";
import { normalizeBirthdayMmdd } from "@/lib/birthdayMmdd";

type Props = {
  defaultValue?: string | null;
  id?: string;
  name?: string;
  autoComplete?: string;
};

/** 保護者ログイン・生徒登録用の誕生日（月日4桁） */
export function BirthdayMmddField({
  defaultValue = "",
  id = "birthday",
  name = "birthday",
  autoComplete = "bday",
}: Props) {
  const normalized = normalizeBirthdayMmdd(defaultValue) ?? "";

  return (
    <Field
      label="誕生日（月日）"
      htmlFor={id}
      required
      hint="月日4桁（例: 3月27日生まれ → 0327）"
    >
      <input
        id={id}
        name={name}
        type="text"
        required
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        minLength={4}
        placeholder="例: 0327"
        defaultValue={normalized}
        className={inputClass}
        autoComplete={autoComplete}
      />
    </Field>
  );
}
