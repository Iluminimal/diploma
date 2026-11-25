import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testIntl } from "@/test/intl";
import { LanguageSwitcher } from "./language-switcher";

const refresh = vi.fn();
const setLocale = vi.fn<(locale: string) => Promise<void>>(async () => {});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/i18n/actions", () => ({ setLocale: (locale: string) => setLocale(locale) }));

beforeEach(() => {
  refresh.mockClear();
  setLocale.mockClear();
});

async function open(name: string) {
  render(<LanguageSwitcher />);
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("LanguageSwitcher", () => {
  it("shows the active language and lists every language in its own language", async () => {
    await open("Language: English");

    expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    const mongolian = screen.getByRole("menuitemradio", { name: "Монгол" });
    expect(mongolian).toHaveAttribute("aria-checked", "false");
    expect(mongolian).toHaveAttribute("lang", "mn");
  });

  it("has no currency choice: the shop prices in tugrik only", async () => {
    await open("Language: English");

    expect(screen.queryByText(/currency/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rates/i })).not.toBeInTheDocument();
  });

  it("saves a language and re-renders the page", async () => {
    await open("Language: English");
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Монгол" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setLocale).toHaveBeenCalledWith("mn");
  });

  it("does nothing when the active language is picked again", async () => {
    testIntl.locale = "mn";
    await open("Хэл: Монгол");

    await userEvent.click(screen.getByRole("menuitemradio", { name: "Монгол" }));

    expect(setLocale).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
