import { useLayoutEffect } from 'react';

/**
 * Universal Scroll-To-Top Helper
 * Resets window, documentElement, body, #root, and all active scrolling containers in the DOM.
 */
export function resetAppScroll(targetContainer?: HTMLElement | null): void {
  if (typeof window === 'undefined') return;

  // 1. Reset window and document scrolling elements
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  } catch {
    window.scrollTo(0, 0);
  }

  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
  }
  if (document.body) {
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  }

  // 2. #root container (in src/index.css: #root { overflow-y: auto !important; height: 100% !important; })
  const rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.scrollTop = 0;
    rootEl.scrollLeft = 0;
  }

  // 3. Optional specific container passed in
  if (targetContainer) {
    targetContainer.scrollTop = 0;
    targetContainer.scrollLeft = 0;
  }

  // 4. Any <main> element
  const mainEls = document.querySelectorAll('main');
  mainEls.forEach((el) => {
    (el as HTMLElement).scrollTop = 0;
  });

  // 5. Any element with class overflow-y-auto or data-scroll-container
  const scrollables = document.querySelectorAll<HTMLElement>('.overflow-y-auto, [data-scroll-container="true"]');
  scrollables.forEach((el) => {
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTop = 0;
    }
  });
}

/**
 * useScrollToTop hook
 * Uses useLayoutEffect so the reset happens synchronously BEFORE paint (no visible jump).
 */
export function useScrollToTop(
  deps: React.DependencyList = [],
  containerRef?: React.RefObject<HTMLElement | null>
): void {
  useLayoutEffect(() => {
    resetAppScroll(containerRef?.current);

    // Double-safeguard with requestAnimationFrame in case of deferred DOM layout calculation
    const rafId = requestAnimationFrame(() => {
      resetAppScroll(containerRef?.current);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
