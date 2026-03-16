# mcp-server-db2-luw

MCP server for **IBM DB2 LUW** (Linux/Unix/Windows) 11.x.

Connects via JDBC using a persistent Java subprocess (`Db2Gateway`), so no native Node.js modules are required — only a standard JRE ≥ 11.

## Tools

| Tool | Description |
|------|-------------|
| `list_schemas` | List all schemas in the database |
| `list_tables` | List tables in a schema (supports `%` wildcard filter) |
| `describe_table` | Column details for a table (types, lengths, nullability, defaults) |
| `list_views` | List views in a schema |
| `list_indexes` | List indexes for a table |
| `get_table_constraints` | PK / FK / unique constraints for a table |
| `execute_query` | Execute a read-only `SELECT` query (row limit enforced) |

## Requirements

- Node.js ≥ 18
- Java JDK ≥ 11 (`javac` and `java` on PATH) — only needed to **build**; consumers who install via `npm`/`npx` only need the JRE

### Installing Java

| Platform | Command |
|----------|---------|
| **Windows** (winget) | `winget install Microsoft.OpenJDK.21` |
| **Windows** (manual) | Download `.msi` from [adoptium.net](https://adoptium.net/) |
| **macOS** (Homebrew) | `brew install --cask temurin` |
| **Ubuntu / Debian** | `sudo apt install default-jdk` |
| **RHEL / Fedora** | `sudo dnf install java-21-openjdk-devel` |

After installing, **restart your terminal** so `PATH` is updated, then verify:

```bash
javac -version   # should print: javac 21.x.x (or 11+)
java  -version
```

## JDBC Driver

The IBM DB2 JDBC driver (`db2jcc4.jar`) is **not committed to git** due to its IBM license, but it is handled automatically:

| How you get the package | What happens |
|-------------------------|--------------|
| `npm install` / `npx` | Driver is **bundled inside the npm tarball** — nothing extra needed |
| Clone the git repo | Run `npm run build` — downloads `com.ibm.db2:jcc` from **Maven Central** automatically |

### Manual override

If you want to supply your own driver (e.g. a specific version):

```bash
DB2_JDBC_JAR=/path/to/db2jcc4.jar npm run build
# or override the Maven version downloaded:
DB2JCC_MAVEN_VERSION=11.5.8.0 npm run build
```

## Usage

### GitHub Copilot / Claude (`mcp.json`)

```json
{
  "servers": {
    "db2-luw": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server-db2-luw/index.js"],
      "env": {
        "DB2_HOSTNAME": "127.0.0.1",
        "DB2_PORT":     "50000",
        "DB2_DATABASE": "db_name",
        "DB2_USERNAME": "db_username",
        "DB2_PASSWORD": "your_password",
        "DB2_SCHEMA":   "db_schema"
      }
    }
  }
}
```

### npx (after publish to npm)

```json
{
  "command": "npx",
  "args": ["-y", "mcp-server-db2-luw"]
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB2_HOSTNAME` | ✓ | `localhost` | DB2 server hostname |
| `DB2_PORT` | | `50000` | DB2 port |
| `DB2_DATABASE` | | `trunkdb` | Database name |
| `DB2_USERNAME` | ✓ | — | DB2 username |
| `DB2_PASSWORD` | ✓ | — | DB2 password |
| `DB2_SCHEMA` | | — | Default schema for metadata tools |
| `DB2_JDBC_JAR` | | bundled | Path to a custom `db2jcc4.jar` |
| `QUERY_MAX_LIMIT` | | `1000` | Maximum rows returned per query |
| `DB2JCC_MAVEN_VERSION` | | `11.5.9.0` | Driver version to download if not found locally |
