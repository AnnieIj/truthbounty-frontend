import { render, screen } from "@testing-library/react";
import { VerifierDashboard } from "../VerifierDashboard";
import type { QueueItem } from "../types";

const fresh = { fetchedAt: new Date().toISOString(), stale: false };
const item = (over: Partial<QueueItem>): QueueItem => ({
  id: "1",
  title: "Claim A",
  deadlineIso: new Date(Date.now() + 3_600_000).toISOString(),
  phase: "commit",
  phaseDeadlineIso: new Date(Date.now() + 3_600_000).toISOString(),
  state: "available",
  freshness: fresh,
  ...over,
});
const ready = <T,>(data: T) => ({ status: "ready" as const, data });
const base = {
  online: true,
  eligibility: { status: "eligible" as const, authority: "contract", freshness: fresh },
  available: ready<QueueItem[]>([]),
  commitments: ready<QueueItem[]>([]),
  rewards: ready({ reputation: "10", pendingRewards: "0", freshness: fresh }),
  outcomes: ready([]),
};

describe("VerifierDashboard", () => {
  it("orders the queue by deadline and shows exact deadline + freshness", () => {
    render(
      <VerifierDashboard
        {...base}
        available={ready([
          item({ id: "late", title: "Late", deadlineIso: new Date(Date.now() + 9_000_000).toISOString() }),
          item({ id: "soon", title: "Soon", deadlineIso: new Date(Date.now() + 1_000_000).toISOString() }),
        ])}
      />,
    );
    const titles = screen.getAllByText(/^(Soon|Late)$/).map((n) => n.textContent);
    expect(titles).toEqual(["Soon", "Late"]);
    expect(screen.getAllByText(/Updated/).length).toBeGreaterThan(0);
  });

  it("keeps ineligible, expired, already-submitted and unavailable distinct", () => {
    render(
      <VerifierDashboard
        {...base}
        available={ready([
          item({ id: "a", title: "A", state: "expired" }),
          item({ id: "b", title: "B", state: "already-submitted" }),
          item({ id: "c", title: "C", state: "unavailable" }),
        ])}
      />,
    );
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Already submitted")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("hides work and shows the reason when ineligible", () => {
    render(
      <VerifierDashboard
        {...base}
        eligibility={{ status: "ineligible", reason: "insufficient stake", freshness: fresh }}
        available={ready([item({ title: "Hidden claim" })])}
      />,
    );
    expect(screen.getByText(/insufficient stake/)).toBeTruthy();
    expect(screen.queryByText("Hidden claim")).toBeNull();
  });

  it("shows no-work, offline, unavailable and partial-failure states", () => {
    render(
      <VerifierDashboard
        {...base}
        online={false}
        available={ready<QueueItem[]>([])}
        rewards={{ status: "error", retryable: true }}
      />,
    );
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    expect(screen.getByText("No work is available right now.")).toBeTruthy();
    expect(screen.getByText("Summary unavailable.")).toBeTruthy();
    expect(screen.getByText("Recent verification outcomes")).toBeTruthy(); // other panels still render
  });

  it("shows stale freshness", () => {
    render(
      <VerifierDashboard
        {...base}
        available={ready([item({ freshness: { fetchedAt: new Date(Date.now() - 600_000).toISOString(), stale: true } })])}
      />,
    );
    expect(screen.getByText(/Stale/)).toBeTruthy();
  });

  it("keeps protected evidence sealed until provided", () => {
    render(<VerifierDashboard {...base} available={ready([item({})])} />);
    expect(screen.getByText(/Evidence sealed/)).toBeTruthy();
    expect(screen.getByText(/Your choice is sealed/)).toBeTruthy();
  });

  it("never labels a local submission as completed", () => {
    render(<VerifierDashboard {...base} available={ready([item({ state: "submitted-pending-confirmation" })])} />);
    expect(screen.getByText(/awaiting canonical confirmation/)).toBeTruthy();
    expect(screen.queryByText("Confirmed")).toBeNull();
  });

  it("shows wrong-chain and disconnected notices", () => {
    const { rerender } = render(
      <VerifierDashboard {...base} eligibility={{ status: "wrong-chain", expectedChainId: 10 }} />,
    );
    expect(screen.getByText("Wrong network")).toBeTruthy();
    rerender(<VerifierDashboard {...base} eligibility={{ status: "disconnected" }} />);
    expect(screen.getByText("Wallet not connected")).toBeTruthy();
  });
});