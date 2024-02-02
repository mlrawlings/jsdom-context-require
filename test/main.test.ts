import * as fs from "fs";
import * as assert from "assert";
import { createBrowser } from "../src";

describe("jsdom-context-require", () => {
  it("should require in a jsdom context", () => {
    const dir = __dirname;
    const browser = createBrowser({ dir });
    const docHtml = browser.require("./fixtures/document-html");
    assert.equal(typeof window, "undefined");
    assert.equal(docHtml.getHTML(), "<html><head></head><body></body></html>");
    docHtml.setTitle("changed");
    assert.equal(
      docHtml.getHTML(),
      "<html><head><title>changed</title></head><body></body></html>",
    );
  });

  it("should support initial html", () => {
    const dir = __dirname;
    const browser = createBrowser({ dir, html: "<body>Hello World</body>" });
    const docHtml = browser.require("./fixtures/document-html");
    assert.equal(typeof window, "undefined");
    assert.equal(
      docHtml.getHTML(),
      "<html><head></head><body>Hello World</body></html>",
    );
  });

  it("should call beforeParse with the window and jsdom context", () => {
    let _window;
    let _context;
    const dir = __dirname;
    const browser = createBrowser({
      dir,
      beforeParse(window, context) {
        _window = window;
        _context = context;
      },
    });

    assert.equal(browser, _context);
    assert.equal(browser.window, _window);
  });

  it("should support custom extensions", () => {
    const dir = __dirname;
    const browser = createBrowser({
      dir,
      extensions: {
        ".txt": (module, file) => {
          module.exports = fs.readFileSync(file, "utf-8");
        },
      },
    });
    const result = browser.require("./fixtures/file");
    assert.equal(result, "Some Text\n");
  });

  it("should support export remaps", () => {
    const dir = __dirname;
    const browser = createBrowser({ dir });
    const result = browser.require("./fixtures/exports-remap");
    assert.equal(result, "to");
  });

  it("should support browser field remaps", () => {
    const dir = __dirname;
    const browser = createBrowser({ dir });
    const result = browser.require("./fixtures/browser-remap/from");
    assert.equal(result, "to");
  });

  it("should support browser field false remap", () => {
    const dir = __dirname;
    const browser = createBrowser({ dir });
    const result = browser.require("./fixtures/browser-remap/missing");
    assert.deepStrictEqual(result, {});
  });
});
