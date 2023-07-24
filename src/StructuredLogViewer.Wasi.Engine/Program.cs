using System;
using System.IO;

using Microsoft.Build.Logging.StructuredLogger;

if (args.Length < 2 || !string.Equals(args[0], "interactive", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine("usage: StructuredLogViewer.Wasi.Engine interactive FILE.binlog");
    return 1;
}
var binlogPath = args[1];
if (!File.Exists(binlogPath))
{
    Console.Error.WriteLine($"file {binlogPath} does not exist");
    return 1;
}

bool done = false;
SendReady();
do
{
    if (!TryParseCommand(out Command command))
    {
        throw new InvalidOperationException("Could not parse command");
    }
    switch (command)
    {
        case Command.Quit:
            done = true;
            break;
    }
} while (!done);
SendDone();
return 0;

void
SendReady()
{
    Console.WriteLine("""{type: "ready"}""");
}

void
SendDone()
{
    Console.WriteLine("""{type: "done"}""");
}

bool
TryParseCommand(out Command command)
{
    command = Command.Quit;
    return true;
}

enum Command
{
    Quit,
}

