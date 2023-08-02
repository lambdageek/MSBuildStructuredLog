
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
    NodeCollector nodeCollector = new(nodeIds);

    using var stdOut = Console.OpenStandardOutput();
    var sender = new Sender(stdOut);

    sender.SendReady();
    using var stdIn = Console.OpenStandardInput();
    var parser = new CommandParser(stdIn);

    var build = BinaryLog.ReadBuild(binlogPath);
    BuildAnalyzer.AnalyzeBuild(build);

    nodeIds.GetOrAssignId(build);

    bool done = false;
    do
    {
        var command = parser.ParseCommand();
        Console.Error.WriteLine($"parsed a command of type {command.GetType().Name}");
        switch (command.Type)
        {
            case CommandType.Quit:
                done = true;
                break;
            case CommandType.Root:
                SendNode(sender, nodeIds, build, command.RequestId);
                break;
            case CommandType.Node:
                var nodeCommand = command as NodeCommand;
                if (nodeIds.FindNodeWithId(nodeCommand.NodeId, out BaseNode node))
                {
                    nodeCollector.MarkExplored(node);
                    SendNode(sender, nodeIds, node, nodeCommand.RequestId);
                    break;
                }
                else
                {
                    throw new InvalidOperationException("no node with requested id");
                }
            case CommandType.ManyNodes:
                var manyNodesCommand = command as ManyNodesCommand;
                if (nodeIds.FindNodeWithId(manyNodesCommand.NodeId, out BaseNode start))
                {
                    BaseNode[] nodes = nodeCollector.CollectNodes(start, manyNodesCommand.Count);
                    SendManyNodes(sender, nodeIds, nodes, manyNodesCommand.RequestId);
                    break;
                }
                else
                {
                    throw new InvalidOperationException("no start node with requested id");
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

Node FormatNode(NodeMapper nodeIds, BaseNode node)
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
    return new Node
    {
        NodeId = id,
        NodeKind = node.GetType().FullName,
        Summary = summary,
        Children = childIds
    };
}

void
SendNode(Sender sender, NodeMapper nodeIds, BaseNode node, int requestId)
{
    Node replyNode = FormatNode(nodeIds, node);
    var msg = new NodeMessage()
    {
        RequestId = requestId,
        Node = replyNode,
    };
    sender.SendNode(msg);
}

void
SendManyNodes(Sender sender, NodeMapper nodeIds, BaseNode[] nodes, int requestId)
{
    var replyNodes = new Node[nodes.Length];
    int dest = 0;
    for (int i = 0; i < nodes.Length; i++)
    {
        if (nodes[i] == null)
        {
            continue;
        }
        replyNodes[dest++] = FormatNode(nodeIds, nodes[i]);
    }
    if (dest < nodes.Length)
    {
        Array.Resize<Node>(ref replyNodes, dest);
    }
    var msg = new ManyNodesMessage()
    {
        RequestId = requestId,
        Nodes = replyNodes,
    };
    sender.SendNodes(msg);
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

    public bool IsAssigned(BaseNode node)
    {
        return nodeToId.ContainsKey(node);
    }

    public bool FindNodeWithId(int id, out BaseNode node)
    {
        return idToNode.TryGetValue(id, out node);
    }

}

class NodeCollector
{
    readonly Queue<BaseNode> _globalLeftovers;
    readonly HashSet<int> _explored;
    readonly NodeMapper _nodeMapper;
    public NodeCollector(NodeMapper nodeMapper)
    {
        _globalLeftovers = new();
        _explored = new();
        _nodeMapper = nodeMapper;

    }

    public bool MarkExplored(BaseNode node)
    {
        int id = _nodeMapper.GetOrAssignId(node);
        return _explored.Add(id);
    }
    public BaseNode[] CollectNodes(BaseNode start, int count, bool appendLeftovers = false)
    {
        var results = new BaseNode[count];
        Queue<BaseNode> workQueue = new();
        int added = 0;
        workQueue.Enqueue(start);
        do
        {
            while (added < count && workQueue.TryDequeue(out BaseNode workNode))
            {
                if (MarkExplored(workNode))
                {
                    results[added++] = workNode;
                }
                if (workNode is TreeNode parent)
                {
                    foreach (var child in parent.Children)
                    {
                        workQueue.Enqueue(child);
                    }
                }
            }
            /* if we didn't finish with the local work, put it on the global leftovers queue */
            foreach (BaseNode leftover in workQueue)
            {
                _globalLeftovers.Enqueue(leftover);
            }
            workQueue.Clear();
            /* if we don't want extra stuff, we're done */
            if (!appendLeftovers)
            {
                return results;
            }
            /* otherwise, maybe we have room for some leftovers? */
            if (added < count && _globalLeftovers.TryDequeue(out BaseNode leftoverNode))
            {
                /* enqueue more work and go around again */
                workQueue.Enqueue(leftoverNode);
            }
            else
            {
                /* either we have enough nodes added, or there's no global work left, we're done */
                break;
            }
        } while (true);
        return results;
    }
}
