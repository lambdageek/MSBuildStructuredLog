using System;
using System.Diagnostics;
using System.IO;
using System.Collections.Generic;

using Microsoft.Build.Logging.StructuredLogger;


namespace StructuredLogViewer.Wasi.Engine;

public sealed class Interactive : IDisposable
{
    private readonly string _binlogPath;
    private readonly Build _build;
    private readonly NodeMapper _nodeIds;
    private readonly NodeCollector _nodeCollector;
    private readonly Sender _sender;
    private readonly Stream _stdOut;

    private Interactive(string binlogPath, Build build, Stream stdOut, Sender sender, NodeMapper nodeIds, NodeCollector nodeCollector)
    {
        _binlogPath = binlogPath;
        _build = build;
        _nodeIds = nodeIds;
        _nodeCollector = nodeCollector;
        _sender = sender;
        _stdOut = stdOut;
    }

    public void Dispose()
    {
        _stdOut.Dispose();
    }

    public static Interactive Create(string binlogPath)
    {
        NodeMapper nodeIds = new();
        NodeCollector nodeCollector = new(nodeIds);

        Stream stdOut = Console.OpenStandardOutput();
        var sender = new Sender(stdOut);

        sender.SendReady();
        var build = BinaryLog.ReadBuild(binlogPath);
        BuildAnalyzer.AnalyzeBuild(build);

        nodeIds.GetOrAssignId(build);
        return new Interactive(binlogPath, build, stdOut, sender, nodeIds, nodeCollector);
    }

    public void RunIteration(ref bool done)
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
                SendNode(_build, requestId);
                break;
            case Command.Node:
                if (int.TryParse(Console.ReadLine(), out var requestedNodeId))
                {
                    if (_nodeIds.FindNodeWithId(requestedNodeId, out BaseNode node))
                    {
                        _nodeCollector.MarkExplored(node);
                        SendNode(node, requestId);
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
                    if (_nodeIds.FindNodeWithId(requestedStartId, out BaseNode start))
                    {
                        BaseNode[] nodes = _nodeCollector.CollectNodes(start, count);
                        SendManyNodes(nodes, requestId);
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
                    if (_nodeIds.FindNodeWithId(requestedSummaryStartId, out BaseNode start))
                    {
                        BaseNode[] nodes = NodesForSummary(start);
                        SendManyNodes(nodes, requestId, true);
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
            case Command.NodeFullText:
                if (int.TryParse(Console.ReadLine(), out var requestedFullTextId))
                {
                    if (_nodeIds.FindNodeWithId(requestedFullTextId, out BaseNode abridgedNode))
                    {
                        var fullText = GetNodeFullText(abridgedNode);
                        var msg = new FullTextMessage()
                        {
                            RequestId = requestId,
                            FullText = fullText,
                        };
                        _sender.SendFullText(msg);
                        break;
                    }
                    else
                    {
                        throw new InvalidOperationException("no full text node with requested id");
                    }
                }
                else
                {
                    throw new InvalidOperationException("can't parse  nodeFullText id");
                }
            default:
                throw new UnreachableException("should not get here");
        }

    }

    public void Finish()
    {
        _sender.SendDone();
    }

    private static bool TryParseCommand(out Command command, out int requestId)
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
            case "nodeFullText":
                command = Command.NodeFullText;
                return true;
            default:
                command = default;
                return false;
        }
    }

    private void SendNode(BaseNode node, int requestId)
    {
        Node replyNode = FormatNode(node);
        var msg = new NodeMessage()
        {
            RequestId = requestId,
            Node = replyNode,
        };
        _sender.SendNode(msg);
    }


    private Node FormatNode(BaseNode node)
    {
        var id = _nodeIds.nodeToId[node];
        int[] childIds = null;
        if (node is TreeNode tn && tn.HasChildren && tn.Children.Count > 0)
        {
            childIds = new int[tn.Children.Count];
            var d = 0;
            foreach (BaseNode childNode in tn.Children)
            {
                var childId = _nodeIds.GetOrAssignId(childNode);
                childIds[d++] = childId;
            }
        }
        var abridged = false;
        string summary = null;
        //if (node.TypeName == "TimedNode" && node is TimedNode timedNode)
        //{
        // timed node subclasses have useful ToString(), but TimedNode itself doesn't.
        //summary = timedNode.GetTimeAndDurationText();
        // shorten?
        //}
        if (node is Item itemNode)
        {
            summary = itemNode.ToString();
        }
        if (summary == null && node is TextNode textNode)
        {
            var shorten = TextUtilities.ShortenValue(textNode.Text, trimPrompt: "…", maxChars: TextUtilities.MaxDisplayedValueLength);
            if (shorten != textNode.Text)
            {
                summary = shorten;
                abridged = true;
            }
            else { summary = textNode.Text; }
        }
        summary ??= node.ToString();
        summary ??= $"[unprintable node of type {node.TypeName}]";
        return new Node
        {
            NodeId = id,
            NodeKind = node.TypeName,
            Abridged = abridged,
            Summary = summary,
            Children = childIds
        };
    }

    public string GetNodeFullText(BaseNode node)
    {
        if (node is TextNode textNode)
        {
            return textNode.Text;
        }
        else
        {
            return node.ToString();
        }
    }
    private void SendManyNodes(BaseNode[] nodes, int requestId, bool firstFullyExplored = false)
    {
        var replyNodes = new Node[nodes.Length];
        int dest = 0;
        for (int i = 0; i < nodes.Length; i++)
        {
            if (nodes[i] == null)
            {
                continue;
            }
            Node formatted = FormatNode(nodes[i]);
            if (firstFullyExplored)
            {
                formatted.FullyExplored = true;
                firstFullyExplored = false;
            }
            replyNodes[dest++] = formatted;
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
        _sender.SendNodes(msg);
    }


    private static BaseNode[] NodesForSummary(BaseNode start)
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
        NodeFullText,
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
}

