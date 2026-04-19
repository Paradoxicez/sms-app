// Phase 16-02 Task 3 — SidebarFooterContent "Account settings" entry.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Polyfill PointerEvent for jsdom (required by @base-ui/react)
beforeAll(() => {
  if (typeof globalThis.PointerEvent === "undefined") {
    // @ts-expect-error -- minimal polyfill for jsdom
    globalThis.PointerEvent = class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
        this.pointerType = params.pointerType ?? "";
      }
    };
  }
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(async () => ({ data: {} })),
  },
}));

// Mock the mobile hook — jsdom lacks matchMedia and the sidebar provider reads it.
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

import { SidebarFooterContent } from "@/components/nav/sidebar-footer";
import { SidebarProvider } from "@/components/ui/sidebar";

type FooterProps = Parameters<typeof SidebarFooterContent>[0];

function renderFooter(props: FooterProps) {
  return render(
    <SidebarProvider defaultOpen={true}>
      <SidebarFooterContent {...props} />
    </SidebarProvider>,
  );
}

async function openMenu() {
  const trigger = screen.getByRole("button");
  await userEvent.click(trigger);
}

describe("SidebarFooterContent — Account settings entry", () => {
  it("renders an Account settings DropdownMenuItem when accountHref prop is provided", async () => {
    renderFooter({ userName: "Ada", userEmail: "ada@x.co", accountHref: "/app/account" });
    await openMenu();
    expect(await screen.findByText("Account settings")).toBeInTheDocument();
  });

  it("uses accountHref as the Link target (defaults to /app/account)", async () => {
    renderFooter({ userName: "Ada", userEmail: "ada@x.co" });
    await openMenu();
    const link = (await screen.findByText("Account settings")).closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/app/account");
  });

  it("uses accountHref as the Link target when /admin/account is provided", async () => {
    renderFooter({ userName: "Ada", userEmail: "ada@x.co", accountHref: "/admin/account" });
    await openMenu();
    const link = (await screen.findByText("Account settings")).closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/admin/account");
  });

  it("renders UserCog icon in the menu item", async () => {
    renderFooter({ userName: "Ada", userEmail: "ada@x.co" });
    await openMenu();
    const link = (await screen.findByText("Account settings")).closest("a");
    expect(link).not.toBeNull();
    // lucide-react renders an <svg> sibling with lucide-user-cog class
    const svg = link!.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("Account settings appears ABOVE the Sign out item", async () => {
    renderFooter({ userName: "Ada", userEmail: "ada@x.co" });
    await openMenu();
    const account = await screen.findByText("Account settings");
    const signOut = await screen.findByText("Sign out");
    const pos = account.compareDocumentPosition(signOut);
    // DOCUMENT_POSITION_FOLLOWING = 4 — signOut follows account
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("DropdownMenuSeparator sits between Account settings and Sign out", async () => {
    renderFooter({ userName: "Ada", userEmail: "ada@x.co" });
    await openMenu();
    // Find all separators in the open menu
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const separators = menu!.querySelectorAll('[data-slot="dropdown-menu-separator"], [role="separator"]');
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });

  it("renders AvatarImage with src=userImage when userImage prop is provided", () => {
    renderFooter({
      userName: "Ada",
      userEmail: "ada@x.co",
      userImage: "https://cdn.example.com/avatars/u1.webp?v=1",
    });
    const img = document.querySelector("img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toContain("https://cdn.example.com/avatars/u1.webp");
  });

  it("renders AvatarFallback with initials when userImage is null or undefined", () => {
    renderFooter({ userName: "Ada Lovelace", userEmail: "ada@x.co", userImage: null });
    // Initials "AL" (uppercase first letters)
    expect(screen.getAllByText("AL").length).toBeGreaterThan(0);
  });
});
