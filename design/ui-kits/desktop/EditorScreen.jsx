// EditorScreen.jsx — code editor + live preview
const EditorScreen = ({ onAwardXp }) => {
  const [code, setCode] = React.useState(
`<button id="b">Click me</button>
<script>
  let count = 0;
  const b = document.getElementById('b');
  b.onclick = () => {
    count = count + 1;
    b.textContent = 'Clicked ' + count;
  };
</script>`);
  const [ran, setRan] = React.useState(false);
  const frameRef = React.useRef(null);
  const run = () => {
    const doc = frameRef.current.contentDocument;
    doc.open();
    doc.write(`<style>body{font-family:system-ui;padding:24px;background:#FFFDF5;color:#1A1626}button{font:inherit;background:#6C5CE7;color:#FFF;border:2px solid #1A1626;border-radius:8px;padding:8px 14px;box-shadow:0 3px 0 0 #1A1626;cursor:pointer;font-weight:600}</style>` + code);
    doc.close();
    if (!ran) { onAwardXp(30); setRan(true); }
  };
  React.useEffect(() => {
    const t = setTimeout(run, 50);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, []);

  return (
    <div className="hb-editor">
      <header className="hb-editor-head">
        <div className="hb-editor-tabs">
          <span className="hb-tab is-active">index.html</span>
          <span className="hb-tab">style.css</span>
        </div>
        <button className="hb-btn hb-btn-subject" onClick={run}>
          <svg width="14" height="14"><use href="../../assets/icons.svg#i-play" /></svg>
          <span>Run</span>
        </button>
      </header>
      <div className="hb-editor-split">
        <div className="hb-editor-code">
          <textarea
            className="hb-code"
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="hb-editor-preview">
          <div className="hb-preview-label t-pixel">PREVIEW</div>
          <iframe ref={frameRef} title="preview" />
        </div>
      </div>
      <footer className="hb-editor-foot">
        <svg width="16" height="16" style={{ color: '#7BD86E' }}><use href="../../assets/icons.svg#i-check" /></svg>
        <span className="t-small">Your code ran. +30 XP.</span>
        <div style={{ flex: 1 }} />
        <button className="hb-btn hb-btn-ghost">
          <svg width="14" height="14" style={{ color: '#FFC244' }}><use href="../../assets/icons.svg#i-hint" /></svg>
          <span>Hint</span>
        </button>
      </footer>
    </div>
  );
};

window.EditorScreen = EditorScreen;
