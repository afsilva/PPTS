"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type SubmitEvent as ReactSubmitEvent,
} from "react";

type FormProps = React.ComponentPropsWithoutRef<"form"> & {
  /** Forms in the same group block one another while a request is in flight. */
  mutationGroup?: string;
  /** Disable the submit control until a successful-control value changes. */
  requireChanges?: boolean;
  /** Keep native navigation for exceptional flows that cannot use fetch. */
  enhance?: boolean;
};

type PendingState = { pending: boolean; blocked: boolean; dirty: boolean };
const PendingContext = createContext<PendingState>({ pending: false, blocked: false, dirty: true });
const groupOwners = new Map<string, string>();
const GROUP_EVENT = "ppts:mutation-group";

function notifyGroup(group: string) {
  window.dispatchEvent(new CustomEvent(GROUP_EVENT, { detail: group }));
}

function comparableFormData(form: HTMLFormElement) {
  return [...new FormData(form).entries()].map(([name, value]) =>
    typeof value === "string"
      ? [name, value]
      : [name, `${value.name}\u0000${value.size}\u0000${value.lastModified}`],
  );
}

function sameFormData(left: ReturnType<typeof comparableFormData>, right: typeof left) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function encodedBody(data: FormData) {
  const body = new URLSearchParams();
  for (const [name, value] of data) {
    if (typeof value !== "string") throw new Error("Unexpected file in URL-encoded form");
    body.append(name, value);
  }
  return body;
}

/**
 * A progressively enhanced mutation form. Without JavaScript it remains an
 * ordinary browser POST. Once hydrated it keeps the current document visible,
 * paints pending feedback before sending, follows the server's PRG response,
 * and recovers controls after network failures or BFCache restoration.
 */
export function MutationForm({
  children,
  onSubmit,
  onInput,
  mutationGroup,
  requireChanges = false,
  enhance = true,
  ...props
}: FormProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const initialDataRef = useRef<ReturnType<typeof comparableFormData> | null>(null);
  const [pending, setPending] = useState(false);
  const [groupOwner, setGroupOwner] = useState<string | null>(
    mutationGroup ? (groupOwners.get(mutationGroup) ?? null) : null,
  );
  const [dirty, setDirty] = useState(!requireChanges);
  const [requestError, setRequestError] = useState<string | null>(null);

  function releaseGroup() {
    if (mutationGroup && groupOwners.get(mutationGroup) === id) {
      groupOwners.delete(mutationGroup);
      notifyGroup(mutationGroup);
    }
  }

  function release() {
    submittingRef.current = false;
    setPending(false);
    releaseGroup();
  }

  useEffect(() => {
    const form = formRef.current;
    if (requireChanges && form) initialDataRef.current = comparableFormData(form);

    const groupListener = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (mutationGroup && detail === mutationGroup)
        setGroupOwner(groupOwners.get(mutationGroup) ?? null);
    };
    const pageShowListener = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      submittingRef.current = false;
      setPending(false);
      setRequestError(null);
      if (mutationGroup) {
        groupOwners.delete(mutationGroup);
        notifyGroup(mutationGroup);
      }
      window.location.reload();
    };
    window.addEventListener(GROUP_EVENT, groupListener);
    window.addEventListener("pageshow", pageShowListener);
    return () => {
      window.removeEventListener(GROUP_EVENT, groupListener);
      window.removeEventListener("pageshow", pageShowListener);
    };
  }, [id, mutationGroup, requireChanges]);

  function updateDirty(form: HTMLFormElement) {
    if (!requireChanges || !initialDataRef.current) return;
    setDirty(!sameFormData(initialDataRef.current, comparableFormData(form)));
  }

  async function submit(event: ReactSubmitEvent<HTMLFormElement>) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) return;

    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const confirmation =
      submitter instanceof HTMLButtonElement
        ? submitter.dataset.confirmMessage
        : form.querySelector<HTMLButtonElement>('button[type="submit"][data-confirm-message]')
            ?.dataset.confirmMessage;
    if (confirmation && !window.confirm(confirmation)) {
      event.preventDefault();
      return;
    }

    if (!enhance) {
      submittingRef.current = true;
      setPending(true);
      return;
    }

    event.preventDefault();
    if (submittingRef.current || (mutationGroup && groupOwners.has(mutationGroup))) return;
    if (requireChanges && !dirty) return;

    submittingRef.current = true;
    setRequestError(null);
    setPending(true);
    if (mutationGroup) {
      groupOwners.set(mutationGroup, id);
      setGroupOwner(id);
      notifyGroup(mutationGroup);
    }

    const data = new FormData(form, submitter instanceof HTMLElement ? submitter : undefined);
    const multipart = form.enctype.toLowerCase() === "multipart/form-data";
    try {
      // Guarantee at least one paint opportunity before network activity begins.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const response = await fetch(form.action, {
        method: form.method || "post",
        body: multipart ? data : encodedBody(data),
        credentials: "same-origin",
        cache: "no-store",
        redirect: "follow",
        headers: { Accept: "text/html" },
      });
      if (!response.ok) {
        if (response.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          // A full navigation is intentional: the authenticated document must be replaced.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }
        throw new Error(`Mutation request failed with status ${response.status}`);
      }
      if (!response.redirected || !response.url) throw new Error("Mutation did not redirect");
      const destination = new URL(response.url);
      if (destination.origin !== window.location.origin)
        throw new Error("Unsafe mutation redirect");
      // A document navigation intentionally clears Next's client Router Cache.
      // Calling push() and refresh() together can refresh the old route before
      // the non-awaitable push commits, leaving a stale dashboard on same-route
      // mutations such as clock-in/out. Keep pending visible until unload.
      window.location.assign(destination.href);
    } catch {
      release();
      setRequestError("The request could not be completed. Check your connection and try again.");
    }
  }

  const blocked = pending || Boolean(groupOwner && groupOwner !== id) || (requireChanges && !dirty);
  return (
    <PendingContext.Provider value={{ pending, blocked, dirty }}>
      <form
        {...props}
        ref={formRef}
        onSubmit={submit}
        onInput={(event) => {
          onInput?.(event);
          updateDirty(event.currentTarget);
        }}
        aria-busy={pending}
      >
        {children}
        {requestError && (
          <p className="mutationError" role="alert">
            {requestError}
          </p>
        )}
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
  const { pending, blocked } = useContext(PendingContext);
  return (
    <button
      type="submit"
      className={className}
      disabled={blocked}
      aria-label={ariaLabel}
      title={title}
      aria-disabled={blocked}
      aria-busy={pending}
      data-confirm-message={confirmMessage}
    >
      {pending && <span className="submitSpinner" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
