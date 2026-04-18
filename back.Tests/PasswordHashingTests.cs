using BCrypt.Net;

namespace back.Tests;

public class PasswordHashingTests
{
    [Fact]
    public void HashPassword_ProducesBcryptHash()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("secret123");
        Assert.StartsWith("$2", hash);
    }

    [Fact]
    public void Verify_CorrectPassword_ReturnsTrue()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("myPassword");
        Assert.True(BCrypt.Net.BCrypt.Verify("myPassword", hash));
    }

    [Fact]
    public void Verify_WrongPassword_ReturnsFalse()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("myPassword");
        Assert.False(BCrypt.Net.BCrypt.Verify("wrongPassword", hash));
    }

    [Fact]
    public void HashPassword_SameInput_ProducesDifferentHashes()
    {
        var hash1 = BCrypt.Net.BCrypt.HashPassword("password");
        var hash2 = BCrypt.Net.BCrypt.HashPassword("password");
        Assert.NotEqual(hash1, hash2);
    }
}
