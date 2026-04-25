export function computeNextTabIndex(
  currentIndex: number,
  count: number,
  key: string,
): number | null {
  if (count <= 1) return null;
  if (currentIndex < 0 || currentIndex >= count) return null;

  switch (key) {
    case "ArrowRight":
      return (currentIndex + 1) % count;
    case "ArrowLeft":
      return (currentIndex - 1 + count) % count;
    case "Home":
      return currentIndex === 0 ? null : 0;
    case "End":
      return currentIndex === count - 1 ? null : count - 1;
    default:
      return null;
  }
}
