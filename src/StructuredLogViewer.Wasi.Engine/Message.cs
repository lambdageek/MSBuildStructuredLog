using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StructuredLogViewer.Wasi.Engine;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(NodeMessage), typeDiscriminator: "node")]
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

internal class NodeMessage : Message
{
    public int RequestId { get; set; }
    public string Summary { get; set; }
    public string NodeKind { get; set; }
    public int NodeId { get; set; }
    public int[]? Children { get; set; }
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
    }
}
