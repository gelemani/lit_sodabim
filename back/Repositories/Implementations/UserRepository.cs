using Microsoft.EntityFrameworkCore;
using B.Models;
using B.Data;
using B.Repositories.Interfaces;

namespace B.Repositories.Implementations
{
    public class UserRepository : IUserRepository
    {
        private readonly DatabaseContext _context;

        public UserRepository(DatabaseContext context)
        {
            _context = context;
        }

        public async Task<User?> GetByLoginAsync(string login)
        {
            return await _context.Users
                .FirstOrDefaultAsync(u => u.Login == login || u.Email == login);
        }

        public async Task<User?> GetByLoginOrEmailAsync(string login, string email)
        {
            return await _context.Users
                .FirstOrDefaultAsync(u => u.Login == login || u.Email == email);
        }

        public async Task<User> CreateAsync(string login, string userName, string userSurname, string email,
            string password, string confirmPassword, string companyName, string companyPosition)
        {
            var user = new User
            {
                Login = login,
                UserName = userName,
                UserSurname = userSurname,
                Password = BCrypt.Net.BCrypt.HashPassword(password),
                ConfirmPassword = "",
                Email = email,
                CompanyName = companyName,
                CompanyPosition = companyPosition
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();
            return user;
        }

        public async Task<bool> ValidateCredentialsAsync(string login, string password)
        {
            var user = await GetByLoginAsync(login);
            if (user == null) return false;

            // поддержка обоих форматов: bcrypt-хэш и легаси-plaintext
            if (user.Password.StartsWith("$2"))
                return BCrypt.Net.BCrypt.Verify(password, user.Password);

            // миграция легаси-аккаунта на bcrypt при первом входе
            if (user.Password == password)
            {
                user.Password = BCrypt.Net.BCrypt.HashPassword(password);
                await _context.SaveChangesAsync();
                return true;
            }

            return false;
        }

        public async Task<User?> GetByIdAsync(int id)
        {
            return await _context.Users.FindAsync(id);
        }

        public async Task<IEnumerable<User>> GetAllAsync()
        {
            return await _context.Users.ToListAsync();
        }

        public async Task<User> UpdateProfileAsync(int id, string userName, string userSurname, string email, string companyName, string companyPosition)
        {
            var user = await _context.Users.FindAsync(id)
                ?? throw new KeyNotFoundException($"User {id} not found");

            // Проверяем, не занят ли email другим пользователем
            var emailTaken = await _context.Users
                .AnyAsync(u => u.Email == email && u.Id != id);
            if (emailTaken)
                throw new InvalidOperationException("Email уже используется другим пользователем.");

            user.UserName = userName;
            user.UserSurname = userSurname;
            user.Email = email;
            user.CompanyName = companyName;
            user.CompanyPosition = companyPosition;

            await _context.SaveChangesAsync();
            return user;
        }

        public async Task<bool> ChangePasswordAsync(int id, string currentPassword, string newPassword)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return false;

            // Проверяем текущий пароль (поддержка bcrypt и legacy)
            bool currentValid;
            if (user.Password.StartsWith("$2"))
                currentValid = BCrypt.Net.BCrypt.Verify(currentPassword, user.Password);
            else
                currentValid = user.Password == currentPassword;

            if (!currentValid) return false;

            user.Password = BCrypt.Net.BCrypt.HashPassword(newPassword);
            await _context.SaveChangesAsync();
            return true;
        }
    }
}
