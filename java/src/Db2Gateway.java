import java.sql.*;
import java.io.*;
import java.util.Base64;

/**
 * Persistent Java subprocess that bridges Node.js MCP server to DB2 LUW via JDBC.
 *
 * Protocol (stdin → process, newline-delimited):
 *   <id>\t<base64(sql)>\t<base64(param1)>\t<base64(param2)>...
 *
 * Protocol (process → stdout, newline-delimited JSON):
 *   {"id":"<id>","columns":["col1",...],"rows":[["val",...],...],"rowCount":<n>}
 *   {"id":"<id>","rowsAffected":<n>}
 *   {"id":"<id>","error":"<message>"}
 *
 * Startup signal (first line on stdout):
 *   {"ready":true}
 */
public class Db2Gateway {

    public static void main(String[] args) throws Exception {
        String url      = System.getenv("DB2_JDBC_URL");
        String user     = System.getenv("DB2_USER");
        String password = System.getenv("DB2_PASSWORD");

        PrintStream out = new PrintStream(System.out, true, "UTF-8");
        PrintStream err = new PrintStream(System.err, true, "UTF-8");

        if (url == null || user == null || password == null) {
            out.println("{\"ready\":false,\"error\":\"Missing DB2_JDBC_URL, DB2_USER or DB2_PASSWORD env vars\"}");
            System.exit(1);
        }

        Connection conn;
        try {
            Class.forName("com.ibm.db2.jcc.DB2Driver");
            conn = DriverManager.getConnection(url, user, password);
            conn.setAutoCommit(false);
            conn.setReadOnly(true);
        } catch (Exception e) {
            out.println("{\"ready\":false,\"error\":" + jsonStr(e.getMessage()) + "}");
            System.exit(1);
            return;
        }

        out.println("{\"ready\":true}");

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty()) continue;

            String[] parts = line.split("\t", -1);
            if (parts.length < 2) {
                err.println("Malformed input: " + line);
                continue;
            }

            String id  = parts[0];
            String sql;
            try {
                sql = new String(Base64.getDecoder().decode(parts[1]), "UTF-8");
            } catch (Exception e) {
                out.println("{\"id\":" + jsonStr(id) + ",\"error\":\"Failed to decode SQL: " + e.getMessage() + "\"}");
                continue;
            }

            String[] params = new String[parts.length - 2];
            boolean decodeError = false;
            for (int i = 2; i < parts.length; i++) {
                try {
                    params[i - 2] = new String(Base64.getDecoder().decode(parts[i]), "UTF-8");
                } catch (Exception e) {
                    out.println("{\"id\":" + jsonStr(id) + ",\"error\":\"Failed to decode param " + (i-2) + ": " + e.getMessage() + "\"}");
                    decodeError = true;
                    break;
                }
            }
            if (decodeError) continue;

            try {
                String result = execute(conn, id, sql, params);
                out.println(result);
            } catch (Exception e) {
                // Try to reconnect once on connection errors
                if (e instanceof SQLException) {
                    try {
                        conn.close();
                    } catch (Exception ignored) {}
                    try {
                        conn = DriverManager.getConnection(url, user, password);
                        conn.setAutoCommit(false);
                        conn.setReadOnly(true);
                        String result = execute(conn, id, sql, params);
                        out.println(result);
                    } catch (Exception e2) {
                        out.println("{\"id\":" + jsonStr(id) + ",\"error\":" + jsonStr(e2.getMessage()) + "}");
                    }
                } else {
                    out.println("{\"id\":" + jsonStr(id) + ",\"error\":" + jsonStr(e.getMessage()) + "}");
                }
            }
        }

        try { conn.close(); } catch (Exception ignored) {}
    }

    static String execute(Connection conn, String id, String sql, String[] params) throws SQLException {
        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                stmt.setString(i + 1, params[i]);
            }

            String upper = sql.trim().toUpperCase();
            boolean isSelect = upper.startsWith("SELECT") || upper.startsWith("WITH") || upper.startsWith("VALUES");

            if (isSelect) {
                try (ResultSet rs = stmt.executeQuery()) {
                    ResultSetMetaData meta = rs.getMetaData();
                    int colCount = meta.getColumnCount();

                    StringBuilder sb = new StringBuilder();
                    sb.append("{\"id\":").append(jsonStr(id));
                    sb.append(",\"columns\":[");
                    for (int i = 1; i <= colCount; i++) {
                        if (i > 1) sb.append(",");
                        sb.append(jsonStr(meta.getColumnName(i)));
                    }
                    sb.append("],\"rows\":[");

                    int rowCount = 0;
                    while (rs.next()) {
                        if (rowCount > 0) sb.append(",");
                        sb.append("[");
                        for (int i = 1; i <= colCount; i++) {
                            if (i > 1) sb.append(",");
                            Object val = rs.getObject(i);
                            if (rs.wasNull() || val == null) {
                                sb.append("null");
                            } else {
                                sb.append(jsonStr(val.toString()));
                            }
                        }
                        sb.append("]");
                        rowCount++;
                    }
                    sb.append("],\"rowCount\":").append(rowCount).append("}");
                    return sb.toString();
                }
            } else {
                int affected = stmt.executeUpdate();
                return "{\"id\":" + jsonStr(id) + ",\"rowsAffected\":" + affected + "}";
            }
        }
    }

    static String jsonStr(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append("\"");
        return sb.toString();
    }
}

