import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("hides what is typed until asked to show it, and hides it again", async () => {
    render(<PasswordInput aria-label="Secret" defaultValue="hunter2hunter2" />);
    const field = screen.getByLabelText("Secret");
    expect(field).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("is not a submit button, so toggling never sends a form", async () => {
    render(<PasswordInput aria-label="Secret" />);

    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute("type", "button");
  });
});
