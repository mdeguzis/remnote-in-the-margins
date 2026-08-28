import * as React from 'react';

/**
 * The box a comment is typed into, used both for a new comment and for editing
 * an existing one.
 *
 * Enter submits and Shift+Enter makes a new line, which is the convention every
 * comment box in every other tool uses. Escape cancels, so a composer opened by
 * accident can be dismissed without reaching for the mouse.
 */
export function Composer({
  initial = '',
  submitLabel,
  placeholder,
  hint,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel: string;
  placeholder: string;
  hint?: string;
  busy?: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [body, setBody] = React.useState(initial);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Caret at the end, not the start: editing almost always means adding to
    // what is already there.
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const empty = body.trim().length === 0;

  const submit = () => {
    if (empty || busy) return;
    onSubmit(body);
  };

  return (
    <div className="itm-composer">
      <textarea
        ref={ref}
        className="itm-input"
        value={body}
        placeholder={placeholder}
        disabled={busy}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="itm-composer-row">
        <span className="itm-hint">{hint ?? 'Enter to save, Shift+Enter for a new line'}</span>
        <button className="itm-action" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="itm-action itm-action--primary" onClick={submit} disabled={empty || busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
