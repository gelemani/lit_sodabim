namespace back.Tests;

public class FileValidationTests
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".ifc", ".ifczip", ".pdf", ".docx", ".xlsx", ".dwg", ".rvt", ".png", ".jpg", ".jpeg"
    };

    private const long MaxFileSizeBytes = 524_288_000; // 500 МБ

    private static bool IsAllowed(string fileName, long size)
    {
        var ext = Path.GetExtension(fileName);
        return AllowedExtensions.Contains(ext) && size <= MaxFileSizeBytes;
    }

    [Theory]
    [InlineData("model.ifc", 1_000)]
    [InlineData("plan.pdf", 5_000_000)]
    [InlineData("drawing.dwg", 100)]
    [InlineData("image.png", 500)]
    public void AllowedFile_PassesValidation(string fileName, long size)
    {
        Assert.True(IsAllowed(fileName, size));
    }

    [Theory]
    [InlineData("virus.exe", 100)]
    [InlineData("script.sh", 100)]
    [InlineData("hack.bat", 100)]
    [InlineData("data.zip", 100)]
    public void DisallowedExtension_FailsValidation(string fileName, long size)
    {
        Assert.False(IsAllowed(fileName, size));
    }

    [Fact]
    public void FileExceedingMaxSize_FailsValidation()
    {
        Assert.False(IsAllowed("big.ifc", MaxFileSizeBytes + 1));
    }

    [Fact]
    public void ExtensionCheck_IsCaseInsensitive()
    {
        Assert.True(IsAllowed("model.IFC", 100));
        Assert.True(IsAllowed("PLAN.PDF", 100));
    }
}
