import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  children,
  className,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
  className,
  hint,
  disabled,
  placeholder,
  min,
  step,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  step?: number | string;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <Field
      label={required ? `${label} *` : label}
      htmlFor={id}
      className={className}
      {...(hint ? { hint } : {})}
    >
      <Input
        id={id}
        type={type}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        {...(min !== undefined ? { min } : {})}
        {...(step !== undefined ? { step } : {})}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  className,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  required?: boolean;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <Field label={required ? `${label} *` : label} htmlFor={id} className={className}>
      <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  className,
  required,
  disabled,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: readonly (string | { value: string; label: string })[];
  className?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <Field label={required ? `${label} *` : label} htmlFor={id} className={className}>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function DateRangeInputs({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <Field label="From" htmlFor="range-from">
        <Input
          id="range-from"
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
        />
      </Field>
      <Field label="To" htmlFor="range-to">
        <Input
          id="range-to"
          type="date"
          className="w-40"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
        />
      </Field>
    </div>
  );
}
