
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
                        nodeCollector.MarkExplored(node);
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
            case Command.ManyNodes:
                if (int.TryParse(Console.ReadLine(), out var requestedStartId) &&
                    int.TryParse(Console.ReadLine(), out var count))
                {
                    if (nodeIds.FindNodeWithId(requestedStartId, out BaseNode start))
                    {
                        BaseNode[] nodes = nodeCollector.CollectNodes(start, count);
                        SendManyNodes(sender, nodeIds, nodes, requestId);
                        break;
                    }
                    else
                    {
                        throw new InvalidOperationException("no start node with requested id");
                    }
                }
                else
                {
                    throw new InvalidOperationException("can't parse manyNodes id and count");
                }
            case Command.SummarizeNode:
                if (int.TryParse(Console.ReadLine(), out var requestedSummaryStartId))
                {
                    if (nodeIds.FindNodeWithId(requestedSummaryStartId, out BaseNode start))
                    {
                        BaseNode[] nodes = NodesForSummary(start);
                        SendManyNodes(sender, nodeIds, nodes, requestId);
                        break;
                    }
                    else
                    {
                        throw new InvalidOperationException("no start summary node with requested id");
                    }
                }
                else
                {
                    throw new InvalidOperationException("can't parse  summarizeNode id");
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
        case "manyNodes":
            command = Command.ManyNodes;
            return true;
        case "summarizeNode":
            command = Command.SummarizeNode;
            return true;
        default:
            command = default;
            return false;
    }
}

BaseNode[]
NodesForSummary(BaseNode start)
{
    int count = 1;
    if (start is TreeNode treeNode && treeNode.HasChildren && treeNode.Children.Count > 0)
    {
        count += treeNode.Children.Count;
    }
    var nodes = new BaseNode[count];
    int i = 0;
    nodes[i++] = start;
    if (count > 1)
    {
        foreach (BaseNode child in (start as TreeNode).Children)
        {
            nodes[i++] = child;
        }
    }
    return nodes;
}

enum Command
{
    None = 0,
    Quit,
    Root,
    Node,
    ManyNodes,
    SummarizeNode,
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
