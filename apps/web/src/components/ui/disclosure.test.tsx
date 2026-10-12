import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./disclosure";

describe("Disclosure", () => {
  it("opens and closes with its title", async () => {
    render(
      <>
        <Disclosure title="Delivery">Standard: 3-5 days</Disclosure>
        <Disclosure title="Details" defaultOpen>
          Cotton
        </Disclosure>
      </>,
    );
    const delivery = screen.getByText("Delivery").closest("details")!;
    const details = screen.getByText("Details").closest("details")!;
    expect(delivery.open).toBe(false);
    expect(details.open).toBe(true);

    await userEvent.click(screen.getByText("Delivery"));
    expect(delivery.open).toBe(true);
    await userEvent.click(screen.getByText("Details"));
    expect(details.open).toBe(false);
  });
});
