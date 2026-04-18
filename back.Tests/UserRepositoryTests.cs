using B.Data;
using B.Repositories.Implementations;
using Microsoft.EntityFrameworkCore;

namespace back.Tests;

public class UserRepositoryTests
{
    private DatabaseContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<DatabaseContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new DatabaseContext(options);
    }

    [Fact]
    public async Task CreateAsync_StoresBcryptHash()
    {
        await using var ctx = CreateInMemoryContext();
        var repo = new UserRepository(ctx);

        var user = await repo.CreateAsync("user1", "Иван", "Иванов", "user@test.ru",
            "plaintext", "", "ООО Тест", "Инженер");

        Assert.StartsWith("$2", user.Password);
    }

    [Fact]
    public async Task ValidateCredentialsAsync_CorrectPassword_ReturnsTrue()
    {
        await using var ctx = CreateInMemoryContext();
        var repo = new UserRepository(ctx);

        await repo.CreateAsync("user2", "Пётр", "Петров", "p@test.ru",
            "pass123", "", "ООО Тест", "Архитектор");

        var result = await repo.ValidateCredentialsAsync("user2", "pass123");
        Assert.True(result);
    }

    [Fact]
    public async Task ValidateCredentialsAsync_WrongPassword_ReturnsFalse()
    {
        await using var ctx = CreateInMemoryContext();
        var repo = new UserRepository(ctx);

        await repo.CreateAsync("user3", "Анна", "Сидорова", "a@test.ru",
            "correct", "", "ООО Тест", "Менеджер");

        var result = await repo.ValidateCredentialsAsync("user3", "wrong");
        Assert.False(result);
    }

    [Fact]
    public async Task ValidateCredentialsAsync_LegacyPlaintextPassword_MigratesAndReturnsTrue()
    {
        await using var ctx = CreateInMemoryContext();
        var repo = new UserRepository(ctx);

        // Симулируем легаси-аккаунт с plaintext-паролем
        var user = new B.Models.User
        {
            Login = "legacy",
            UserName = "Иван",
            UserSurname = "Иванов",
            Email = "l@test.ru",
            Password = "plaintext_password",
            ConfirmPassword = "",
            CompanyName = "ООО",
            CompanyPosition = "ИТ"
        };
        ctx.Users.Add(user);
        await ctx.SaveChangesAsync();

        var result = await repo.ValidateCredentialsAsync("legacy", "plaintext_password");
        Assert.True(result);

        // Пароль должен быть автоматически мигрирован в bcrypt
        var updated = await ctx.Users.FindAsync(user.Id);
        Assert.NotNull(updated);
        Assert.StartsWith("$2", updated!.Password);
    }

    [Fact]
    public async Task GetByLoginAsync_LoginOrEmail_FindsUser()
    {
        await using var ctx = CreateInMemoryContext();
        var repo = new UserRepository(ctx);

        await repo.CreateAsync("john", "Джон", "Доу", "john@test.ru",
            "pw", "", "ООО", "Инженер");

        Assert.NotNull(await repo.GetByLoginAsync("john"));
        Assert.NotNull(await repo.GetByLoginAsync("john@test.ru"));
        Assert.Null(await repo.GetByLoginAsync("unknown"));
    }
}
