// HomeScreen.jsx — dashboard with Boo greeting, continue card, lesson grid
const HomeScreen = ({ onOpenLesson, onOpenTutor }) => {
  const subjects = [
    { id: 'html', name: 'HTML', subtitle: 'First web page', prog: '8/8', done: true, sticker: 'sticker-html', xp: 100 },
    { id: 'css', name: 'CSS', subtitle: 'Paint the page', prog: '3/8', done: false, sticker: 'sticker-css', xp: 80 },
    { id: 'js', name: 'JavaScript', subtitle: 'Buttons that count', prog: '1/10', active: true, sticker: 'sticker-js', xp: 120 },
    { id: 'art', name: 'Art with code', subtitle: 'Drawing with loops', prog: '—', sticker: 'sticker-art', xp: 150 },
    { id: 'math', name: 'Math in code', subtitle: 'Random & numbers', prog: '—', sticker: 'sticker-math', xp: 90 },
  ];
  return (
    <div className="hb-screen">
      <header className="hb-hero">
        <img src="../../assets/mascot-boo.svg" width="88" height="88" className="pixel-art hb-bob" alt="Bit" />
        <div>
          <div className="t-pixel" style={{ color: '#6C5CE7', marginBottom: 8 }}>GOOD AFTERNOON</div>
          <h1>Hey Ada — ready to keep going?</h1>
          <p style={{ color: 'var(--ink-3)', marginTop: 6 }}>
            Yesterday you made a button say "hi." Today we'll teach it to count.
          </p>
        </div>
      </header>

      <section className="hb-continue">
        <img src="../../assets/sticker-js.svg" width="56" height="56" className="pixel-art" alt="" />
        <div style={{ flex: 1 }}>
          <div className="t-pixel" style={{ color: '#FFC244', fontSize: 10 }}>CONTINUE · JAVASCRIPT</div>
          <h2 style={{ marginTop: 6 }}>Buttons that count</h2>
          <p className="t-small" style={{ marginTop: 4 }}>Lesson 3 of 8 · +120 XP</p>
        </div>
        <button className="hb-btn hb-btn-primary" onClick={onOpenTutor}>
          <svg width="16" height="16"><use href="../../assets/icons.svg#i-play" /></svg>
          <span>Keep going</span>
        </button>
      </section>

      <h3 style={{ marginTop: 32, marginBottom: 12 }}>Pick a subject</h3>
      <div className="hb-lesson-grid">
        {subjects.map(s => (
          <button
            key={s.id}
            className={`hb-lesson-card hb-wash-${s.id} ${s.active ? 'is-active' : ''} ${s.done ? 'is-done' : ''}`}
            onClick={() => onOpenLesson(s.id)}
          >
            <img src={`../../assets/${s.sticker}.svg`} width="40" height="40" className="pixel-art" alt="" />
            <div className="hb-lesson-meta">
              <div className="hb-lesson-name">{s.name}</div>
              <div className="hb-lesson-sub t-small">{s.subtitle}</div>
              <div className="hb-lesson-foot">
                <span className="t-mono" style={{ color: 'var(--ink-64)' }}>{s.prog}</span>
                {s.done && (
                  <svg width="16" height="16" style={{ color: '#7BD86E' }}>
                    <use href="../../assets/icons.svg#i-check" />
                  </svg>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

window.HomeScreen = HomeScreen;
