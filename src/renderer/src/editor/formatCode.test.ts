import { describe, expect, it } from "vitest";
import { formatCode } from "./formatCode";

describe("formatCode", () => {
  it("formats HTML with 2-space indent and breaks tags onto their own lines", async () => {
    const messy = `<html><body><h1>Hi</h1><p>Hello   world</p></body></html>`;
    const result = await formatCode("index.html", messy);
    expect(result.changed).toBe(true);
    expect(result.content).toBe(
      [
        "<html>",
        "  <body>",
        "    <h1>Hi</h1>",
        "    <p>Hello world</p>",
        "  </body>",
        "</html>",
        "",
      ].join("\n"),
    );
  });

  it("formats CSS with 2-space indent", async () => {
    const messy = `body{color:red;background: blue;   font-size:14px;}`;
    const result = await formatCode("style.css", messy);
    expect(result.changed).toBe(true);
    expect(result.content).toBe(
      ["body {", "  color: red;", "  background: blue;", "  font-size: 14px;", "}", ""].join("\n"),
    );
  });

  it("formats JavaScript with semicolons and double quotes", async () => {
    const messy = `const  greet = ( name )=>{return 'hello '+name}`;
    const result = await formatCode("game.js", messy);
    expect(result.changed).toBe(true);
    expect(result.content).toContain('"hello "');
    expect(result.content).toContain(";");
    expect(result.content).toContain("(name) =>");
  });

  it("returns the original content for files with unknown extensions", async () => {
    const original = "# README\n\nplain text";
    const result = await formatCode("README.md", original);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(original);
  });

  it("returns the original content for files with no extension", async () => {
    const original = "no extension here";
    const result = await formatCode("notes", original);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(original);
  });

  it("returns the original content when JavaScript has a syntax error", async () => {
    const broken = "function () { not real js (((";
    const result = await formatCode("broken.js", broken);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(broken);
  });

  it("reports changed=false when input is already well-formatted", async () => {
    const tidy = ["body {", "  color: red;", "}", ""].join("\n");
    const result = await formatCode("style.css", tidy);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(tidy);
  });
});
