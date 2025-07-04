import { type ConstructorOptions, type DOMWindow, JSDOM } from "jsdom";
import createContextRequire, {
  type Types as ContextRequire,
} from "context-require";
import { resolve } from "./resolve";

export interface Browser extends JSDOM {
  require: ContextRequire.RequireFunction;
  window: DOMWindow & Global;
  yield(): Promise<void>;
  act<T = unknown>(fn?: () => T): Promise<Awaited<T>>;
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
  const { window } = browser;
  const resolveExtensions = extensions
    ? [
        ...new Set([
          ...Object.keys(extensions),
          ...Object.keys(require.extensions).reverse(),
        ]),
      ]
    : Object.keys(require.extensions).reverse();

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
      const resolved = resolve(req, basedir, resolveExtensions);
      if (resolved) return resolved;

      throw new Error(`Cannot find module '${req}' from '${filename}'`);
    },
  });

  browser.yield = () =>
    new Promise<void>((resolve) => window.setImmediate(resolve));
  browser.act = async <T>(fn?: () => T): Promise<Awaited<T>> => {
    let errors: undefined | Error | Set<Error>;
    let errorStage = 0;
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleError);

    try {
      const result = await fn?.();
      await browser.yield();
      return result;
    } catch (err) {
      trackError(err);
    } finally {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleError);
      switch (errorStage) {
        case 0:
          break;
        case 1:
          throw errors as Error;
        default:
          throw new window.AggregateError(errors as Set<Error>);
      }
    }

    function handleError(ev: ErrorEvent | PromiseRejectionEvent) {
      if (!ev.defaultPrevented) {
        let error = "error" in ev ? ev.error : ev.reason || ev;
        if ("detail" in error) error = error.detail;
        trackError(error);
        ev.preventDefault();
      }
    }

    function trackError(err: Error) {
      switch (errorStage) {
        case 0:
          errors = err;
          errorStage = 1;
          break;
        case 1:
          if (err !== errors) {
            errors = new Set([errors as Error, err]);
            errorStage = 2;
          }
          break;
        default:
          (errors as Set<Error>).add(err);
          break;
      }
    }
  };

  if (beforeParse) {
    beforeParse(window, browser);
  }

  window.document.open();
  window.document.write(
    html || "<!DOCTYPE html><html><head></head><body></body></html>",
  );

  return browser;
}
