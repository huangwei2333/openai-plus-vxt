using System;
using System.Diagnostics;
using System.IO;

public static class OpxNativeHost
{
    public static int Main()
    {
        string hostDir = AppDomain.CurrentDomain.BaseDirectory;
        string launcherPath = Path.Combine(hostDir, "launcher.mjs");
        string nodePath = ReadNodePath(hostDir);
        if (!File.Exists(launcherPath))
        {
            return 2;
        }

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = nodePath,
            Arguments = Quote(launcherPath),
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using (Process process = Process.Start(startInfo))
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
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
