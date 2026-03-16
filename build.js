#!/usr/bin/env node
/**
 * Cross-platform build script for mcp-server-db2-luw
 * Works on Windows, macOS and Linux — replaces build.sh for npm scripts.
 *
 * JAR resolution order for db2jcc4.jar:
 *   1. Already present in java/      (npm install or previous build)
 *   2. DB2_JDBC_JAR env var          (user-supplied path)
 *   3. Download com.ibm.db2:jcc from Maven Central (automatic fallback)
 */

import { existsSync, copyFileSync, mkdirSync, rmSync, createWriteStream } from "fs";
import { execSync } from "child_process";
import { get } from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const JAVA_DIR   = join(__dirname, "java");
const SRC_DIR    = join(JAVA_DIR, "src");
const CLASSES_DIR = join(JAVA_DIR, "classes");
const BUNDLED_JAR = join(JAVA_DIR, "db2jcc4.jar");
const GATEWAY_JAR = join(JAVA_DIR, "Db2Gateway.jar");

const MAVEN_VERSION = process.env.DB2JCC_MAVEN_VERSION || "11.5.9.0";
const MAVEN_URL = `https://repo1.maven.org/maven2/com/ibm/db2/jcc/${MAVEN_VERSION}/jcc-${MAVEN_VERSION}.jar`;

// Path separator is ; on Windows, : on Unix
const CP_SEP = process.platform === "win32" ? ";" : ":";

function findDb2jcc() {
  // 1. Already bundled in java/
  for (const name of ["db2jcc4.jar", `jcc-${MAVEN_VERSION}.jar`]) {
    const p = join(JAVA_DIR, name);
    if (existsSync(p)) return p;
  }
  // 2. User-supplied via env var
  const envJar = process.env.DB2_JDBC_JAR;
  if (envJar && existsSync(envJar)) return envJar;
  return null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) =>
      get(u, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${u}`));
        }

        const total    = parseInt(res.headers["content-length"] || "0", 10);
        let received   = 0;
        const file     = createWriteStream(dest);

        res.on("data", (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r  Downloading... ${pct}%`);
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            process.stdout.write("\n");
            resolve();
          });
        });
        file.on("error", (e) => { rmSync(dest, { force: true }); reject(e); });
      }).on("error", reject);

    follow(url);
  });
}

function javaInstallInstructions() {
  const lines = [
    "",
    "Java JDK 11+ is required but 'javac' was not found on PATH.",
    "",
    "Install the JDK:",
  ];
  if (process.platform === "win32") {
    lines.push(
      "  Windows (winget):  winget install Microsoft.OpenJDK.21",
      "  Windows (manual):  https://adoptium.net/  →  download Windows .msi installer",
      "",
      "  After installing, restart your terminal so PATH is updated.",
      "  Verify with:  javac -version",
    );
  } else if (process.platform === "darwin") {
    lines.push(
      "  macOS (Homebrew):  brew install --cask temurin",
      "  macOS (manual):    https://adoptium.net/",
      "",
      "  Verify with:  javac -version",
    );
  } else {
    lines.push(
      "  Ubuntu/Debian:  sudo apt install default-jdk",
      "  RHEL/Fedora:    sudo dnf install java-21-openjdk-devel",
      "  Manual:         https://adoptium.net/",
      "",
      "  Verify with:  javac -version",
    );
  }
  lines.push("");
  return lines.join("\n");
}

function exec(cmd) {
  console.log(`$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    // Detect missing javac / jar and give actionable guidance
    const msg = err.message || "";
    const isJavaToolMissing =
      msg.includes("javac") || msg.includes("jar ") ||
      msg.includes("not recognized") || msg.includes("not found") ||
      err.code === 127; // POSIX "command not found"
    if (isJavaToolMissing && (cmd.startsWith("javac") || cmd.startsWith("jar"))) {
      console.error(javaInstallInstructions());
    }
    throw err;
  }
}

async function main() {
  let db2jcc = findDb2jcc();

  if (!db2jcc) {
    console.log("db2jcc4.jar not found — downloading from Maven Central...");
    console.log(`  URL: ${MAVEN_URL}`);
    await download(MAVEN_URL, BUNDLED_JAR);
    db2jcc = BUNDLED_JAR;
    console.log(`Downloaded: ${db2jcc}`);
  }

  console.log(`Using JDBC driver: ${db2jcc}`);

  // Copy into java/ if it came from outside
  if (db2jcc !== BUNDLED_JAR) {
    copyFileSync(db2jcc, BUNDLED_JAR);
  }

  // Compile Db2Gateway.java
  console.log("Compiling Db2Gateway.java...");
  mkdirSync(CLASSES_DIR, { recursive: true });
  exec(
    `javac -source 11 -target 11` +
    ` -cp "${BUNDLED_JAR}"` +
    ` -d "${CLASSES_DIR}"` +
    ` "${join(SRC_DIR, "Db2Gateway.java")}"`
  );

  // Package into Db2Gateway.jar
  console.log("Creating Db2Gateway.jar...");
  exec(`jar cf "${GATEWAY_JAR}" -C "${CLASSES_DIR}" .`);
  rmSync(CLASSES_DIR, { recursive: true, force: true });

  console.log(`Build complete: ${GATEWAY_JAR}`);
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}`);
  process.exit(1);
});

