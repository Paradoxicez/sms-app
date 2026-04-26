/**
 * Tests for AppSidebar component — validates nav item rendering,
 * active route detection, and sidebar rail presence.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NavGroup } from "@/components/nav/nav-config";
import { LayoutDashboard, Camera, Settings } from "lucide-react";

// Mock next/navigation
const usePathnameMock = vi.fn(() => "/app/dashboard");

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

// Mock the mobile hook to always return false (desktop)
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

import { AppSidebar } from "@/components/nav/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const testNavGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, exactMatch: true },
      { label: "Cameras", href: "/app/cameras", icon: Camera },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "General", href: "/app/settings", icon: Settings },
    ],
  },
];

function renderSidebar(props?: Partial<Parameters<typeof AppSidebar>[0]>) {
  return render(
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        navGroups={testNavGroups}
        userName="John Doe"
        userEmail="john@example.com"
        {...props}
      />
    </SidebarProvider>,
  );
}

describe("AppSidebar", () => {
  it("renders all nav items from provided navGroups", () => {
    renderSidebar();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Cameras")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  it("renders group labels", () => {
    renderSidebar();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("active route gets data-active attribute", () => {
    usePathnameMock.mockReturnValue("/app/dashboard");
    renderSidebar();
    // Find the sidebar menu button for Dashboard — it should have data-active
    const dashboardLink = screen.getByRole("link", { name: /Dashboard/i });
    expect(dashboardLink).toHaveAttribute("data-active");
  });

  it("non-active route does not get data-active=true", () => {
    usePathnameMock.mockReturnValue("/app/dashboard");
    renderSidebar();
    const camerasLink = screen.getByRole("link", { name: /Cameras/i });
    expect(camerasLink).not.toHaveAttribute("data-active");
  });

  it("renders SidebarRail", () => {
    renderSidebar();
    const rail = document.querySelector('[data-sidebar="rail"]');
    expect(rail).toBeInTheDocument();
  });

  it("renders user name in footer when expanded", () => {
    renderSidebar();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });
});
