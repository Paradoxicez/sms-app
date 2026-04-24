import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom does not implement the PointerEvent constructor, but base-ui's
// Checkbox / Button / Dialog primitives synthesise pointer events during
// click handling. Without this polyfill, userEvent.click on a base-ui
// Checkbox throws "ReferenceError: PointerEvent is not defined" (Phase 20
// Plan 03 — bulk selection tests surface this). Use the standard MouseEvent
// shape which carries the attributes base-ui actually reads (clientX,
// clientY, button).
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tangentialPressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly twist: number;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "";
      this.isPrimary = params.isPrimary ?? false;
      this.width = params.width ?? 0;
      this.height = params.height ?? 0;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
    }
  }
  // @ts-expect-error — polyfill assignment to global
  globalThis.PointerEvent = PointerEventPolyfill;
}
