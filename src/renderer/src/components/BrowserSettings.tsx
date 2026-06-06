import { type FormEvent, useEffect, useState } from "react";

/**
 * The grown-up control over which websites Bit's browser may open. Creations
 * (loopback) are always allowed and never shown here; this manages the external
 * allowlist. Anything off this list is refused before it ever loads.
 */
export function BrowserSettings() {
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.hibit?.browser?.allowlist
      .list()
      .then(setDomains)
      .catch(() => {});
  }, []);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const entry = draft.trim();
    if (!entry || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await window.hibit.browser.allowlist.add(entry);
      setDomains(next);
      setDraft("");
      if (!next.some((d) => entry.toLowerCase().includes(d))) {
        setError("That didn't look like a website address.");
      }
    } catch {
      setError("Couldn't save that website.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (domain: string) => {
    setBusy(true);
    try {
      setDomains(await window.hibit.browser.allowlist.remove(domain));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="hb-browser-settings">
      <summary className="hb-button hb-button-secondary">Allowed websites</summary>
      <div className="hb-card hb-browser-settings-body">
        <p className="t-small">
          Bit can open a creation's own preview anytime. It can only open these websites:
        </p>
        <ul className="hb-allowlist">
          {domains.length === 0 ? (
            <li className="hb-allowlist-empty t-small">No websites added yet.</li>
          ) : null}
          {domains.map((domain) => (
            <li key={domain} className="hb-allowlist-item">
              <span className="hb-allowlist-domain" title={domain}>
                {domain}
              </span>
              <button
                type="button"
                className="hb-allowlist-remove"
                onClick={() => remove(domain)}
                disabled={busy}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form className="hb-allowlist-add" onSubmit={add}>
          <input
            type="text"
            value={draft}
            placeholder="e.g. wikipedia.org"
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Add a website"
          />
          <button type="submit" className="hb-button" disabled={busy || !draft.trim()}>
            Add
          </button>
        </form>
        {error ? <p className="hb-error t-small">{error}</p> : null}
      </div>
    </details>
  );
}
