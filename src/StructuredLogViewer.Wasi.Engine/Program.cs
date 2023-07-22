using System;
using System.IO;

using Microsoft.Build.Logging.StructuredLogger;

SendReady();
do
{
    if (!TryParseCommand(out Command command))
        throw new InvalidOperationException("Could not parse command");
    switch (command)
    {
        case Command.Quit:
            break;
    }
} while (true);
SendDone();

void
SendReady()
{
    Console.WriteLine("""{command: "Ready"}""");
}

void
SendDone()
{
    Console.WriteLine("""{command: "Done"}""");
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

