// Scroll an element to the top of the screen. Long lists skip rendering off-screen rows (.cv-row), so the first scroll
// lands using estimated row heights; once it settles we correct it (instantly) after the nearby rows have rendered.
export function scrollToElement(el: HTMLElement) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const settle = () => {
    let n = 0;
    const fix = () => {
      el.scrollIntoView({ behavior: "auto", block: "start" });
      if (++n < 3) requestAnimationFrame(fix);
    };
    requestAnimationFrame(fix);
  };
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  if (!smooth) settle();
  else if ("onscrollend" in window) window.addEventListener("scrollend", settle, { once: true });
  else setTimeout(settle, 700);
}
