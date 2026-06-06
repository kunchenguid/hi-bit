import { type FormEvent, useEffect, useState } from "react";

export function BrowserSettings() {
  const [domains, setDomains] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const allowlist = window.hibit?.browser.allowlist;
    if (!allowlist) return;
    allowlist
      .list()
      .then((next) => {
        if (!cancelled) setDomains(next);
      })
      .catch(() => {
        if (!cancelled) setError("Allowed websites are not available right now.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!entry.trim()) return;
    try {
      const next = await window.hibit.browser.allowlist.add(entry);
      setDomains(next);
      setEntry("");
      setError(null);
    } catch {
      setError("That website could not be added.");
    }
  }

  async function handleRemove(domain: string): Promise<void> {
    try {
      setDomains(await window.hibit.browser.allowlist.remove(domain));
      setError(null);
    } catch {
      setError("That website could not be removed.");
    }
  }

  return (
    <details className="hb-browser-settings">
      <summary className="hb-button hb-button-secondary">Allowed websites</summary>
      <div className="hb-card hb-browser-settings-body">
        <form className="hb-allowlist-add" onSubmit={handleAdd}>
          <label htmlFor="browser-allowlist-domain">Website domain</label>
          <input
            id="browser-allowlist-domain"
            value={entry}
            onChange={(event) => setEntry(event.currentTarget.value)}
            placeholder="example.com"
          />
          <button className="hb-button hb-button-secondary" type="submit">
            Add website
          </button>
        </form>
        {domains.length > 0 ? (
          <ul className="hb-allowlist">
            {domains.map((domain) => (
              <li className="hb-allowlist-item" key={domain}>
                <span className="hb-allowlist-domain">{domain}</span>
                <button
                  className="hb-allowlist-remove"
                  type="button"
                  onClick={() => void handleRemove(domain)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hb-allowlist-empty">No extra websites yet.</p>
        )}
        {error ? <p className="hb-error">{error}</p> : null}
      </div>
    </details>
  );
}
