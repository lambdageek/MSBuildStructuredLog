
using System;
using System.IO;
using StructuredLogViewer.Vscode.Engine;

if (args.Length < 2 || !string.Equals(args[0], "interactive", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine("usage: StructuredLogViewer.Vscode.Engine interactive FILE.binlog");
    return 1;
}

var binlogPath = args[1];
if (!File.Exists(binlogPath))
{
    Console.Error.WriteLine($"file {binlogPath} does not exist");
    return 1;
}

try
{
    using var interactive = Interactive.Create(binlogPath);

    var done = false;
    do
    {
        interactive.RunIteration(ref done);
    } while (!done);
    interactive.Finish();
    return 0;
}
catch (Exception e)
{
    Console.Error.WriteLine($"engine exception: {e}");
    return 1;
}


