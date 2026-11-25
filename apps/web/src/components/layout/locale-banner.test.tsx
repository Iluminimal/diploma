import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import mn from "../../../messages/mn";
import { LocaleBannerClient } from "./locale-banner-client";

const refresh = vi.fn();
const setLocale = vi.fn<(locale: string) => Promise<void>>(async () => {});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/i18n/actions", () => ({ setLocale: (locale: string) => setLocale(locale) }));

const copy = mn.layout.localeBanner;

beforeEach(() => {
  refresh.mockClear();
  setLocale.mockClear();
});

function renderBanner() {
  return render(<LocaleBannerClient current="en" suggested="mn" copy={copy} />);
}

describe("LocaleBannerClient", () => {
  it("speaks the suggested language and preselects it", () => {
    renderBanner();

    const banner = screen.getByRole("region", { name: copy.label });
    expect(banner).toHaveAttribute("lang", "mn");
    expect(banner).toHaveTextContent(copy.message);
    expect(screen.getByRole("combobox", { name: copy.select })).toHaveValue("mn");
  });

  it("switches to the selected language on continue", async () => {
    renderBanner();

    await userEvent.click(screen.getByRole("button", { name: copy.continue }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setLocale).toHaveBeenCalledWith("mn");
  });

  it("keeps the current language without reloading when it is selected", async () => {
    renderBanner();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: copy.select }), "en");
    await userEvent.click(screen.getByRole("button", { name: copy.continue }));

    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
    expect(setLocale).toHaveBeenCalledWith("en");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("remembers the current language when closed", async () => {
    renderBanner();

    await userEvent.click(screen.getByRole("button", { name: copy.close }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(setLocale).toHaveBeenCalledWith("en");
    expect(refresh).not.toHaveBeenCalled();
  });
});
