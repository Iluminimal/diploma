import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CountrySelect, DEFAULT_REGION, PhoneInput, toE164, typePhone, type PhoneValue } from "./phone-input";

function Controlled({ initial = { text: "", region: DEFAULT_REGION } }: { initial?: PhoneValue }) {
  const [value, setValue] = useState(initial);
  return <PhoneInput value={value} onChange={setValue} />;
}

describe("CountrySelect", () => {
  it("offers a short list of the main countries with Mongolia first", () => {
    render(<CountrySelect value="MN" onChange={() => {}} />);

    const options = screen.getAllByRole("option");
    expect(options.length).toBeLessThanOrEqual(15);
    expect(options[0]).toHaveAccessibleName("Mongolia +976");
    expect(screen.getByRole("option", { name: "United States +1" })).toBeInTheDocument();
  });

  it("still shows a country that is not on the list when it was typed in full", () => {
    render(<CountrySelect value="IT" onChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("IT");
  });
});

describe("PhoneInput", () => {
  it("starts on Mongolia", () => {
    render(<Controlled />);

    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("MN");
  });

  it("a number typed in full picks its country", async () => {
    render(<Controlled />);

    await userEvent.type(screen.getByPlaceholderText("Phone number"), "+14155552671");

    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("US");
  });
});

describe("typePhone", () => {
  it("keeps the picked country for a national number", () => {
    expect(typePhone("80172121", "MN").region).toBe("MN");
  });

  it("takes the country from a number that starts with +", () => {
    expect(typePhone("+442079460958", "MN").region).toBe("GB");
  });
});

describe("toE164", () => {
  it("gives the international form of a valid number and null otherwise", () => {
    expect(toE164("8017 2121", "MN")).toBe("+97680172121");
    expect(toE164("(415) 555-2671", "US")).toBe("+14155552671");
    expect(toE164("12", "MN")).toBeNull();
  });
});
