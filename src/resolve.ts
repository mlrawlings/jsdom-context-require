import * as fs from "fs";
import * as path from "path";
import * as resolveExports from "resolve.exports";

const modulePartsReg = /^((?:@[^/]+\/)?[^/]+)(\/.*)?$/;
const noopModule = path.join(__dirname, "../noop.js");
const resolveExportsOptions: resolveExports.Options = {
  unsafe: true,
  browser: true,
  require: true,
  conditions: ["default", "require", "browser"],
};

export function resolve(
  id: string,
  from: string,
  extensions: string[],
): string | undefined {
  switch (id[0]) {
    case ".": {
      return tryRealPath(resolveFile(path.join(from, id), extensions));
    }

    case "#": {
      const pkg = tryReadPackage(from);
      if (pkg) {
        const resolvedImport = resolveExports.imports(
          pkg,
          id,
          resolveExportsOptions,
        );

        if (resolvedImport) {
          const resolved = path.join(from, resolvedImport[0]);
          if (tryStat(resolved)?.isFile()) {
            return tryRealPath(resolved);
          }
        }
      }

      return;
    }

    default:
      return tryRealPath(resolvePackage(id, from, extensions));
  }
}

function resolvePackage(id: string, from: string, extensions: string[]) {
  const [, name, subPath = ""] = modulePartsReg.exec(id)!;
  for (const modulesDir of getNodeModulesPaths(from)) {
    const moduleDir = path.join(modulesDir, name);
    const pkg = tryReadPackage(moduleDir);
    if (pkg) {
      return resolveWithPackage(pkg, moduleDir, `.${subPath}`, extensions);
    }
  }
}

function resolveWithPackage(
  pkg: Record<string, unknown>,
  moduleDir: string,
  id: string,
  extensions: string[],
): string {
  if (pkg.exports) {
    const resolvedExports = resolveExports.exports(
      pkg,
      id,
      resolveExportsOptions,
    );
    if (resolvedExports) {
      const resolved = path.join(moduleDir, resolvedExports[0]);
      return tryStat(resolved)?.isFile() ? resolved : undefined;
    }

    return;
  }

  const resolvedLegacy = resolveLegacyPackage(id, pkg, extensions);

  if (resolvedLegacy) {
    return resolveFile(path.join(moduleDir, resolvedLegacy), extensions);
  } else if (resolvedLegacy === false) {
    return noopModule;
  } else {
    return resolveFile(path.join(moduleDir, id), extensions);
  }
}

function resolveLegacyPackage(
  id: string,
  pkg: Record<string, unknown>,
  extensions: string[],
): string | false | undefined {
  if (pkg.browser) {
    const pkgBrowser = pkg.browser as Record<string, string | false> | string;
    let curId = id;
    if (typeof pkgBrowser === "string") {
      switch (curId) {
        case ".":
        case "./":
          return pkgBrowser;
        default:
          return curId;
      }
    }

    let replacement = pkgBrowser[curId];
    if (replacement !== undefined) {
      return replacement;
    }

    if (curId === ".") {
      // Check `.` and `./`
      curId = "./";
      replacement = pkgBrowser[curId];
      if (replacement !== undefined) {
        return replacement;
      }
    }

    const isFolder = curId[curId.length - 1] === "/";
    if (isFolder) {
      // If we're definitely matching a folder we'll try adding `index` to the
      // end first.
      curId += "index";
      replacement = pkgBrowser[curId];
      if (replacement !== undefined) {
        return replacement;
      }
    }

    for (const ext of extensions) {
      replacement = pkgBrowser[curId + ext];
      if (replacement !== undefined) {
        return replacement;
      }
    }

    if (!isFolder) {
      // If we're not matching a folder we'll try adding `/index` to the end.
      curId += "/index";
      replacement = pkgBrowser[curId];
      if (replacement !== undefined) {
        return replacement;
      }

      for (const ext of extensions) {
        replacement = pkgBrowser[curId + ext];
        if (replacement !== undefined) {
          return replacement;
        }
      }
    }
  }

  switch (id) {
    case ".":
    case "./":
      return (pkg.main as string | undefined) || "./index";
  }

  return id;
}

function resolveFile(file: string, extensions: string[]): string | undefined {
  const stat = tryStat(file);
  return stat?.isFile()
    ? file
    : resolveExtensions(file, extensions) ||
        (stat?.isDirectory() ? resolveDir(file, extensions) : undefined);
}

function resolveDir(dir: string, extensions: string[]): string | undefined {
  const pkg = tryReadPackage(dir);
  return (
    (pkg && resolveWithPackage(pkg, dir, ".", extensions)) ||
    resolveExtensions(path.join(dir, "index"), extensions)
  );
}

function resolveExtensions(
  file: string,
  extensions: string[],
): string | undefined {
  for (const ext of extensions) {
    const resolved = file + ext;
    if (tryStat(resolved)?.isFile()) {
      return resolved;
    }
  }
}

function tryRealPath(file: string | undefined): string | undefined {
  if (file) {
    try {
      return fs.realpathSync(file);
    } catch {
      return;
    }
  }
}

function tryStat(file: string): fs.Stats | undefined {
  try {
    return fs.statSync(file);
  } catch {
    return;
  }
}

function tryReadPackage(dir: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
  } catch {
    return;
  }
}

// // unix
// getNodeModulesPaths("/")
// getNodeModulesPaths("/a")
// getNodeModulesPaths("/a/")
// getNodeModulesPaths("/a/b")
// getNodeModulesPaths("/a/b/")
// getNodeModulesPaths("/Users")
// getNodeModulesPaths("/Users/")
// getNodeModulesPaths("/Users/src")
// getNodeModulesPaths("/Users/src/")
// // windows
// getNodeModulesPaths("C:")
// getNodeModulesPaths("C:\\")
// getNodeModulesPaths("C:\\a")
// getNodeModulesPaths("C:\\a\\")
// getNodeModulesPaths("C:\\a\\b")
// getNodeModulesPaths("C:\\a\\b\\")
// getNodeModulesPaths("C:\\Users")
// getNodeModulesPaths("C:\\Users\\")
// getNodeModulesPaths("C:\\Users\\src")
// getNodeModulesPaths("C:\\Users\\src\\")
// getNodeModulesPaths("\\\\")
// getNodeModulesPaths("\\\\a")
// getNodeModulesPaths("\\\\a\\")
// getNodeModulesPaths("\\\\a\\b")
// getNodeModulesPaths("\\\\a\\b\\")
// getNodeModulesPaths("\\\\Users")
// getNodeModulesPaths("\\\\Users\\")
// getNodeModulesPaths("\\\\Users\\src")
// getNodeModulesPaths("\\\\Users\\src\\")
function getNodeModulesPaths(fromDir: string): string[] {
  const sep = fromDir[0] === "/" ? "/" : "\\";
  let sepIndex = fromDir.length - 1;
  let curDir = fromDir;
  if (curDir[sepIndex] !== sep) {
    curDir += sep;
    sepIndex++;
  }
  const modulePaths = [`${curDir}node_modules`];

  while (0 < --sepIndex) {
    sepIndex = curDir.lastIndexOf(sep, sepIndex);
    if (sepIndex === -1) break;
    curDir = curDir.slice(0, sepIndex + 1);
    modulePaths.push(`${curDir}node_modules`);
  }

  return modulePaths;
}
