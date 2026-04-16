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

        public async Task<User> CreateAsync(string login, string userName, string userSurname, string email, string password, string confirmPassword, string companyName,
            string companyPosition)
        {
            var user = new User
            {
                Login = login,
                UserName = userName,
                UserSurname = userSurname,
                Password = password, // Ensure password is hashed securely
                ConfirmPassword = confirmPassword,
                CompanyName = companyName,
                CompanyPosition = companyPosition
            };
            user.Email = email;

            // Save user to the database
            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return user;
        }

        public async Task<bool> ValidateCredentialsAsync(string login, string password)
        {
            var user = await GetByLoginAsync(login);
            return user != null && user.Password == password;
        }

        public async Task<User?> GetByIdAsync(int id)
        {
            return await _context.Users.FindAsync(id);
        }

        public async Task<IEnumerable<User>> GetAllAsync()
        {
            return await _context.Users.ToListAsync();
        }
    }
}
