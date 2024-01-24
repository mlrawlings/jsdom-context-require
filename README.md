<h1 align="center">
  <!-- Logo -->
  jsdom-context-require
  <br/>

  <!-- Stability -->
  <a href="https://nodejs.org/api/documentation.html#documentation_stability_index">
    <img src="https://img.shields.io/badge/stability-stable-brightgreen.svg" alt="API Stability"/>
  </a>
  <!-- TypeScript -->
  <a href="http://typescriptlang.org">
    <img src="https://img.shields.io/badge/%3C%2F%3E-typescript-blue.svg" alt="TypeScript"/>
  </a>
  <!-- Prettier -->
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with prettier"/>
  </a>
  <!-- Travis build -->
  <a href="https://travis-ci.org/mlrawlings/jsdom-context-require">
  <img src="https://img.shields.io/travis/mlrawlings/jsdom-context-require.svg" alt="Build status"/>
  </a>
  <!-- Coveralls coverage -->
  <a href="https://coveralls.io/github/mlrawlings/jsdom-context-require">
    <img src="https://img.shields.io/coveralls/mlrawlings/jsdom-context-require.svg" alt="Test Coverage"/>
  </a>
  <!-- NPM version -->
  <a href="https://npmjs.org/package/jsdom-context-require">
    <img src="https://img.shields.io/npm/v/jsdom-context-require.svg" alt="NPM Version"/>
  </a>
  <!-- Downloads -->
  <a href="https://npmjs.org/package/jsdom-context-require">
    <img src="https://img.shields.io/npm/dm/jsdom-context-require.svg" alt="Downloads"/>
  </a>
</h1>

Creates a new require function which runs all required modules in a new `jsdom window` context instead of `global`.
Supports custom `require extensions` and `resolvers`. Also automatically resolves `browser` fields in `package.json`.

Ultimately this allows you to run tests with JSDOM without exposing your nodejs globals, or using a bundler.

# Installation

```console
npm install jsdom jsdom-context-require -D
```

Note: JSDOM is required as a peerDependency as of `jsdom-context-require@4`

# Example

**./index.js**
```javascript
import { createBrowser } from "jsdom-context-require";

const browser = createBrowser({
  dir: __dirname, // The path to resolve new requires from.
  html: "<div>Hello World</div>" // Initial jsdom html.
  extensions: ..., // Same as require.extensions but only used in the jsdom context.
  // All other options forwarded to jsdom.
});

const titleSetter = browser.require("./set-document-title");

titleSetter("Updated!");

assert.equal(browser.window.document.title, "Updated!");
```

**./set-document-title.js**
```js
const $ = require("jquery"); // Any subsequent requires are evaluated in the jsdom window as well.

typeof global; // undefined

module.exports = (title) => {
  document.title = title;
}
```

# Additional browser apis

The result of `createBrowser` api gives you a [jsdom instance](https://github.com/jsdom/jsdom?tab=readme-ov-file#jsdom-object-api).
The following methods are added to the jsdom instance:

## browser.require(id: string): Exports

This is the same as the `require` function in node, except with all modules evaluated in the jsdom window's context.

## browser.yield(): Promise<void>

Waits for one macro task (`setImmediate`) to occur in the browser.

## browser.act<T>(fn?: () => T): Promise<Awaited<T>>

Runs and awaits a given (optional) function, then waits for a macro task (see [browser.yield](#browseryield-promise)).
This helper also keeps track of any uncaught errors within the browser context and will reject the promise with the error, or an AggregateError if there are any.

### Contributions

* Use `npm test` to build and run tests.

Please feel free to create a PR!
