import { join } from "path";
import * as resolveExports from "resolve.exports";
import * as resolveFile from "resolve";
import { type ConstructorOptions, type DOMWindow, JSDOM } from "jsdom";
import createContextRequire, {
  type Types as ContextRequire,
} from "context-require";

const noopModule = join(__dirname, "../noop.js");
const exportsMainFile = `__package_exports__`;
const resolveExportsOptions: resolveExports.Options = {
  unsafe: true,
  browser: true,
  conditions: ["default", "require", "browser"],
};

export interface Browser extends JSDOM {
  require: ContextRequire.RequireFunction;
  window: DOMWindow & Global;
  yield(): Promise<void>;
}

export interface Options
  extends Omit<
    ConstructorOptions,
    "dir" | "html" | "extensions" | "beforeParse"
  > {
  /** The directory from which to resolve requires for this module. */
  dir: string;
  /** The initial html to parse with jsdom. */
  html?: string;
  /** An object containing any browser specific require hooks to be used in this module. */
  extensions?: ContextRequire.Hooks;
  /** A function called with the window, and the module, before parsing html. */
  beforeParse?(window: DOMWindow, browser: Browser): void;
}

/**
 * Creates a custom Module object which runs all required scripts
 * in a new jsdom instance.
 */
export function createBrowser({
  dir,
  html,
  extensions,
  beforeParse,
  ...jsdomOptions
}: Options): Browser {
  const browser = new JSDOM("", {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    ...jsdomOptions,
  }) as Browser;
  const resolveExtensions = extensions
    ? [
        ...new Set([
          ...Object.keys(require.extensions),
          ...Object.keys(extensions),
        ]),
      ]
    : Object.keys(require.extensions);
  const window = browser.window;

  // Pass through istanbul coverage.
  if ("__coverage__" in globalThis) {
    (window as any).__coverage__ = (globalThis as any).__coverage__;
  }

  // Expose some globals commonly shimmed by bundlers.
  window.global = window;
  window.Buffer = Buffer;
  window.process = { ...process, browser: true } as any;
  window.setImmediate ||= (() => {
    const msg = `${Math.random()}`;
    let queue: Array<undefined | ((...args: unknown[]) => void)> = [];
    let offset = 0;

    window.addEventListener("message", (ev) => {
      if (ev.data === msg) {
        const cbs = queue;
        offset += cbs.length;
        queue = [];
        for (const cb of cbs) {
          if (cb) {
            cb();
          }
        }
      }
    });

    window.clearImmediate = function clearImmediate(id: number) {
      const index = id - offset;
      if (index >= 0) {
        queue[index] = undefined;
      }
    } as any;

    return function setImmediate(
      cb: (...args: unknown[]) => void,
      ...args: unknown[]
    ) {
      const index = queue.push(args.length ? () => cb(...args) : cb) - 1;
      if (!index) {
        window.postMessage(msg, "*");
      }
      return index + offset;
    };
  })() as any;

  browser.require = createContextRequire({
    dir,
    context: browser,
    extensions,
    resolve(basedir, req, { filename }) {
      return resolveFile.sync(req, {
        basedir,
        filename,
        pathFilter,
        packageFilter,
        extensions: resolveExtensions,
      } as resolveFile.SyncOpts);
    },
  });

  browser.yield = () =>
    new Promise<void>((resolve) => window.setImmediate(resolve));

  if (beforeParse) {
    beforeParse(window, browser);
  }

  window.document.open();
  window.document.write(
    html || "<!DOCTYPE html><html><head></head><body></body></html>",
  );

  return browser;

  function pathFilter(
    pkg: resolveFile.PackageJSON,
    _file: string,
    relativePath: string,
  ): string {
    if (pkg.exports) {
      return resolveExports.exports(
        pkg,
        relativePath === exportsMainFile ? "." : relativePath,
        resolveExportsOptions,
      )?.[0] as string;
    } else if (pkg.browser) {
      const pkgBrowser = pkg.browser as Record<string, string | false> | string;
      let requestedFile = relativePath === exportsMainFile ? "." : relativePath;

      if (typeof pkgBrowser === "string") {
        switch (requestedFile) {
          case ".":
          case "./":
            return pkgBrowser;
          default:
            return requestedFile;
        }
      }

      let replacement = pkgBrowser[requestedFile];
      if (replacement !== undefined) {
        return replacementOrNoop(replacement);
      }

      if (requestedFile === ".") {
        // Check `.` and `./`
        requestedFile = "./";
        replacement = pkgBrowser[requestedFile];
        if (replacement !== undefined) {
          return replacementOrNoop(replacement);
        }
      } else if (requestedFile[0] !== ".") {
        requestedFile = `./${requestedFile}`;
        replacement = pkgBrowser[requestedFile];
        if (replacement !== undefined) {
          return replacementOrNoop(replacement);
        }
      }

      const isFolder = requestedFile[requestedFile.length - 1] === "/";
      if (isFolder) {
        // If we're definitely matching a folder we'll try adding `index` to the
        // end first.
        requestedFile += "index";
        replacement = pkgBrowser[requestedFile];
        if (replacement !== undefined) {
          return replacementOrNoop(replacement);
        }
      }

      for (const ext of resolveExtensions) {
        replacement = pkgBrowser[requestedFile + ext];
        if (replacement !== undefined) {
          return replacementOrNoop(replacement);
        }
      }

      if (!isFolder) {
        // If we're not matching a folder we'll try adding `/index` to the end.
        requestedFile += "/index";
        replacement = pkgBrowser[requestedFile];
        if (replacement !== undefined) {
          return replacementOrNoop(replacement);
        }

        for (const ext of resolveExtensions) {
          replacement = pkgBrowser[requestedFile + ext];
          if (replacement !== undefined) {
            return replacementOrNoop(replacement);
          }
        }
      }
    }

    return relativePath;
  }
}

function packageFilter<
  T extends { main?: unknown; exports?: unknown; browser?: unknown },
>(pkg: T) {
  if (pkg.exports || pkg.browser) {
    // defers to the "exports" field.
    pkg.main = exportsMainFile;
  }

  return pkg;
}

function replacementOrNoop(id: string | false) {
  return id === false ? noopModule : id;
}
