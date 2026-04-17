"use client";

import { useEffect } from "react";

/**
 * Dispatches a window resize event when the sidebar finishes its
 * collapse/expand CSS transition. This triggers Recharts ResponsiveContainer
 * to redraw charts at the correct width.
 *
 * Place this hook in layouts that contain resize-sensitive components.
 * For Leaflet maps, a separate resize listener in the map component
 * calls map.invalidateSize().
 *
 * Per D-16: no polling, no ResizeObserver -- transitionend only.
 */
export function useSidebarResize() {
  useEffect(() => {
    // The sidebar gap div (data-slot="sidebar-gap") is the element
    // whose width transitions when sidebar collapses/expands.
    // See sidebar.tsx lines 219-228.
    const sidebarGap = document.querySelector('[data-slot="sidebar-gap"]');
    if (!sidebarGap) return;

    function handleTransitionEnd(e: TransitionEvent) {
      // Filter: only fire on width transition, not opacity or other props.
      // Per Pitfall 2 from RESEARCH.md: multiple transitionend events fire.
      if (e.propertyName !== "width") return;
      window.dispatchEvent(new Event("resize"));
    }

    sidebarGap.addEventListener(
      "transitionend",
      handleTransitionEnd as EventListener,
    );
    return () => {
      sidebarGap.removeEventListener(
        "transitionend",
        handleTransitionEnd as EventListener,
      );
    };
  }, []);
}
