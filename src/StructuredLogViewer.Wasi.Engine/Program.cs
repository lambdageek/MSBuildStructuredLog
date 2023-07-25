
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using Microsoft.Build.Logging.StructuredLogger;
using StructuredLogViewer.Wasi.Engine;

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

    using var stdOut = Console.OpenStandardOutput();
    var sender = new Sender(stdOut);

    sender.SendReady();
    var build = BinaryLog.ReadBuild(binlogPath);
    BuildAnalyzer.AnalyzeBuild(build);

    nodeIds.GetOrAssignId(build);

    bool done = false;
    do
    {
        if (!TryParseCommand(out Command command, out int requestId))
        {
            throw new InvalidOperationException("Could not parse command");
        }
        switch (command)
        {
            case Command.Quit:
                done = true;
                break;
            case Command.Root:
                SendNode(sender, nodeIds, build, requestId);
                break;
            case Command.Node:
                if (int.TryParse(Console.ReadLine(), out var requestedNodeId))
                {
                    if (nodeIds.FindNodeWithId(requestedNodeId, out BaseNode node))
                    {
                        SendNode(sender, nodeIds, node, requestId);
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
    sender.SendDone();
    return 0;
}
catch (Exception e)
{
    Console.Error.WriteLine($"engine exception: {e}");
    return 1;
}

void
SendNode(Sender sender, NodeMapper nodeIds, BaseNode node, int requestId)
{
    var id = nodeIds.nodeToId[node];
    int[] childIds = null;
    if (node is TreeNode tn && tn.HasChildren && tn.Children.Count > 0)
    {
        childIds = new int[tn.Children.Count];
        int d = 0;
        foreach (BaseNode childNode in tn.Children)
        {
            var childId = nodeIds.GetOrAssignId(childNode);
            childIds[d++] = childId;
        }
    }
    var summary = node.ToString();
    summary ??= $"[unprintable node of type {node.GetType()}]";
    var msg = new NodeMessage()
    {
        RequestId = requestId,
        NodeId = id,
        Summary = summary,
        Children = childIds
    };
    sender.SendNode(msg);
}

bool
TryParseCommand(out Command command, out int requestId)
{
    var requestIdStr = Console.ReadLine();
    if (!int.TryParse(requestIdStr, out requestId))
    {
        command = default;
        return false;
    }
    var cmd = Console.ReadLine();
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
        if (!nodeToId.TryGetValue(node, out var id))
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
