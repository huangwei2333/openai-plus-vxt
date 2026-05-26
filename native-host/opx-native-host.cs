using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

public static class OpxNativeHost
{
    private const int MaxNativeMessageBytes = 1024 * 1024;
    private const string BaseUrl = "http://127.0.0.1:8788";

    public static int Main()
    {
        string hostDir = AppDomain.CurrentDomain.BaseDirectory;
        string normalizedHostDir = hostDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string installRoot = Directory.GetParent(normalizedHostDir).FullName;
        string servicePath = Path.Combine(installRoot, "local-service", "server.mjs");
        string nodePath = ReadNodePath(hostDir);

        try
        {
            if (!ReadNativeMessage())
            {
                WriteResponse(false, false, "Native Host did not receive a complete message");
                return 1;
            }
            if (!File.Exists(servicePath))
            {
                WriteResponse(false, false, "Local service was not found: " + servicePath);
                return 2;
            }
            if (IsHealthy())
            {
                WriteResponse(true, false, "Local account service is already running");
                return 0;
            }

            StartService(nodePath, servicePath, installRoot);
            if (WaitUntilHealthy())
            {
                WriteResponse(true, true, "Local account service started");
                return 0;
            }

            WriteResponse(false, true, "Local account service was started, but health check failed");
            return 1;
        }
        catch (Exception error)
        {
            WriteResponse(false, false, error.Message);
            return 1;
        }
    }

    private static void StartService(string nodePath, string servicePath, string workingDirectory)
    {
        string commandPath = Path.Combine(workingDirectory, "run-local-service.cmd");
        string logPath = Path.Combine(workingDirectory, "local-service.log");
        File.WriteAllText(commandPath,
            "@echo off\r\n" +
            "set OPX_LOCAL_STORE_PORT=8788\r\n" +
            "set OPX_LOCAL_STORE_AUTO_EXIT_MS=600000\r\n" +
            "set OPX_LOCAL_STORE_QUIET=1\r\n" +
            Quote(nodePath) + " " + Quote(servicePath) + " > " + Quote(logPath) + " 2>&1\r\n",
            Encoding.ASCII);

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = commandPath,
            WorkingDirectory = workingDirectory,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        Process.Start(startInfo);
    }

    private static bool WaitUntilHealthy()
    {
        for (int attempt = 0; attempt < 20; attempt += 1)
        {
            if (IsHealthy())
            {
                return true;
            }
            Thread.Sleep(250);
        }
        return false;
    }

    private static bool IsHealthy()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(BaseUrl + "/health");
            request.Method = "GET";
            request.Timeout = 1000;
            request.ReadWriteTimeout = 1000;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                return response.StatusCode == HttpStatusCode.OK;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool ReadNativeMessage()
    {
        Stream input = Console.OpenStandardInput();
        byte[] header = ReadExact(input, 4);
        if (header == null)
        {
            return false;
        }

        int length = BitConverter.ToInt32(header, 0);
        if (length <= 0 || length > MaxNativeMessageBytes)
        {
            return false;
        }

        return ReadExact(input, length) != null;
    }

    private static byte[] ReadExact(Stream input, int length)
    {
        byte[] buffer = new byte[length];
        int offset = 0;
        while (offset < length)
        {
            int read = input.Read(buffer, offset, length - offset);
            if (read <= 0)
            {
                return null;
            }
            offset += read;
        }
        return buffer;
    }

    private static void WriteResponse(bool ok, bool started, string message)
    {
        string json = "{\"ok\":" + (ok ? "true" : "false") +
            ",\"started\":" + (started ? "true" : "false") +
            ",\"message\":\"" + EscapeJson(message) + "\"}";
        WriteNativeJson(json);
    }

    private static void WriteNativeJson(string json)
    {
        byte[] payload = Encoding.UTF8.GetBytes(json);
        byte[] length = BitConverter.GetBytes(payload.Length);
        Stream output = Console.OpenStandardOutput();
        output.Write(length, 0, length.Length);
        output.Write(payload, 0, payload.Length);
        output.Flush();
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static string EscapeJson(string value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }

    private static string ReadNodePath(string hostDir)
    {
        string configPath = Path.Combine(hostDir, "opx-native-host.node-path.txt");
        if (!File.Exists(configPath))
        {
            return "node";
        }

        string configured = File.ReadAllText(configPath).Trim();
        return configured.Length > 0 ? configured : "node";
    }
}
