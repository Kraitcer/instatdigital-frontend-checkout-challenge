import type { UseFormRegisterReturn } from 'react-hook-form';

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  type?: string;
  placeholder?: string;
  registration: UseFormRegisterReturn;
};

export function Field({ id, label, error, type = 'text', placeholder, registration }: FieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        {...registration}
        id={id}
        type={type}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? <small id={`${id}-error`}>{error}</small> : null}
    </label>
  );
}
