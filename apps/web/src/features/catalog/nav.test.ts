import { describe, expect, it } from "vitest";
import { catalogNav } from "@/test/fixtures";
import { categoryHref, categoryPaths, drilldown, findTrail, matchCategories, popularTypes } from "./nav";

const men = catalogNav.departments[0]!;

describe("categoryHref", () => {
  it("builds department and category URLs", () => {
    expect(categoryHref("men")).toBe("/c/men");
    expect(categoryHref("men", "apparel/topwear")).toBe("/c/men/apparel/topwear");
  });
});

describe("findTrail", () => {
  it("resolves a department on its own", () => {
    expect(findTrail(catalogNav, "men")?.nodes).toEqual([]);
  });

  it("walks the URL segments down the tree", () => {
    const trail = findTrail(catalogNav, "men", ["apparel", "topwear", "tshirts"]);
    expect(trail?.nodes.map((n) => n.name)).toEqual(["Clothing", "Topwear", "T-shirts"]);
  });

  it.each([
    ["pets", []],
    ["men", ["footwear"]],
    ["men", ["apparel", "topwear", "dresses"]],
    ["men", ["apparel", "tshirts"]],
  ])("is null for %s / %j, which is not in the nav", (department, segments) => {
    expect(findTrail(catalogNav, department, segments)).toBeNull();
  });
});

describe("drilldown", () => {
  it("offers the groups at the top of a department", () => {
    expect(drilldown(men, []).options.map((n) => n.name)).toEqual(["Clothing"]);
  });

  it("offers the children of the current node", () => {
    const { ancestors, options } = drilldown(men, findTrail(catalogNav, "men", ["apparel", "topwear"])!.nodes);
    expect(ancestors.map((n) => n.name)).toEqual(["Clothing", "Topwear"]);
    expect(options.map((n) => n.name)).toEqual(["T-shirts", "Shirts"]);
  });

  it("offers the siblings on a leaf, which has nothing below it", () => {
    const { ancestors, options, current } = drilldown(men, findTrail(catalogNav, "men", ["apparel", "topwear", "tshirts"])!.nodes);
    expect(ancestors.map((n) => n.name)).toEqual(["Clothing", "Topwear"]);
    expect(options.map((n) => n.name)).toEqual(["T-shirts", "Shirts"]);
    expect(current?.name).toBe("T-shirts");
  });
});

describe("categoryPaths", () => {
  it("lists every department and node once", () => {
    expect(categoryPaths(catalogNav)).toContain("/c/men");
    expect(categoryPaths(catalogNav)).toContain("/c/women/apparel/topwear/tshirts");
    expect(new Set(categoryPaths(catalogNav)).size).toBe(categoryPaths(catalogNav).length);
  });
});

describe("matchCategories", () => {
  it("matches names case-insensitively, biggest first, up to the limit", () => {
    const hits = matchCategories(catalogNav, "SHIRT", 2);
    expect(hits.map((h) => `${h.node.name}/${h.department.slug}`)).toEqual(["T-shirts/men", "T-shirts/women"]);
  });

  it("finds nothing for blank text", () => {
    expect(matchCategories(catalogNav, "  ", 5)).toEqual([]);
  });
});

describe("popularTypes", () => {
  it("returns the biggest article types of a department", () => {
    expect(popularTypes(men, 1).map((n) => n.name)).toEqual(["T-shirts"]);
  });
});
