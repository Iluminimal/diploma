import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkBar } from "./bulk-bar";
import { DataTable, nextSort, useSelection, type Column } from "./data-table";
import { SegmentedControl, SegmentedNav } from "./segmented";
import { monotonePath } from "./chart-math";
import { StatusDot } from "./status-dot";

type Row = { id: number; name: string; price: number };
const ROWS: Row[] = [
  { id: 1, name: "Shirt", price: 20 },
  { id: 2, name: "Jeans", price: 40 },
];
const COLUMNS: Column<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name },
  { id: "price", header: "Price", align: "right", sort: { asc: "price_asc", desc: "price_desc" }, cell: (r) => `$${r.price}` },
];

afterEach(() => vi.unstubAllGlobals());

function narrowScreen() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width: 767px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("monotonePath", () => {
  it("never dips below a flat stretch (no overshoot between zero days)", () => {
    // x = 0, 25, 50, 75, 100; y: the baseline (value 0) is 30, the peak is 2.
    const points = [[0, 30], [25, 30], [50, 2], [75, 30], [100, 30]] as const;
    const ys = [...monotonePath(points).matchAll(/C[\d.]+ ([\d.]+), [\d.]+ ([\d.]+),/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(30); // the baseline (value 0)
  });

  it("handles one point and no points", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([[5, 6]])).toBe("M5 6");
  });
});

describe("nextSort", () => {
  const sort = { asc: "price_asc", desc: "price_desc" };

  it("starts ascending, then flips between the two directions", () => {
    expect(nextSort(undefined, sort)).toBe("price_asc");
    expect(nextSort("price_asc", sort)).toBe("price_desc");
    expect(nextSort("price_desc", sort)).toBe("price_asc");
  });

  it("uses the only direction there is", () => {
    expect(nextSort("newest", { asc: "stock_asc" })).toBe("stock_asc");
    expect(nextSort("stock_asc", { asc: "stock_asc" })).toBe("stock_asc");
  });
});

describe("SegmentedNav", () => {
  it("marks the current link and shows counts", () => {
    render(
      <SegmentedNav
        label="Order status"
        value="paid"
        items={[
          { key: "all", label: "All", count: 6, href: "/a" },
          { key: "paid", label: "To ship", count: 3, href: "/b" },
        ]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Order status" });
    expect(within(nav).getByRole("link", { name: "To ship 3" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "All 6" })).not.toHaveAttribute("aria-current");
  });
});

describe("SegmentedControl", () => {
  it("reports the choice and exposes it as pressed", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="View"
        value="table"
        onChange={onChange}
        items={[
          { key: "table", label: "Table" },
          { key: "grid", label: "Grid" },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(onChange).toHaveBeenCalledWith("grid");
  });
});

describe("StatusDot", () => {
  it("says the status in words", () => {
    render(<StatusDot tone="success">Delivered</StatusDot>);
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });
});

describe("DataTable", () => {
  const props = { caption: "Products", columns: COLUMNS, rows: ROWS, rowKey: (r: Row) => r.id };

  it("renders a captioned table with the rows", () => {
    render(<DataTable {...props} />);

    const table = screen.getByRole("table", { name: "Products" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("$40")).toBeInTheDocument();
  });

  it("turns a sortable header into a link to the next sort and says which way it is sorted", () => {
    render(<DataTable {...props} sort="price_asc" sortHref={(s) => `/p?sort=${s}`} />);

    expect(screen.getByRole("columnheader", { name: "Price" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("link", { name: "Price" })).toHaveAttribute("href", "/p?sort=price_desc");
    expect(screen.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");
  });

  it("selects rows and all rows", async () => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();
    render(
      <DataTable
        {...props}
        selection={{ selected: new Set([1]), onToggle, onToggleAll, label: (r) => `Select ${r.name}`, selectAllLabel: "Select all" }}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select Shirt" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Jeans" }));
    expect(onToggle).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it("shows cards instead of the table on a phone, never both", () => {
    narrowScreen();
    render(<DataTable {...props} renderCard={(r) => <span>{r.name} card</span>} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Products" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Shirt card")).toBeInTheDocument();
  });

  it("keeps the table on a phone when there is no card layout", () => {
    narrowScreen();
    render(<DataTable {...props} />);

    expect(screen.getByRole("table", { name: "Products" })).toBeInTheDocument();
  });
});

describe("useSelection", () => {
  it("toggles, selects everything and clears", () => {
    const { result } = renderHook(() => useSelection<number>());

    act(() => result.current.toggle(1));
    expect([...result.current.selected]).toEqual([1]);
    act(() => result.current.toggle(1));
    expect(result.current.selected.size).toBe(0);
    act(() => result.current.setAll([1, 2, 3], true));
    expect(result.current.selected.size).toBe(3);
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });
});

describe("BulkBar", () => {
  it("is absent without a selection", () => {
    const { container } = render(
      <BulkBar count={0} label="0 selected" clearLabel="Clear" onClear={() => {}}>
        x
      </BulkBar>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the actions and a way to clear", async () => {
    const onClear = vi.fn();
    render(
      <BulkBar count={2} label="2 selected" clearLabel="Clear selection" onClear={onClear}>
        <button>Withdraw</button>
      </BulkBar>,
    );

    expect(screen.getByRole("region", { name: "2 selected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalled();
  });
});
