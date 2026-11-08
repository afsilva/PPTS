"use client";

import { createContext, useContext, useState } from "react";

type FormProps = React.ComponentPropsWithoutRef<"form">;
const PendingContext = createContext(false);

/**
 * Native POST form with immediate progressive feedback. It retains ordinary
 * browser submission when JavaScript is unavailable and only enters pending
 * after built-in constraint validation succeeds.
 */
export function MutationForm({ children, onSubmit, ...props }: FormProps) {
  const [pending, setPending] = useState(false);
  return (
    <PendingContext.Provider value={pending}>
      <form
        {...props}
        onSubmit={(event) => {
          onSubmit?.(event);
          if (!event.defaultPrevented && event.currentTarget.checkValidity()) setPending(true);
        }}
        aria-busy={pending}
      >
        {children}
      </form>
    </PendingContext.Provider>
  );
}

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirmMessage?: string;
  ariaLabel?: string;
  title?: string;
};

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
  confirmMessage,
  ariaLabel,
  title,
}: Props) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-label={ariaLabel}
      title={title}
      aria-disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending && <span className="submitSpinner" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
