// Sidebar.jsx — Hi-Bit desktop sidebar
const Sidebar = ({ active, onNav, level, xp, xpMax, streak }) => {
  const items = [
    { id: 'home', label: 'Home', icon: 'i-home' },
    { id: 'lessons', label: 'Lessons', icon: 'i-book' },
    { id: 'tutor', label: 'Tutor', icon: 'i-chat' },
    { id: 'editor', label: 'Code', icon: 'i-code' },
    { id: 'trophies', label: 'Trophies', icon: 'i-trophy' },
  ];
  return (
    <aside className="hb-sidebar">
      <div className="hb-brand">
        <img src="../../assets/logo-mark.svg" className="pixel-art" width="32" height="32" alt="" />
        <img src="../../assets/logo-wordmark.svg" height="18" alt="Hi-Bit" style={{ imageRendering: 'pixelated' }} />
      </div>
      <nav className="hb-nav">
        {items.map(it => (
          <button
            key={it.id}
            className={`hb-nav-item ${active === it.id ? 'is-active' : ''}`}
            onClick={() => onNav(it.id)}
          >
            <svg width="20" height="20" className="hb-nav-icon">
              <use href={`../../assets/icons.svg#${it.icon}`} />
            </svg>
            <span>{it.label}</span>
          </button>
        ))}
      </nav>
      <div className="hb-sidebar-foot">
        <div className="hb-level-chip">
          <span className="t-pixel">LV {level}</span>
          <div className="hb-level-bar"><div style={{ width: `${(xp / xpMax) * 100}%` }} /></div>
          <span className="hb-level-xp t-mono">{xp}/{xpMax}</span>
        </div>
        <div className="hb-streak">
          <svg width="16" height="16" style={{ color: '#F26A4B' }}><use href="../../assets/icons.svg#i-flame" /></svg>
          <span className="t-pixel">{streak} DAY</span>
        </div>
      </div>
    </aside>
  );
};

window.Sidebar = Sidebar;
