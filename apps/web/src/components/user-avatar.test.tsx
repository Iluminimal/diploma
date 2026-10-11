import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar, initials } from "./user-avatar";

describe("initials", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["ada", "A"],
    ["  grace   brewster  murray hopper ", "GH"],
    ["élodie Ñuñez", "ÉÑ"],
    ["", "?"],
  ])("%j -> %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("UserAvatar", () => {
  it("shows the photo when there is one, without sending a referrer", () => {
    const { container } = render(<UserAvatar user={{ full_name: "Ada Lovelace", avatar_url: "https://example.com/ada.png" }} />);

    const image = container.querySelector("img")!;
    expect(image).toHaveAttribute("src", "https://example.com/ada.png");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("shows initials without a photo", () => {
    render(<UserAvatar user={{ full_name: "Ada Lovelace", avatar_url: null }} />);

    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to initials when the photo does not load", () => {
    const { container } = render(<UserAvatar user={{ full_name: "Ada Lovelace", avatar_url: "https://example.com/gone.png" }} />);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });
});
