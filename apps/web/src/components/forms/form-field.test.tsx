import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, fieldAria } from "./form-field";

describe("Field", () => {
  it("shows a hint until there is an error, and the error slides in and shakes the control once", () => {
    const { rerender } = render(
      <Field id="email" label="Email" hint="We never share it.">
        <input {...fieldAria("email", undefined, "hint")} />
      </Field>,
    );
    expect(screen.getByText("We never share it.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email").parentElement).not.toHaveClass("animate-shake");

    rerender(
      <Field id="email" label="Email" hint="We never share it." error="Enter a valid email address">
        <input {...fieldAria("email", "Enter a valid email address", "hint")} />
      </Field>,
    );

    expect(screen.queryByText("We never share it.")).not.toBeInTheDocument();
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Enter a valid email address");
    expect(error).toHaveClass("animate-in");
    expect(screen.getByLabelText("Email").parentElement).toHaveClass("animate-shake");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", "email-error");
  });
});
