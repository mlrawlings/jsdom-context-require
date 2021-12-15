import * as fs from "fs";
import * as path from "path";
import { DOMWindow, JSDOM, ConstructorOptions } from "jsdom";
import * as browserResolve from "lasso-resolve-from";
import createContextRequire, {
  Types as TContextRequire
} from "context-require";

const remapCache = Object.create(null);
const coverage =
  (global as any).__coverage__ || ((global as any).__coverage__ = {});

export namespace Types {
  export interface Options extends Omit<ConstructorOptions, "beforeParse"> {
    /** The directory from which to resolve requires for this module. */
    dir: string;
    /** The initial html to parse with jsdom. */
    html?: string;
    /** An object containing any browser specific require hooks to be used in this module. */
    extensions?: TContextRequire.Hooks;
    /** A function called with the window, and the module, before parsing html. */
    beforeParse?(window: DOMWindow, context: JSDOMModule): void;
  }

  export interface JSDOMModule extends JSDOM {
    require: TContextRequire.RequireFunction;
  }
}

// Expose module.
module.exports = exports = createJSDOMContextRequire;
export default createJSDOMContextRequire;

/**
 * Creates a custom Module object which runs all required scripts
 * in a new jsdom instance.
 */
function createJSDOMContextRequire(options: Types.Options): Types.JSDOMModule {
  const { html, dir, extensions, beforeParse, ...jsdomOptions } = options;
  const context = new JSDOM("", {
    runScripts: "dangerously",
    ...jsdomOptions
  }) as Types.JSDOMModule;
  const { window } = context;
  const resolveConfig = {
    remaps: loadRemaps,
    extensions:
      extensions &&
      ([] as string[])
        .concat(Object.keys(require.extensions))
        .concat(Object.keys(extensions))
        .filter(unique)
  };

  context.require = createContextRequire({ dir, context, resolve, extensions });

  // Pass through istanbul coverage.
  window.__coverage__ = coverage;
  // Expose some globals commonly shimmed by bundlers.
  window.global = window;
  window.Buffer = Buffer;
  window.process = { ...process, browser: true };
  window.setImmediate =
    window.setImmediate ||
    (() => {
      const msg = `${Math.random()}`;
      let queue: Array<(...args: unknown[]) => void | undefined> = [];
      let offset = 0;

      window.addEventListener("message", ev => {
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
      };

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
    })();

  if (beforeParse) {
    beforeParse(window, context);
  }

  window.document.open();
  window.document.write(
    html || "<!DOCTYPE html><html><head></head><body></body></html>"
  );

  return context;

  /**
   * A function to resolve modules in the browser using the provided config.
   *
   * @param from The file being resolved from.
   * @param request The requested path to resolve.
   */
  function resolve(from: string, request: string): string {
    const resolved = browserResolve(from, request, resolveConfig);
    if (!resolved) {
      throw new Error(
        `Could not resolve ${JSON.stringify(request)} from ${JSON.stringify(
          from
        )}`
      );
    }

    return fs.realpathSync(resolved.path);
  }
}

/**
 * Array filter for uniqueness.
 */
function unique(item: any, i: number, list: any[]): boolean {
  return list.indexOf(item) === i;
}

/**
 * Loads browser.json remaps.
 *
 * @param dir The directory to load remaps from.
 */
function loadRemaps(dir: string) {
  const file = path.join(dir, "browser.json");

  if (file in remapCache) {
    return remapCache[file];
  }

  let result;
  const remaps = fs.existsSync(file) && require(file).requireRemap;

  if (remaps) {
    result = {};
    for (const remap of remaps) {
      result[path.join(dir, remap.from)] = path.join(dir, remap.to);
    }
  }

  remapCache[file] = result;
  return result;
}
