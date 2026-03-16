#!/usr/bin/env node
/**
 * Cross-platform build script for mcp-server-db2-luw
 * Works on Windows, macOS and Linux — replaces build.sh for npm scripts.
 *
 * Builds only Db2Gateway.jar.
 * The DB2 JDBC driver (db2jcc4.jar / jcc-<version>.jar) is resolved at runtime.
 */

import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const JAVA_DIR   = join(__dirname, "java");
const SRC_DIR    = join(JAVA_DIR, "src");
const CLASSES_DIR = join(JAVA_DIR, "classes");
const GATEWAY_JAR = join(JAVA_DIR, "Db2Gateway.jar");

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
  // Compile Db2Gateway.java
  console.log("Compiling Db2Gateway.java...");
  mkdirSync(CLASSES_DIR, { recursive: true });
  exec(
    `javac -source 11 -target 11` +
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

