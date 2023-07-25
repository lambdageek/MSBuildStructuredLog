
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
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

try
{
    NodeMapper nodeIds = new();

    SendReady();
    var build = BinaryLog.ReadBuild(binlogPath);
    BuildAnalyzer.AnalyzeBuild(build);

    nodeIds.GetOrAssignId(build);

    bool done = false;
    do
    {
        if (!TryParseCommand(out Command command, out string requestId))
        {
            throw new InvalidOperationException("Could not parse command");
        }
        switch (command)
        {
            case Command.Quit:
                done = true;
                break;
            case Command.Root:
                SendNode(nodeIds, build, requestId);
                break;
            case Command.Node:
                if (Int32.TryParse(Console.ReadLine(), out int requestedNodeId))
                {
                    if (nodeIds.FindNodeWithId(requestedNodeId, out BaseNode node))
                    {
                        SendNode(nodeIds, node, requestId);
                        break;
                    }
                    else
                    {
                        throw new InvalidOperationException("no node with requested id");
                    }
                }
                else
                {
                    throw new InvalidOperationException("can't parse node Id");
                }
            default:
                throw new UnreachableException("should not get here");
        }
    } while (!done);
    SendDone();
    return 0;
}
catch (Exception e)
{
    Console.Error.WriteLine($"engine exception: {e}");
    return 1;
}

void
SendReady()
{
    Console.WriteLine("""{"type": "ready"}""");
}

void
SendDone()
{
    Console.WriteLine("""{"type": "done"}""");
}

void
SendNode(NodeMapper nodeIds, BaseNode node, string requestId)
{
    var id = nodeIds.nodeToId[node];
    string children = "";
    if (node is TreeNode tn && tn.HasChildren)
    {
        StringBuilder childIds = new();
        string commaSep = string.Empty;
        bool first = true;
        foreach (var childNode in tn.Children)
        {
            int childId = nodeIds.GetOrAssignId(childNode);
            childIds.Append($"{commaSep}{childId}");
            if (first)
            {
                commaSep = ", ";
                first = false;
            }
        }
        children = $", \"children\": [{childIds}]";
    }
    Console.WriteLine($"{{\"type\": \"node\", \"requestId\": {requestId}, \"nodeId\": {id}, \"summary\": \"{node}\"{children}}}");
    // TODO: send children ids
}

bool
TryParseCommand(out Command command, out string requestId)
{
    requestId = Console.ReadLine();
    string cmd = Console.ReadLine();
    switch (cmd)
    {
        case "quit":
            command = Command.Quit;
            return true;
        case "root":
            command = Command.Root;
            return true;
        case "node":
            command = Command.Node;
            return true;
        default:
            command = default;
            return false;
    }
}


enum Command
{
    None = 0,
    Quit,
    Root,
    Node,
}

class NodeMapper
{
    public readonly Dictionary<BaseNode, int> nodeToId = new();
    public readonly Dictionary<int, BaseNode> idToNode = new();
    private int _nextId;

    public int GetOrAssignId(BaseNode node)
    {
        int id;
        if (!nodeToId.TryGetValue(node, out id))
        {
            id = _nextId++;
            nodeToId.Add(node, id);
            idToNode.Add(id, node);
        }
        return id;
    }

    public bool FindNodeWithId(int id, out BaseNode node)
    {
        return idToNode.TryGetValue(id, out node);
    }

}
