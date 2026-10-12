import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "./otp-input";

function Harness({ onComplete, invalid = false }: { onComplete?: (code: string) => void; invalid?: boolean }) {
  const [value, setValue] = useState("");
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} invalid={invalid} />;
}

const box = (n: number) => screen.getByLabelText(`Digit ${n} of 6`);

describe("OtpInput", () => {
  it("moves along as digits are typed and reports the finished code once", async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    await userEvent.click(box(1));
    await userEvent.keyboard("12345");
    expect(onComplete).not.toHaveBeenCalled();
    await userEvent.keyboard("6");

    expect(onComplete).toHaveBeenCalledExactlyOnceWith("123456");
    expect([1, 2, 3, 4, 5, 6].map((n) => (box(n) as HTMLInputElement).value)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("ignores everything that is not a digit", async () => {
    render(<Harness />);

    await userEvent.click(box(1));
    await userEvent.keyboard("a-b9");

    expect((box(1) as HTMLInputElement).value).toBe("9");
    expect((box(2) as HTMLInputElement).value).toBe("");
  });

  it("spreads a pasted code (or an autofilled one) over the boxes, spaces and all", async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    await userEvent.click(box(3));
    await userEvent.paste("987 654");

    expect(onComplete).toHaveBeenCalledExactlyOnceWith("987654");
    expect((box(1) as HTMLInputElement).value).toBe("9");
    expect((box(6) as HTMLInputElement).value).toBe("4");
  });

  it("steps back and erases with Backspace, and the arrow keys move between boxes", async () => {
    render(<Harness />);
    await userEvent.click(box(1));
    await userEvent.keyboard("123");

    await userEvent.keyboard("{Backspace}");
    expect((box(3) as HTMLInputElement).value).toBe("");
    await userEvent.keyboard("{Backspace}");
    expect((box(2) as HTMLInputElement).value).toBe("");
    expect(box(2)).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(box(3)).toHaveFocus();
  });

  it("offers the browser's one-time-code autofill on the first box and marks errors", () => {
    render(<Harness invalid />);

    expect(box(1)).toHaveAttribute("autocomplete", "one-time-code");
    expect(box(1)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("group", { name: "6-digit code" })).toHaveClass("animate-shake");
  });
});
