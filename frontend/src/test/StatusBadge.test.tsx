import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBadge from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders the status label", () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("shows a pulsing dot while processing", () => {
    const { container } = render(<StatusBadge status="processing" />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("has no pulse when completed", () => {
    const { container } = render(<StatusBadge status="completed" />);
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});
