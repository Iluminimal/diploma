import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormAlert } from "./form-alert";
import { NativeSelect } from "./native-select";

describe("FormAlert", () => {
  it("is announced to screen readers and carries the shared look", () => {
    render(<FormAlert>Could not save</FormAlert>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert.className).toContain("text-destructive-text");
  });

  it("lets a caller add spacing without losing the look", () => {
    render(<FormAlert className="mt-4">Nope</FormAlert>);

    expect(screen.getByRole("alert").className).toContain("mt-4");
    expect(screen.getByRole("alert").className).toContain("bg-destructive/10");
  });
});

describe("NativeSelect", () => {
  it("is a real select, so the phone's own picker and the keyboard keep working", async () => {
    const onChange = vi.fn();
    render(
      <NativeSelect aria-label="Region" defaultValue="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </NativeSelect>,
    );

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Region" }), "b");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox", { name: "Region" })).toHaveValue("b");
  });

  it("shows invalid state through aria-invalid and has a compact pill variant", () => {
    render(
      <>
        <NativeSelect aria-label="Field" aria-invalid>
          <option>x</option>
        </NativeSelect>
        <NativeSelect aria-label="Toolbar" variant="pill">
          <option>y</option>
        </NativeSelect>
      </>,
    );

    expect(screen.getByRole("combobox", { name: "Field" })).toBeInvalid();
    expect(screen.getByRole("combobox", { name: "Toolbar" }).className).toContain("rounded-full");
  });
});
