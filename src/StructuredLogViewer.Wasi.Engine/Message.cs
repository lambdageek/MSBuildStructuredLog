using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StructuredLogViewer.Wasi.Engine;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(NodeMessage), typeDiscriminator: "node")]
[JsonDerivedType(typeof(ManyNodesMessage), typeDiscriminator: "manyNodes")]
[JsonDerivedType(typeof(FullTextMessage), typeDiscriminator: "fullText")]
[JsonDerivedType(typeof(ReadyMessage), typeDiscriminator: "ready")]
[JsonDerivedType(typeof(DoneMessage), typeDiscriminator: "done")]
internal class Message
{
}

internal class ReadyMessage : Message
{
    public static ReadyMessage Default = new();
}

internal class DoneMessage : Message
{
    public static DoneMessage Default = new();
}

internal class Node
{
    public string Summary { get; set; }
    public bool Abridged { get; set; }
    public bool FullyExplored { get; set; }
    public string NodeKind { get; set; }
    public int NodeId { get; set; }
    public int[]? Children { get; set; }

}

internal class NodeMessage : Message
{
    public int RequestId { get; set; }
    public Node Node { get; set; }
}

internal class ManyNodesMessage : Message
{
    public int RequestId { get; set; }
    public Node[] Nodes { get; set; }
}

internal class FullTextMessage : Message
{
    public int RequestId { get; set; }
    public string FullText { get; set; }
}

[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(Message))]
internal partial class MessageSerializerContext : JsonSerializerContext
{
}

internal class Sender
{
    private Stream stream;
    public Sender(Stream stream)
    {
        this.stream = stream;
    }

    public void SendReady()
    {
        JsonSerializer.Serialize(stream, ReadyMessage.Default, MessageSerializerContext.Default.Message);
    }

    public void SendDone()
    {
        JsonSerializer.Serialize(stream, DoneMessage.Default, MessageSerializerContext.Default.Message);
    }

    public void SendNode(NodeMessage message)
    {
        JsonSerializer.Serialize(stream, message, MessageSerializerContext.Default.Message);
        stream.Flush();
    }

    public void SendNodes(ManyNodesMessage message)
    {
        var s = JsonSerializer.Serialize(message, MessageSerializerContext.Default.Message);
        var bs = System.Text.Encoding.UTF8.GetBytes(s);
        Console.Error.WriteLine($"Sending a response of length: {bs.Length}");
        int offset = 0;
        //HACK: vscode-wasi can't handle more than 16kB writes at once to a pipe or character device
        while (offset < bs.Length)
        {
            var span = new ReadOnlySpan<byte>(bs, offset, Math.Min(bs.Length - offset, 16384));
            stream.Write(span);
            offset += span.Length;
        }
        stream.Flush();
    }

    public void SendFullText(FullTextMessage message)
    {
        JsonSerializer.Serialize(stream, message, MessageSerializerContext.Default.Message);
        stream.Flush();
    }
}
