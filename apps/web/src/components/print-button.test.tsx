import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PrintButton } from "./print-button";

describe("PrintButton", () => {
  it("presents browser printing as a PDF export", () => {
    const markup = renderToStaticMarkup(<PrintButton />);

    expect(markup).toContain("Save as PDF");
    expect(markup).toContain("choose Save as PDF");
  });
});
