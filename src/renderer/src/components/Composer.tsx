type ComposerProps = {
  value: string;
  running: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onAbort: () => void;
};

export function Composer({ value, running, onChange, onSend, onAbort }: ComposerProps) {
  return (
    <form
      className="hb-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running) onSend();
      }}
    >
      <label className="hb-sr-only" htmlFor="hibit-composer">
        Ask Bit to build
      </label>
      <textarea
        id="hibit-composer"
        placeholder="Ask Bit to build..."
        value={value}
        disabled={running}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter keeps the newline. Skip while a turn is
          // running or an IME composition is mid-word.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!running) onSend();
        }}
      />
      <div className="hb-composer-actions">
        {running ? (
          <button className="hb-button hb-button-danger" type="button" onClick={onAbort}>
            Stop
          </button>
        ) : (
          <button className="hb-button hb-button-primary" type="submit">
            Send
          </button>
        )}
      </div>
    </form>
  );
}
