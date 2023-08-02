using System;
using System.Data;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StructuredLogViewer.Wasi.Engine;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "command")]
[JsonDerivedType(typeof(QuitCommand), typeDiscriminator: "quit")]
[JsonDerivedType(typeof(RootCommand), typeDiscriminator: "root")]
[JsonDerivedType(typeof(NodeCommand), typeDiscriminator: "node")]
[JsonDerivedType(typeof(ManyNodesCommand), typeDiscriminator: "manyNodes")]
internal abstract class Command
{
    public int RequestId { get; set; }
    [JsonIgnore]
    public abstract CommandType Type { get; }
}

enum CommandType
{
    Quit,
    Root,
    Node,
    ManyNodes,
}


internal class QuitCommand : Command
{
    public static QuitCommand Default = new();

    public override CommandType Type => CommandType.Quit;
}

internal class RootCommand : Command
{
    public static RootCommand Default = new();

    public override CommandType Type => CommandType.Root;
}

internal class NodeCommand : Command
{
    public int NodeId { get; set; }

    public override CommandType Type => CommandType.Node;
}

internal class ManyNodesCommand : Command
{
    public int NodeId { get; set; }
    public int Count { get; set; }

    public override CommandType Type => CommandType.ManyNodes;
}

[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(Command))]
internal partial class CommandSerializerContext : JsonSerializerContext
{
}

// Stream format:
// ([LENGTH][JSON])*
// where LENGTH is an int32 in littleEndian order and indicates the size of the json payload.
// the json payload is in utf8
internal class CommandParser
{

    private readonly Stream _stream;

    public CommandParser(Stream s)
    {
        _stream = s;
    }
    public Command ParseCommand()
    {
        Console.Error.WriteLine($"about to read an int32");
        Span<byte> lenBuf = stackalloc byte[4];
        _stream.ReadExactly(lenBuf);
        var len = (lenBuf[0] - 1) | (lenBuf[1] - 1) << 8 | (lenBuf[2] - 1) << 16 | (lenBuf[3] - 1) << 24;
        Console.Error.WriteLine($"read an int32 value: {len}");
        var buf = new byte[len];
        var bytesRead = 0;
        while (bytesRead < len)
        {
            var i = _stream.ReadByte();
            if (i < 0)
            {
                Console.Error.WriteLine($"wanted {len} bytes but got end of stream after {bytesRead}");
                throw new IOException("end of stream while wanted more bytes");
            }
            buf[bytesRead++] = (byte)i;
        }
        Console.Error.WriteLine($"Wanted {len} bytes, got {bytesRead}");
        var s = Encoding.UTF8.GetString(buf);
        Console.Error.WriteLine($"read a buffer of size {len}, content: <<{s}>>");
        return JsonSerializer.Deserialize(buf, CommandSerializerContext.Default.Command);
    }
}
