import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, required, children }: Props) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium mb-1.5 text-slate-800"
      >
        {label}
        {required ? <span className="text-rose-600 ml-0.5">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
