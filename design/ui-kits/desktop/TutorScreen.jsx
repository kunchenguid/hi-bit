// TutorScreen.jsx — Bit chat view, with composer and "check for understanding"
// (CSS class hb-bubble-boo retained as an internal identifier for path stability.)
const { useState, useRef, useEffect } = React;

const TutorScreen = ({ onAwardXp }) => {
  const [msgs, setMsgs] = useState([
    { who: 'bit', text: 'Hey — ready to keep going? Today we\'ll make a button that counts.' },
    { who: 'bit', text: 'First question: what word do we use in JavaScript to make a variable we can change later?' },
  ]);
  const [val, setVal] = useState('');
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.parentElement?.scrollTo?.({ top: 99999, behavior: 'smooth' });
  }, [msgs]);

  const send = () => {
    if (!val.trim()) return;
    const user = val.trim();
    setMsgs(m => [...m, { who: 'you', text: user }]);
    setVal('');
    setTimeout(() => {
      if (/let/i.test(user)) {
        setMsgs(m => [...m, { who: 'bit', text: 'Yes — `let` is the one. It means "this might change." Nice. 🎉' }, { who: 'bit', text: 'Try writing a line that makes a variable called `count` starting at 0.', code: 'let count = 0;' }]);
        onAwardXp(15);
      } else if (/var|const/i.test(user)) {
        setMsgs(m => [...m, { who: 'bit', text: 'Close! `var` and `const` are cousins. `const` is for things that don\'t change, and `var` is the old way. The one that means "might change" is `let`.' }]);
      } else {
        setMsgs(m => [...m, { who: 'bit', text: 'Hmm — think about a word that means "might change later." Starts with L.' }]);
      }
    }, 500);
  };

  const suggestions = ['let', 'const', 'var', 'change'];

  // Map mascot name 'bit' to the existing CSS bubble class (internal token).
  const bubbleClass = (who) => who === 'bit' ? 'hb-bubble-boo' : 'hb-bubble-you';

  return (
    <div className="hb-tutor">
      <header className="hb-tutor-head">
        <img src="../../assets/logo-mark.svg" width="28" height="28" className="pixel-art" alt="Bit" />
        <div>
          <div style={{ fontWeight: 600 }}>Bit</div>
          <div className="t-mono" style={{ color: 'var(--ink-64)', fontSize: 11 }}>JavaScript · Lesson 3</div>
        </div>
        <div className="hb-tutor-prog">
          <span className="t-pixel">Q 2/6</span>
        </div>
      </header>
      <div className="hb-tutor-stream">
        {msgs.map((m, i) => (
          <div key={i} className={`hb-bubble ${bubbleClass(m.who)}`}>
            {m.who === 'bit' && <img src="../../assets/logo-mark.svg" width="24" height="24" className="pixel-art" alt="" />}
            <div>
              <div>{m.text}</div>
              {m.code && <pre className="hb-inline-code">{m.code}</pre>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="hb-tutor-suggestions">
        {suggestions.map(s => (
          <button key={s} className="hb-chip" onClick={() => setVal(s)}>{s}</button>
        ))}
      </div>
      <div className="hb-composer">
        <input
          className="hb-input"
          placeholder="Type your answer..."
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button className="hb-btn hb-btn-primary" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
};

window.TutorScreen = TutorScreen;
