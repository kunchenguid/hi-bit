// XpToast.jsx — floating "+15 XP" pop
const XpToast = ({ amount, id }) => (
  <div key={id} className="hb-xp-toast t-pixel">+{amount} XP</div>
);
window.XpToast = XpToast;
