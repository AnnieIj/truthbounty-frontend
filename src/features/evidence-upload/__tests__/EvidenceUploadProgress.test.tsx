import { render, screen, fireEvent } from "@testing-library/react";
import { EvidenceUploadProgress } from "../EvidenceUploadProgress";
import { initialUploadState } from "../uploadMachine";
import type { UploadState } from "../types";

const noop = () => {};
const st = (o: Partial<UploadState>): UploadState => ({ ...initialUploadState, ...o });

describe("EvidenceUploadProgress", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<EvidenceUploadProgress state={st({})} onRetry={noop} onCancel={noop} onChooseAgain={noop} />);
    expect(container.firstChild).toBeNull();
  });

  it("uploading shows accessible progress and says not confirmed", () => {
    render(<EvidenceUploadProgress state={st({ phase: "uploading", progress: 40 })} onRetry={noop} onCancel={noop} onChooseAgain={noop} />);
    expect(screen.getByRole("progressbar", { name: "Upload progress" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Not confirmed yet/);
    expect(screen.queryByText(/verified/i)).toBeNull();
  });

  it("verified is announced only in verified phase", () => {
    render(<EvidenceUploadProgress state={st({ phase: "verified", progress: 100 })} onRetry={noop} onCancel={noop} onChooseAgain={noop} />);
    expect(screen.getByRole("status").textContent).toMatch(/verified/);
  });

  it("retryable failure offers keyboard-operable Retry", () => {
    let retried = false;
    render(<EvidenceUploadProgress state={st({ phase: "failed", failure: "network", retryable: true })} onRetry={() => (retried = true)} onCancel={noop} onChooseAgain={noop} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    expect(retried).toBe(true);
  });

  it("integrity mismatch has no Retry, only Choose file again", () => {
    render(<EvidenceUploadProgress state={st({ phase: "failed", failure: "integrity-mismatch", retryable: false })} onRetry={noop} onCancel={noop} onChooseAgain={noop} />);
    expect(screen.queryByRole("button", { name: "Retry upload" })).toBeNull();
    expect(screen.getByRole("button", { name: "Choose file again" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Nothing was accepted/);
  });

  it("invalidated state tells the user why", () => {
    render(<EvidenceUploadProgress state={st({ phase: "invalidated" })} onRetry={noop} onCancel={noop} onChooseAgain={noop} />);
    expect(screen.getByRole("status").textContent).toMatch(/account or network changed/);
  });

  it("cancel is available while busy", () => {
    render(<EvidenceUploadProgress state={st({ phase: "hashing" })} onRetry={noop} onCancel={noop} onChooseAgain={noop} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});