import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhoneInput, toE164 } from "./phone-input";

const value = { text: "", region: "US" } as const;

describe("PhoneInput", () => {
  it("lists every country, sorted by name, once mounted", () => {
    render(<PhoneInput value={value} onChange={() => {}} />);

    const options = screen.getByRole("combobox", { name: "Country" }).querySelectorAll("option");
    expect(options.length).toBeGreaterThan(200);
    const names = [...options].map((o) => o.getAttribute("aria-label")!);
    expect(names).toEqual([...names].sort(new Intl.Collator("en").compare));
    expect(screen.getByRole("option", { name: "United States +1" })).toBeInTheDocument();
  });

  it("renders only the chosen country on the server, so it cannot differ from the client's first render", () => {
    const html = renderToString(<PhoneInput value={{ text: "", region: "GB" }} onChange={() => {}} />);

    expect(html.match(/<option/g)).toHaveLength(1);
    expect(html).toContain('value="GB"');
  });
});

describe("toE164", () => {
  it("gives the international form of a valid number and null otherwise", () => {
    expect(toE164("(415) 555-2671", "US")).toBe("+14155552671");
    expect(toE164("12", "US")).toBeNull();
  });
});
